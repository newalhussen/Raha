import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { initials, formatTonnes, type DriverSummaryDto, type VehicleDto } from '@raha/contracts';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { DriverProfile, Membership, Organization, User, Vehicle } from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { ReferenceService } from '../reference/reference.service';
import { DOCUMENT_LABEL, VerificationService } from '../verification/verification.service';
import type { CreateVehicleDto, SubmitVerificationDto, UpdateVehicleDto } from './fleet.dto';

const PLATE_RE = /^[A-Z0-9][A-Z0-9 -]{3,14}$/;
export const normalizePlate = (plate: string) => plate.trim().toUpperCase().replace(/\s+/g, ' ');

/** "Isuzu FSR · 10 t" */
export const vehicleLabel = (v: Pick<Vehicle, 'makeModel' | 'maxLoadKg'>) => `${v.makeModel} · ${formatTonnes(v.maxLoadKg, v.maxLoadKg % 1000 === 0 ? 0 : 1)}`;

@Injectable()
export class FleetService {
  constructor(
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(DriverProfile) private readonly driverProfiles: Repository<DriverProfile>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    private readonly reference: ReferenceService,
    private readonly verification: VerificationService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────── vehicles ─────────────────────────

  async listVehicles(orgId: string): Promise<VehicleDto[]> {
    const rows = await this.vehicles.find({
      where: { ownerOrgId: orgId },
      relations: { owner: true, currentDriver: true, homePlace: true },
      order: { plate: 'ASC' },
    });
    return rows.map((v) => this.toVehicleDto(v));
  }

  async getVehicle(orgId: string, id: string): Promise<Vehicle> {
    const v = await this.vehicles.findOne({ where: { id }, relations: { owner: true, currentDriver: true, homePlace: true } });
    if (!v || v.ownerOrgId !== orgId) throw notFound('Truck');
    return v;
  }

  async createVehicle(ctx: RequestContext, orgId: string, dto: CreateVehicleDto): Promise<VehicleDto> {
    const plate = normalizePlate(dto.plate);
    if (!PLATE_RE.test(plate)) throw badRequest('invalid_plate', 'Enter the plate as printed, e.g. 3-48213 AA');
    if (await this.vehicles.exist({ where: { plate } })) throw conflict('plate_taken', `A truck with plate ${plate} is already registered on Raha`);
    if (dto.homePlaceId) await this.reference.place(dto.homePlaceId);

    const v = await this.vehicles.save(
      this.vehicles.create({
        ownerOrgId: orgId,
        plate,
        makeModel: dto.makeModel.trim(),
        year: dto.year ?? null,
        bodyType: dto.bodyType,
        maxLoadKg: dto.maxLoadKg,
        boxVolumeM3: dto.boxVolumeM3 ?? null,
        homePlaceId: dto.homePlaceId ?? null,
      }),
    );
    if (dto.driverUserId) await this.assignDriver(orgId, v.id, dto.driverUserId);
    await this.audit.record({ actor: ctx, action: 'vehicle.create', entityType: 'vehicle', entityId: v.id, data: { plate } });
    return this.toVehicleDto(await this.getVehicle(orgId, v.id));
  }

  async updateVehicle(ctx: RequestContext, orgId: string, id: string, dto: UpdateVehicleDto): Promise<VehicleDto> {
    const v = await this.getVehicle(orgId, id);
    if (v.status === 'on_trip' && (dto.status === 'off_road' || dto.driverUserId !== undefined)) {
      throw conflict('vehicle_on_trip', 'This truck is on a trip right now');
    }
    const patch: Partial<Vehicle> = {};
    if (dto.makeModel !== undefined) patch.makeModel = dto.makeModel.trim();
    if (dto.year !== undefined) patch.year = dto.year;
    if (dto.bodyType !== undefined) patch.bodyType = dto.bodyType;
    if (dto.maxLoadKg !== undefined) {
      if (dto.maxLoadKg < v.currentLoadKg) throw badRequest('below_current_load', 'Max load cannot be lower than the load aboard');
      patch.maxLoadKg = dto.maxLoadKg;
    }
    if (dto.boxVolumeM3 !== undefined) patch.boxVolumeM3 = dto.boxVolumeM3;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.statusNote !== undefined) patch.statusNote = dto.statusNote;
    if (dto.homePlaceId !== undefined) {
      await this.reference.place(dto.homePlaceId);
      patch.homePlaceId = dto.homePlaceId;
    }
    if (Object.keys(patch).length) await this.vehicles.update(id, patch);
    if (dto.driverUserId === null) await this.vehicles.update(id, { currentDriverId: null });
    else if (dto.driverUserId) await this.assignDriver(orgId, id, dto.driverUserId);
    await this.audit.record({ actor: ctx, action: 'vehicle.update', entityType: 'vehicle', entityId: id, data: { ...dto } });
    return this.toVehicleDto(await this.getVehicle(orgId, id));
  }

  /** One truck per driver at a time (enforced in the database too). */
  async assignDriver(orgId: string, vehicleId: string, driverUserId: string): Promise<void> {
    const member = await this.memberships.findOne({ where: { userId: driverUserId, organizationId: orgId, status: In(['active', 'invited']) } });
    if (!member || !['driver', 'owner', 'manager'].includes(member.role)) throw badRequest('not_a_driver', 'That person is not a driver on your team');
    await this.driverProfiles.upsert({ userId: driverUserId }, ['userId']); // owner-operators drive too
    const other = await this.vehicles.findOne({ where: { currentDriverId: driverUserId } });
    if (other && other.id !== vehicleId) throw conflict('driver_already_assigned', `This driver is already assigned to ${other.plate}`);
    await this.vehicles.update(vehicleId, { currentDriverId: driverUserId });
  }

