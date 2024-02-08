import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  STAFF_ROLES,
  USER_STATUSES,
  VERIFICATION_STATUSES,
  formatTime,
  normalizeEthiopianPhone,
  type OpsMatchRowDto,
  type OpsOrgRowDto,
  type OpsTripDetailDto,
  type OpsTripRowDto,
  type OpsUserRowDto,
  type Paged,
  type ShipmentSummaryDto,
  type StaffRole,
  type TripStatus,
  type TruckOptionDto,
  type UserStatus,
  type VehicleDto,
  type VerificationStatus,
} from '@raha/contracts';
import { hashPassword } from '../../common/crypto';
import { badRequest, conflict, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { DriverProfile, Membership, Organization, Shipment, Trip, User, Vehicle } from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { FleetService } from '../fleet/fleet.service';
import { MatchesService } from '../matching/matches.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReferenceService } from '../reference/reference.service';
import { SHIPMENT_RELATIONS, ShipmentViewService } from '../shipments/shipment-view.service';
import { buildStrip } from '../trips/strip';
import { TRIP_RELATIONS, TripsService } from '../trips/trips.service';
import { decryptString, randomToken } from '../../common/crypto';
import { loadEnv } from '../../config/env';
import { LATE_CHECKIN_HOURS } from './ops-overview.service';

export class UpdateUserDto {
  @IsOptional() @IsIn(USER_STATUSES) status?: UserStatus;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) fullName?: string;
  @IsOptional() @IsIn(STAFF_ROLES) staffRole?: StaffRole;
}

export class CreateStaffDto {
  @IsString() @MinLength(2) @MaxLength(120) fullName: string;
  @IsString() @MinLength(9) @MaxLength(20) phone: string;
  @IsEmail() email: string;
  @IsString() @MinLength(10) @MaxLength(200) password: string;
  @IsIn(STAFF_ROLES) staffRole: StaffRole;
}

export class UpdateOrgStatusDto {
  @IsIn(VERIFICATION_STATUSES) verification: VerificationStatus;
}

export class AssignMatchDto {
  @IsUUID() capacityPostId: string;
  @IsOptional() priceEtb?: number;
  /** Both sides agreed by phone — confirm immediately. */
  @IsOptional() confirmNow?: boolean;
}

