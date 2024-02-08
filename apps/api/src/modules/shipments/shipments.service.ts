import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  CARGO_TYPES,
  normalizeEthiopianPhone,
  startOfEthiopianMonth,
  toEthiopian,
  type ShipmentDetailDto,
  type ShipmentListDto,
  type ShipmentSummaryDto,
  type TruckOptionDto,
} from '@raha/contracts';
import { point } from '../../common/geo';
import { randomCode } from '../../common/crypto';
import { DomainError, badRequest, conflict, forbidden, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { Match, Shipment, Trip } from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { MatchesService } from '../matching/matches.service';
import { MatchingService, type ShipSpec } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { T } from '../notifications/templates';
import { ReferenceService } from '../reference/reference.service';
import { TripsService } from '../trips/trips.service';
import type { CancelShipmentDto, ConfirmDeliveryDto, CreateShipmentDto, ListShipmentsQuery, PreviewOptionsDto } from './shipments.dto';
import { SHIPMENT_RELATIONS, ShipmentViewService } from './shipment-view.service';

export interface CreateOptions {
  shipperOrgId: string;
  source: Shipment['source'];
  loggedByOrgId?: string | null;
}

const ACTIVE = ['requested', 'matched', 'in_transit'] as const;

@Injectable()
export class ShipmentsService {
  private readonly log = new Logger(ShipmentsService.name);

  constructor(
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(Match) private readonly matchRepo: Repository<Match>,
    private readonly db: DataSource,
    private readonly reference: ReferenceService,
    private readonly matching: MatchingService,
    private readonly matches: MatchesService,
    private readonly view: ShipmentViewService,
    private readonly tripsService: TripsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────── create ─────────────────────────

  async create(ctx: RequestContext, dto: CreateShipmentDto, opts: CreateOptions): Promise<Shipment> {
    if (dto.pickupPlaceId === dto.dropoffPlaceId) throw badRequest('same_place', 'Pickup and drop-off are in the same town. Raha moves freight between towns.');
    await Promise.all([this.reference.place(dto.pickupPlaceId), this.reference.place(dto.dropoffPlaceId)]);

    const readyAt = new Date(dto.readyAt);
    if (readyAt.getTime() < Date.now() - 2 * 3_600_000) throw badRequest('ready_in_past', 'The pickup time is in the past');
    const readyUntil = dto.readyUntil ? new Date(dto.readyUntil) : null;
    if (readyUntil && readyUntil <= readyAt) throw badRequest('window_invalid', 'The pickup window must end after it starts');

    const receiverPhone = normalizeEthiopianPhone(dto.receiverPhone);
    if (!receiverPhone) throw badRequest('invalid_receiver_phone', 'Enter the receiver’s mobile number. They get the delivery PIN by SMS.');
    const contactPhone = dto.pickupContactPhone ? normalizeEthiopianPhone(dto.pickupContactPhone) : null;
    if (dto.pickupContactPhone && !contactPhone) throw badRequest('invalid_phone', 'The pickup contact’s phone number is not valid');

    const cargo = CARGO_TYPES.find((c) => c.key === dto.cargoType)!;
    const requirements = [...new Set([...(cargo.requires as readonly string[]), ...(dto.requirements ?? [])])];

    const [{ seq }] = await this.db.query<Array<{ seq: string }>>(`SELECT nextval('shipment_ref_seq') AS seq`);
    const ref = `RH-${String(new Date().getFullYear() % 100).padStart(2, '0')}-${String(seq).padStart(5, '0')}`;

    const shipment = await this.shipments.save(
      this.shipments.create({
        ref,
        shipperOrgId: opts.shipperOrgId,
        createdBy: ctx.userId,
        loggedByOrgId: opts.loggedByOrgId ?? null,
        source: opts.source,
        pickupPlaceId: dto.pickupPlaceId,
        pickupAddress: dto.pickupAddress.trim(),
        pickupPoint: dto.pickupLat != null && dto.pickupLng != null ? point(dto.pickupLat, dto.pickupLng) : null,
        pickupContactName: dto.pickupContactName ?? null,
        pickupContactPhone: contactPhone,
        dropoffPlaceId: dto.dropoffPlaceId,
        dropoffAddress: dto.dropoffAddress.trim(),
        dropoffPoint: dto.dropoffLat != null && dto.dropoffLng != null ? point(dto.dropoffLat, dto.dropoffLng) : null,
        receiverName: dto.receiverName.trim(),
        receiverPhone,
        cargoType: dto.cargoType,
        cargoDescription: dto.cargoDescription ?? null,
        pieces: dto.pieces ?? null,
        weightKg: dto.weightKg,
        volumeM3: dto.volumeM3 ?? null,
        requirements,
        readyAt,
        readyUntil,
        receiverCode: randomCode(10),
      }),
    );
    await this.audit.record({ actor: ctx, action: 'shipment.create', entityType: 'shipment', entityId: shipment.id, data: { ref, source: opts.source, weightKg: dto.weightKg } });

    // Tell drivers whose empty space this load fits — without making the request wait for it.
    void this.notifyEligibleCarriers(shipment.id).catch((e) => this.log.warn(`carrier notification failed: ${e.message}`));
    return shipment;
  }

  /** "New load fits your truck" to the best-fitting drivers. Deduplicated per driver and shipment. */
  async notifyEligibleCarriers(shipmentId: string): Promise<void> {
    const shipment = await this.shipments.findOneOrFail({ where: { id: shipmentId }, relations: { pickupPlace: true, dropoffPlace: true } });
    if (shipment.readyAt.getTime() - Date.now() > 24 * 3_600_000) return; // too far ahead to bother anyone
    const candidates = await this.matching.rankForShipment(shipmentId, { limit: 5 });
    const seen = new Set<string>();
    for (const c of candidates) {
      const driverId = c.post.driverId;
      if (!driverId || seen.has(driverId)) continue;
      seen.add(driverId);
      await this.notifications.notify({
        userId: driverId,
        type: 'load.fits',
        ...T.loadOffered('en', { weightKg: shipment.weightKg, cargo: shipment.cargoType, from: shipment.pickupPlace.name, to: shipment.dropoffPlace.name, priceEtb: c.priceEtb - c.brokerFeeEtb, ref: shipment.ref }),
        via: { telegram: true },
        data: { shipmentId: shipment.id },
        dedupeKey: `fits:${shipment.id}:${driverId}`,
      });
    }
  }

  // ───────────────────────── read ─────────────────────────

  /** Shipments the caller's organization created (shippers) or handles (brokers). */
  private scoped(ctx: RequestContext): SelectQueryBuilder<Shipment> {
    const org = ctx.org;
    if (!org) throw forbidden('Select an organization first', 'org_required');
    const qb = this.shipments.createQueryBuilder('s');
    for (const [rel, alias] of [['shipperOrg', 'so'], ['loggedByOrg', 'lo'], ['pickupPlace', 'pp'], ['dropoffPlace', 'dp']] as const) qb.leftJoinAndSelect(`s.${rel}`, alias);
    if (org.type === 'shipper') qb.where('s.shipper_org_id = :org', { org: org.id });
    else if (org.type === 'brokerage') qb.where(new Brackets((b) => b.where('s.logged_by_org_id = :org', { org: org.id }).orWhere('so.managed_by_org_id = :org', { org: org.id })));
    else throw forbidden('Fleet accounts see their shipments through trips', 'wrong_org_type');
    return qb;
  }

  async list(ctx: RequestContext, q: ListShipmentsQuery): Promise<ShipmentListDto> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const tab = q.tab ?? 'active';

    const qb = this.scoped(ctx);
    if (tab === 'active') qb.andWhere('s.status IN (:...active)', { active: ACTIVE });
    else if (tab === 'completed') qb.andWhere("s.status IN ('delivered','cancelled')");
    if (q.q?.trim()) {
      const like = `%${q.q.trim()}%`;
      qb.andWhere(new Brackets((b) => b.where('s.ref ILIKE :like', { like }).orWhere('pp.name ILIKE :like', { like }).orWhere('dp.name ILIKE :like', { like }).orWhere('so.name ILIKE :like', { like })));
    }
    qb.addSelect(`CASE s.status WHEN 'in_transit' THEN 0 WHEN 'requested' THEN 1 WHEN 'matched' THEN 2 ELSE 3 END`, 'status_rank')
      .orderBy('status_rank', 'ASC')
      .addOrderBy('s.readyAt', tab === 'completed' ? 'DESC' : 'ASC')
      .offset((page - 1) * pageSize)
      .limit(pageSize);
    const [rows, total] = await qb.getManyAndCount();
    const items = await this.view.summaries(rows);

    // How many trucks could carry each open shipment right now (cheap: at most a few per page).
    const open = items.filter((i) => i.status === 'requested').slice(0, 10);
    const fits = new Map<string, { n: number; quick: number }>();
    await Promise.all(
      open.map(async (i) => {
        const cands = await this.matching.rankForShipment(i.id);
        fits.set(i.id, { n: cands.length, quick: cands.filter((c) => c.fit === 'same_trip' || c.fit === 'empty_return').length });
      }),
    );
    for (const i of items) i.matchingTrucks = i.status === 'requested' ? (fits.get(i.id)?.n ?? null) : null;

    const banner = open.map((i) => ({ i, f: fits.get(i.id) })).find((x) => x.f && x.f.n > 0);
    return {
      items,
      total,
      stats: await this.stats(ctx, items),
      offerBanner: banner
        ? { shipmentId: banner.i.id, ref: banner.i.ref, offers: banner.f!.n, sameTripCount: banner.f!.quick, route: `${banner.i.pickup.name} → ${banner.i.dropoff.name}`, weightKg: banner.i.weightKg }
        : null,
    };
  }

  private async stats(ctx: RequestContext, pageItems: ShipmentSummaryDto[]): Promise<ShipmentListDto['stats']> {
    const monthStart = startOfEthiopianMonth(new Date());
    const base = () => this.scoped(ctx);
    const inTransit = await base().andWhere("s.status = 'in_transit'").getCount();
    const delivered = await base().andWhere("s.status = 'delivered' AND s.delivered_at >= :m", { m: monthStart }).select(['s.id', 's.agreedPriceEtb']).getMany();
    const awaiting = pageItems.filter((i) => i.status === 'requested' && (i.matchingTrucks ?? 0) + i.pendingOffers > 0);
    return {
      inTransit,
      awaitingChoice: awaiting.length,
      offersTotal: awaiting.reduce((n, i) => n + (i.matchingTrucks ?? 0) + i.pendingOffers, 0),
      deliveredMonth: delivered.length,
      spendMonthEtb: Math.round(delivered.reduce((sum, s) => sum + (s.agreedPriceEtb ?? 0), 0)),
      monthLabel: toEthiopian(new Date()).monthName,
    };
  }

  /** Loads a shipment after checking the caller may see it (shipper, handling broker, carrier side or ops). */
  async get(ctx: RequestContext, id: string): Promise<Shipment> {
    const s = await this.shipments.findOne({ where: { id }, relations: SHIPMENT_RELATIONS });
    if (!s) throw notFound('Shipment');
    await this.assertCanView(ctx, s);
    return s;
  }

  async assertCanView(ctx: RequestContext, s: Shipment): Promise<void> {
    if (ctx.isStaff && ctx.permissions.includes('ops:read')) return;
    const orgId = ctx.org?.id;
    if (orgId && (orgId === s.shipperOrgId || orgId === s.loggedByOrgId)) return;
    if (orgId && s.shipperOrg?.managedByOrgId === orgId) return;
    if (s.tripId) {
      const trip = await this.trips.findOne({ where: { id: s.tripId }, relations: { capacityPost: true } });
      if (trip && (trip.driverId === ctx.userId || (orgId && (orgId === trip.fleetOrgId || orgId === trip.capacityPost?.brokerOrgId)))) return;
    }
    throw forbidden('You cannot see this shipment', 'not_a_party');
  }

  async detail(ctx: RequestContext, id: string): Promise<ShipmentDetailDto> {
    return this.view.detail(await this.get(ctx, id), ctx);
  }

  // ───────────────────────── options (matching) ─────────────────────────

  async options(ctx: RequestContext, id: string): Promise<TruckOptionDto[]> {
    const s = await this.get(ctx, id);
    if (s.status !== 'requested') return [];
    const cands = await this.matching.rankForShipment(id);
    return cands.map((c) => this.matching.toTruckOption(c, s.weightKg, s.dropoffPlace.name));
  }

  /** Live "transport options" while the shipper is still filling in the form. Nothing is saved. */
  async preview(dto: PreviewOptionsDto): Promise<{ options: TruckOptionDto[]; distanceKm: number | null; totalTrucks: number }> {
    const [pickup, dropoff] = await Promise.all([this.reference.place(dto.pickupPlaceId), this.reference.place(dto.dropoffPlaceId)]);
    const cargo = CARGO_TYPES.find((c) => c.key === dto.cargoType)!;
    const spec: ShipSpec = {
      id: null,
      weightKg: dto.weightKg,
      volumeM3: dto.volumeM3 ?? null,
      readyAt: new Date(dto.readyAt),
      readyUntil: dto.readyUntil ? new Date(dto.readyUntil) : null,
      requirements: [...new Set([...(cargo.requires as readonly string[]), ...(dto.requirements ?? [])])],
      pickup: dto.pickupLat != null && dto.pickupLng != null ? point(dto.pickupLat, dto.pickupLng) : pickup.location,
      dropoff: dto.dropoffLat != null && dto.dropoffLng != null ? point(dto.dropoffLat, dto.dropoffLng) : dropoff.location,
    };
    const cands = await this.matching.rankForSpec(spec);
    const route = await this.reference.resolveRoute(dto.pickupPlaceId, dto.dropoffPlaceId);
    return {
      options: cands.slice(0, 6).map((c) => this.matching.toTruckOption(c, dto.weightKg, dropoff.name)),
      distanceKm: route.routeKm,
      totalTrucks: cands.length,
    };
  }

  // ───────────────────────── cancel / manual confirm ─────────────────────────

  async cancel(ctx: RequestContext, id: string, dto: CancelShipmentDto): Promise<ShipmentDetailDto> {
    const s = await this.get(ctx, id);
    if (s.status === 'in_transit') throw conflict('in_transit', 'The truck has already left. Call Raha support on 8817 to stop it.');
    if (['delivered', 'cancelled'].includes(s.status)) throw conflict('already_closed', `This shipment is already ${s.status}`);
    const reason = dto.reason?.trim() || 'Cancelled by shipper';

    const confirmed = await this.matchRepo.findOne({ where: { shipmentId: s.id, status: 'confirmed' } });
    if (confirmed) {
      // unwinds capacity, trip load and PIN (and tells the carrier)
      await this.matches.respond(ctx, confirmed.id, 'cancel', reason);
    }
    await this.db.transaction(async (tx) => {
      await tx.getRepository(Match).update({ shipmentId: s.id, status: 'pending_carrier' as const }, { status: 'cancelled', declineReason: reason });
      await tx.getRepository(Match).update({ shipmentId: s.id, status: 'pending_shipper' as const }, { status: 'cancelled', declineReason: reason });
      await tx.getRepository(Shipment).update(s.id, { status: 'cancelled', cancelledAt: new Date(), cancelReason: reason });
      await this.audit.record({ actor: ctx, action: 'shipment.cancel', entityType: 'shipment', entityId: s.id, data: { reason } }, tx);
    });
    return this.detail(ctx, id);
  }

  /** The shipper confirms delivery themselves (receiver confirmed by phone, or lost the PIN). Flagged for ops review. */
  async confirmManually(ctx: RequestContext, id: string, dto: ConfirmDeliveryDto): Promise<ShipmentDetailDto> {
    const s = await this.get(ctx, id);
    if (s.status !== 'in_transit') throw conflict('not_in_transit', 'Only a shipment that is on the road can be confirmed');
    const load = await this.tripsService.loadForShipment(s.id);
    if (!load) throw conflict('no_trip', 'This shipment has no trip yet');
    await this.tripsService.finalizeDelivery({
      tripId: load.tripId,
      loadId: load.id,
      confirmedBy: ctx.isStaff ? 'ops' : 'shipper_manual',
      pinVerified: false,
      condition: dto.condition ?? 'all_good',
      receivedCount: dto.receivedCount ?? null,
      at: new Date(),
      notes: dto.note ?? null,
      actorUserId: ctx.userId,
    });
    return this.detail(ctx, id);
  }

  /** Throws the standard "booking failed but the shipment exists" error. */
  bookingFailed(err: unknown, shipmentId: string): never {
    if (err instanceof DomainError) throw new DomainError(err.code, `Your shipment was saved, but booking that truck failed: ${err.message}`, err.getStatus(), { shipmentId });
    throw err;
  }
}