  async submitVehicleVerification(ctx: RequestContext, orgId: string, vehicleId: string, dto: SubmitVerificationDto) {
    await this.getVehicle(orgId, vehicleId);
    const allowed = new Set(['libre', 'insurance', 'vehicle_photo']);
    if (dto.documents.some((d) => !allowed.has(d.kind))) throw badRequest('wrong_documents', 'Trucks need the libre, insurance and a photo');
    return this.verification.submit(ctx, 'vehicle', vehicleId, dto.documents);
  }

  // ───────────────────────── drivers ─────────────────────────

  async listDrivers(orgId: string): Promise<DriverSummaryDto[]> {
    const members = await this.memberships.find({
      where: { organizationId: orgId, status: In(['active', 'invited']), role: In(['driver', 'owner', 'manager']) },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    const userIds = members.map((m) => m.userId);
    const profiles = userIds.length ? await this.driverProfiles.find({ where: { userId: In(userIds) } }) : [];
    const byUser = new Map(profiles.map((p) => [p.userId, p]));
    const trucks = userIds.length ? await this.vehicles.find({ where: { currentDriverId: In(userIds) } }) : [];
    const truckByDriver = new Map(trucks.map((t) => [t.currentDriverId!, t]));
    const expiringDriver = await this.verification.expiring('driver', userIds);
    const expiringVehicle = await this.verification.expiring('vehicle', trucks.map((t) => t.id));

    return members
      .filter((m) => m.role === 'driver' || byUser.has(m.userId))
      .map((m) => {
        const p = byUser.get(m.userId);
        const truck = truckByDriver.get(m.userId);
        const exp = [...(expiringDriver.get(m.userId) ?? []), ...(truck ? expiringVehicle.get(truck.id) ?? [] : [])].sort((a, b) => a.daysLeft - b.daysLeft)[0];
        let note: string | null;
        let warn = false;
        if (exp) {
          note = exp.daysLeft <= 0 ? `${DOCUMENT_LABEL[exp.kind]} expired` : `${shortDoc(exp.kind)} ${exp.daysLeft} days`;
          warn = true;
        } else if (p?.verificationStatus === 'verified') note = '✓ Verified';
        else if (p?.verificationStatus === 'pending') note = 'In review';
        else if (p?.verificationStatus === 'rejected') {
          note = 'Rejected';
          warn = true;
        } else note = 'Awaiting licence';
        const channel: DriverSummaryDto['channel'] =
          m.status === 'invited' ? 'invited' : m.user.appLastSeenAt ? 'app' : m.user.telegramChatId ? 'telegram' : 'invited';
        return {
          userId: m.userId,
          fullName: m.user.fullName || m.user.phone,
          phone: m.user.phone,
          initials: initials(m.user.fullName || '?'),
          verification: p?.verificationStatus ?? 'unverified',
          tripsCompleted: p?.tripsCompleted ?? 0,
          licenceGrade: p?.licenceGrade ?? null,
          licenceExpiry: p?.licenceExpiry ?? null,
          channel,
          note,
          warn,
          plate: truck?.plate ?? null,
        };
      });
  }

  async submitDriverVerification(ctx: RequestContext, orgId: string, driverUserId: string, dto: SubmitVerificationDto) {
    const member = await this.memberships.findOne({ where: { userId: driverUserId, organizationId: orgId } });
    if (!member) throw forbidden('That driver is not on your team', 'not_a_member');
    await this.driverProfiles.upsert({ userId: driverUserId }, ['userId']);
    const allowed = new Set(['driving_licence', 'fayda_id', 'selfie']);
    if (dto.documents.some((d) => !allowed.has(d.kind))) throw badRequest('wrong_documents', 'Drivers need a licence, Fayda ID and a selfie');
    return this.verification.submit(ctx, 'driver', driverUserId, dto.documents);
  }

  // ───────────────────────── mapping ─────────────────────────

  toVehicleDto(v: Vehicle): VehicleDto {
    return {
      id: v.id,
      plate: v.plate,
      makeModel: v.makeModel,
      year: v.year,
      bodyType: v.bodyType,
      maxLoadKg: v.maxLoadKg,
      boxVolumeM3: v.boxVolumeM3,
      currentLoadKg: v.currentLoadKg,
      status: v.status,
      statusNote: v.statusNote,
      verification: v.verificationStatus,
      ownerOrgId: v.ownerOrgId,
      ownerName: v.owner?.name ?? '',
      driver: v.currentDriver ? { id: v.currentDriver.id, name: v.currentDriver.fullName, phone: v.currentDriver.phone } : null,
      homePlace: v.homePlace ? this.reference.toPlaceDto(v.homePlace) : null,
      label: vehicleLabel(v),
    };
  }
}

function shortDoc(kind: string): string {
  return kind === 'driving_licence' ? 'Licence' : kind === 'insurance' ? 'Insurance' : kind === 'libre' ? 'Libre' : (DOCUMENT_LABEL as Record<string, string>)[kind] ?? kind;
}