export class ManualCheckinDto {
  @IsUUID() placeId: string;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class ReviewDeliveryDto {
  @IsIn(['ok', 'escalate']) outcome: 'ok' | 'escalate';
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

const pageOf = <T>(items: T[], total: number, page: number, pageSize: number): Paged<T> => ({ items, total, page, pageSize });

@Injectable()
export class OpsDirectoryService {
  private readonly env = loadEnv();

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(DriverProfile) private readonly drivers: Repository<DriverProfile>,
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    private readonly view: ShipmentViewService,
    private readonly fleet: FleetService,
    private readonly matching: MatchingService,
    private readonly matches: MatchesService,
    private readonly tripsService: TripsService,
    private readonly reference: ReferenceService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────── shipments ─────────────────────────

  async shipmentList(q: { status?: string; q?: string; source?: string; page?: number; pageSize?: number }): Promise<Paged<ShipmentSummaryDto>> {
    const page = q.page ?? 1;
    const pageSize = Math.min(q.pageSize ?? 30, 100);
    const qb = this.shipments.createQueryBuilder('s');
    for (const [rel, alias] of [['shipperOrg', 'so'], ['loggedByOrg', 'lo'], ['pickupPlace', 'pp'], ['dropoffPlace', 'dp']] as const) qb.leftJoinAndSelect(`s.${rel}`, alias);
    if (q.status && q.status !== 'all') qb.andWhere(q.status === 'active' ? "s.status IN ('requested','matched','in_transit')" : 's.status = :st', { st: q.status });
    if (q.source) qb.andWhere('s.source = :src', { src: q.source });
    if (q.q?.trim()) {
      const like = `%${q.q.trim()}%`;
      qb.andWhere(new Brackets((b) => b.where('s.ref ILIKE :like', { like }).orWhere('so.name ILIKE :like', { like }).orWhere('pp.name ILIKE :like', { like }).orWhere('dp.name ILIKE :like', { like })));
    }
    qb.orderBy('s.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [rows, total] = await qb.getManyAndCount();
    return pageOf(await this.view.summaries(rows), total, page, pageSize);
  }

  /** Support: "Verify & resend" — sends the receiver their PIN again (only while the shipment is open). */
  async resendPin(ctx: RequestContext, shipmentId: string): Promise<{ sentTo: string }> {
    const s = await this.shipments.createQueryBuilder('s').addSelect('s.pinEnc').leftJoinAndSelect('s.shipperOrg', 'o').where('s.id = :id', { id: shipmentId }).getOne();
    if (!s) throw notFound('Shipment');
    if (!s.pinEnc || !['matched', 'in_transit'].includes(s.status)) throw conflict('no_pin', 'This shipment has no active delivery PIN');
    const pin = decryptString(this.env.pinEncKey, s.pinEnc);
    await this.notifications.notify({
      phone: s.receiverPhone,
      type: 'trip.receiver_pin',
      title: 'Delivery PIN',
      body: `RAHA: Your delivery PIN for ${s.ref} is ${pin}. Give it to the driver only after you check the cargo. ${this.env.publicWebUrl}/r/${s.receiverCode}`,
      dedupeKey: `pin-resend:${s.id}:${randomToken(4)}`,
    });
    await this.audit.record({ actor: ctx, action: 'shipment.resend_pin', entityType: 'shipment', entityId: s.id, data: { to: s.receiverPhone } });
    return { sentTo: s.receiverPhone };
  }

  async reviewDelivery(ctx: RequestContext, shipmentId: string, dto: ReviewDeliveryDto): Promise<void> {
    await this.shipments.manager.query(`UPDATE deliveries SET reviewed_at = now(), reviewed_by = $2, notes = COALESCE($3, notes) WHERE shipment_id = $1`, [shipmentId, ctx.userId, dto.note ?? null]);
    await this.audit.record({ actor: ctx, action: `delivery.review_${dto.outcome}`, entityType: 'shipment', entityId: shipmentId, data: { note: dto.note } });
  }

  // ───────────────────────── matching assist ─────────────────────────

  async matchingQueue(): Promise<OpsMatchRowDto[]> {
    const rows = await this.shipments.find({ where: { status: 'requested' }, relations: SHIPMENT_RELATIONS, order: { createdAt: 'ASC' }, take: 60 });
    const out: OpsMatchRowDto[] = [];
    for (const s of rows) {
      const n = (await this.matching.rankForShipment(s.id)).length;
      const pending = await this.shipments.manager.query(`SELECT count(*)::int AS n FROM matches WHERE shipment_id = $1 AND status IN ('pending_carrier','pending_shipper')`, [s.id]);
      out.push({
        shipmentId: s.id,
        ref: s.ref,
        route: `${s.pickupPlace.name} → ${s.dropoffPlace.name}`,
        weightKg: s.weightKg,
        shipperName: s.shipperOrg.name,
        ageMinutes: Math.round((Date.now() - s.createdAt.getTime()) / 60_000),
        candidates: n,
        source: s.source,
        readyAt: s.readyAt.toISOString(),
        pendingProposals: pending[0]?.n ?? 0,
      });
    }
    // oldest, least-served first
    return out.sort((a, b) => a.candidates - b.candidates || b.ageMinutes - a.ageMinutes);
  }

  /** Candidates with a wider detour tolerance so ops can stretch a match by phone. */
  async candidates(shipmentId: string, detourKm = 40): Promise<TruckOptionDto[]> {
    const s = await this.shipments.findOne({ where: { id: shipmentId }, relations: { dropoffPlace: true } });
    if (!s) throw notFound('Shipment');
    const cands = await this.matching.rankForShipment(shipmentId, { detourKm });
    return cands.map((c) => this.matching.toTruckOption(c, s.weightKg, s.dropoffPlace.name));
  }

  async assign(ctx: RequestContext, shipmentId: string, dto: AssignMatchDto) {
    return this.matches.propose(ctx, { shipmentId, capacityPostId: dto.capacityPostId, side: 'ops', priceEtb: dto.priceEtb, confirmNow: dto.confirmNow });
  }

  // ───────────────────────── trips ─────────────────────────

  async tripList(q: { status?: 'active' | 'late' | 'completed' }): Promise<OpsTripRowDto[]> {
    const statuses: TripStatus[] = q.status === 'completed' ? ['completed'] : ['planned', 'to_pickup', 'loading', 'in_transit'];
    const rows = await this.trips.find({ where: { status: In(statuses) }, relations: TRIP_RELATIONS, order: q.status === 'completed' ? { completedAt: 'DESC' } : { lastCheckinAt: 'ASC' }, take: 150 });
    const out: OpsTripRowDto[] = [];
    for (const t of rows) out.push(await this.tripRow(t));
    return q.status === 'late' ? out.filter((t) => t.lateHours !== null) : out;
  }

  private async tripRow(t: Trip): Promise<OpsTripRowDto> {
    const route = await this.tripsService.routeFor(t);
    const stop = route.stops.find((s) => s.place.id === t.lastPlaceId);
    const lateHours = t.status === 'in_transit' && t.lastCheckinAt && Date.now() - t.lastCheckinAt.getTime() > LATE_CHECKIN_HOURS * 3_600_000 ? Math.floor((Date.now() - t.lastCheckinAt.getTime()) / 3_600_000) : null;
    const atDest = t.status === 'in_transit' && t.lastPlaceId === t.destinationPlaceId;
    const tone: OpsTripRowDto['tone'] = lateHours !== null ? 'red' : atDest ? 'red' : t.status === 'in_transit' ? 'lapis' : t.status === 'completed' ? 'green' : 'amber';
    return {
      tripId: t.id,
      ref: t.ref,
      status: t.status,
      route: `${t.origin.name} → ${t.destination.name}`,
      driverName: t.driver.fullName,
      driverPhone: t.driver.phone,
      plate: t.vehicle.plate,
      fleetName: t.fleetOrg.name,
      loads: t.loads.length,
      weightKg: t.loads.reduce((n, l) => n + l.weightKg, 0),
      shared: new Set(t.loads.map((l) => l.shipment.shipperOrgId)).size > 1,
      progressPct: t.status === 'completed' ? 100 : t.status === 'in_transit' && stop && route.routeKm ? Math.round((stop.km / route.routeKm) * 100) : 0,
      lastLabel: t.lastCheckinAt && stop ? `${stop.place.name} ${formatTime(t.lastCheckinAt)}` : t.plannedDepartureAt ? `departs ${formatTime(t.plannedDepartureAt)}` : '—',
      lateHours,
      etaAt: t.etaAt?.toISOString() ?? null,
      tone,
      stateLabel: lateHours !== null ? 'LATE CHECK-IN' : atDest ? 'AT RECEIVER' : t.status === 'in_transit' ? 'IN TRANSIT' : t.status === 'completed' ? 'COMPLETED' : t.status === 'loading' ? 'LOADING' : 'PLANNED',
    };
  }

  async tripDetail(tripId: string): Promise<OpsTripDetailDto> {
    const t = await this.tripsService.loadTrip(tripId);
    const [row, checkins, route] = await Promise.all([this.tripRow(t), this.tripsService.checkinsOf(tripId), this.tripsService.routeFor(t)]);
    return {
      ...row,
      strip: buildStrip({
        corridorName: t.corridor?.name ?? route.corridorName,
        direction: route.direction,
        routeKm: route.routeKm,
        stops: route.stops,
        checkins: checkins.map((c) => ({ placeId: c.placeId, at: c.checkedInAt, channel: c.channel })),
        status: t.status,
        departedAt: t.departedAt,
        plannedDepartureAt: t.plannedDepartureAt,
        completedAt: t.completedAt,
        etaAt: t.etaAt,
      }),
      loadRows: t.loads.map((l) => ({ shipmentId: l.shipmentId, ref: l.shipment.ref, shipperName: l.shipment.shipperOrg.name, weightKg: l.weightKg, status: l.status, receiverName: l.shipment.receiverName, receiverPhone: l.shipment.receiverPhone, dropoff: l.shipment.dropoffPlace.name, isRahaMatch: l.isRahaMatch })),
      checkins: checkins.map((c) => ({ placeName: c.place.name, at: c.checkedInAt.toISOString(), channel: c.channel, offline: c.offline })),
      places: route.stops.map((s) => this.reference.toPlaceDto(s.place)),
    };
  }

  /** Ops speaks to the driver by phone and records the town they report. */
  async manualCheckin(ctx: RequestContext, tripId: string, dto: ManualCheckinDto): Promise<OpsTripDetailDto> {
    await this.tripsService.checkin(tripId, { actorUserId: ctx.userId, placeId: dto.placeId, clientId: crypto.randomUUID(), at: new Date(), channel: 'ops', note: dto.note });
    await this.audit.record({ actor: ctx, action: 'trip.manual_checkin', entityType: 'trip', entityId: tripId, data: { placeId: dto.placeId } });
    return this.tripDetail(tripId);
  }

  // ───────────────────────── directory ─────────────────────────

  async vehicleList(q: { status?: string; verification?: string; q?: string; page?: number; pageSize?: number }): Promise<Paged<VehicleDto>> {
    const page = q.page ?? 1;
    const pageSize = Math.min(q.pageSize ?? 40, 100);
    const qb = this.vehicles.createQueryBuilder('v').leftJoinAndSelect('v.owner', 'o').leftJoinAndSelect('v.currentDriver', 'd').leftJoinAndSelect('v.homePlace', 'h');
    if (q.status) qb.andWhere('v.status = :s', { s: q.status });
    if (q.verification) qb.andWhere('v.verification_status = :vs', { vs: q.verification });
    if (q.q?.trim()) qb.andWhere('(v.plate ILIKE :like OR o.name ILIKE :like OR d.full_name ILIKE :like)', { like: `%${q.q.trim()}%` });
    qb.orderBy('v.plate', 'ASC').skip((page - 1) * pageSize).take(pageSize);
    const [rows, total] = await qb.getManyAndCount();
    return pageOf(rows.map((v) => this.fleet.toVehicleDto(v)), total, page, pageSize);
  }

  async orgList(q: { type?: string; verification?: string; q?: string; page?: number; pageSize?: number }): Promise<Paged<OpsOrgRowDto>> {
    const page = q.page ?? 1;
    const pageSize = Math.min(q.pageSize ?? 40, 100);
    const qb = this.orgs.createQueryBuilder('o');
    if (q.type) qb.andWhere('o.type = :t', { t: q.type });
    if (q.verification) qb.andWhere('o.verification_status = :vs', { vs: q.verification });
    if (q.q?.trim()) qb.andWhere('(o.name ILIKE :like OR o.tin ILIKE :like)', { like: `%${q.q.trim()}%` });
    qb.orderBy('o.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [rows, total] = await qb.getManyAndCount();
    const ids = rows.map((r) => r.id);
    const counts: Array<{ id: string; members: string; vehicles: string; shipments: string }> = ids.length
      ? await this.orgs.query(
          `SELECT o.id,
                  (SELECT count(*) FROM memberships m WHERE m.organization_id = o.id AND m.status <> 'removed') AS members,
                  (SELECT count(*) FROM vehicles v WHERE v.owner_org_id = o.id) AS vehicles,
                  (SELECT count(*) FROM shipments s WHERE s.shipper_org_id = o.id OR s.logged_by_org_id = o.id) AS shipments
             FROM organizations o WHERE o.id = ANY($1::uuid[])`,
          [ids],
        )
      : [];
    const cMap = new Map(counts.map((c) => [c.id, c]));
    const managers = rows.filter((r) => r.managedByOrgId).length ? await this.orgs.find({ where: { id: In(rows.map((r) => r.managedByOrgId).filter((x): x is string => !!x)) }, select: ['id', 'name'] }) : [];
    const mMap = new Map(managers.map((m) => [m.id, m.name]));
    return pageOf(
      rows.map((o) => ({
        id: o.id,
        type: o.type,
        name: o.name,
        city: o.city,
        phone: o.phone,
        tin: o.tin,
        verification: o.verificationStatus,
        members: Number(cMap.get(o.id)?.members ?? 0),
        vehicles: Number(cMap.get(o.id)?.vehicles ?? 0),
        shipments: Number(cMap.get(o.id)?.shipments ?? 0),
        managedBy: o.managedByOrgId ? mMap.get(o.managedByOrgId) ?? null : null,
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize,
    );
  }

  async setOrgVerification(ctx: RequestContext, id: string, dto: UpdateOrgStatusDto): Promise<void> {
    const res = await this.orgs.update(id, { verificationStatus: dto.verification, verifiedAt: dto.verification === 'verified' ? new Date() : null });
    if (!res.affected) throw notFound('Organization');
    await this.audit.record({ actor: ctx, action: 'org.set_verification', entityType: 'organization', entityId: id, data: { verification: dto.verification } });
  }

  async userList(q: { q?: string; staff?: boolean; status?: string; page?: number; pageSize?: number }): Promise<Paged<OpsUserRowDto>> {
    const page = q.page ?? 1;
    const pageSize = Math.min(q.pageSize ?? 40, 100);
    const qb = this.users.createQueryBuilder('u');
    if (q.q?.trim()) qb.andWhere('(u.full_name ILIKE :like OR u.phone ILIKE :like OR u.email ILIKE :like)', { like: `%${q.q.trim()}%` });
    if (q.staff !== undefined) qb.andWhere('u.is_staff = :staff', { staff: q.staff });
    if (q.status) qb.andWhere('u.status = :st', { st: q.status });
    qb.orderBy('u.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [rows, total] = await qb.getManyAndCount();
    return pageOf(await this.toUserRows(rows), total, page, pageSize);
  }

  async userDetail(id: string): Promise<OpsUserRowDto> {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw notFound('User');
    return (await this.toUserRows([u]))[0]!;
  }

  private async toUserRows(rows: User[]): Promise<OpsUserRowDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [ms, dps] = await Promise.all([
      this.memberships.find({ where: { userId: In(ids), status: In(['active', 'invited', 'suspended']) }, relations: { organization: true } }),
      this.drivers.find({ where: { userId: In(ids) }, select: ['userId'] }),
    ]);
    const driverSet = new Set(dps.map((d) => d.userId));
    return rows.map((u) => ({
      id: u.id,
      fullName: u.fullName || '(no name yet)',
      phone: u.phone,
      email: u.email,
      status: u.status,
      isStaff: u.isStaff,
      staffRole: u.staffRole,
      memberships: ms.filter((m) => m.userId === u.id).map((m) => ({ orgId: m.organizationId, orgName: m.organization.name, orgType: m.organization.type, role: m.role, status: m.status })),
      isDriver: driverSet.has(u.id),
      lastSeenAt: (u.appLastSeenAt ?? u.lastLoginAt)?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async updateUser(ctx: RequestContext, id: string, dto: UpdateUserDto): Promise<OpsUserRowDto> {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw notFound('User');
    if (id === ctx.userId && dto.status && dto.status !== 'active') throw conflict('self_suspend', 'You cannot suspend your own account');
    const patch: Partial<User> = {};
    if (dto.status) patch.status = dto.status;
    if (dto.fullName) patch.fullName = dto.fullName.trim();
    if (dto.staffRole) {
      if (!u.isStaff) throw badRequest('not_staff', 'Only staff accounts have a staff role');
      patch.staffRole = dto.staffRole;
    }
    await this.users.update(id, patch);
    if (dto.status === 'suspended') await this.users.manager.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
    await this.audit.record({ actor: ctx, action: 'user.update', entityType: 'user', entityId: id, data: { ...dto } });
    return this.userDetail(id);
  }

  async createStaff(ctx: RequestContext, dto: CreateStaffDto): Promise<OpsUserRowDto> {
    const phone = normalizeEthiopianPhone(dto.phone);
    if (!phone) throw badRequest('invalid_phone', 'Enter a valid Ethiopian mobile number');
    if (await this.users.exist({ where: { phone } })) throw conflict('phone_taken', 'That phone number already has an account');
    const u = await this.users.save(
      this.users.create({ phone, email: dto.email.toLowerCase(), fullName: dto.fullName.trim(), isStaff: true, staffRole: dto.staffRole, passwordHash: await hashPassword(dto.password) }),
    );
    await this.audit.record({ actor: ctx, action: 'staff.create', entityType: 'user', entityId: u.id, data: { role: dto.staffRole } });
    return this.userDetail(u.id);
  }
}

