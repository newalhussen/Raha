import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThan, Repository } from 'typeorm';
import type { CapacityBarDto, CapacityKind, CapacityPostDto } from '@raha/contracts';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { BrokerNetworkLink, CapacityPost, Match, Membership, Vehicle } from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { FleetService } from '../fleet/fleet.service';
import { ReferenceService } from '../reference/reference.service';
import type { PublishCapacityDto, UpdateCapacityDto } from './capacity.dto';

/** Average loaded-truck speed on Ethiopian highways incl. stops; used for ETA estimates. */
export const AVG_SPEED_KMH = 45;

export const POST_RELATIONS = {
  vehicle: { owner: true, currentDriver: true, homePlace: true },
  driver: true,
  fleetOrg: true,
  brokerOrg: true,
  origin: true,
  destination: true,
  corridor: true,
} as const;

export function capacityBar(p: Pick<CapacityPost, 'totalCapacityKg' | 'committedKg' | 'matchedKg'>): CapacityBarDto {
  return {
    totalKg: p.totalCapacityKg,
    inkKg: p.committedKg,
    amberKg: p.matchedKg,
    freeKg: Math.max(0, p.totalCapacityKg - p.committedKg - p.matchedKg),
  };
}

@Injectable()
export class CapacityService {
  constructor(
    @InjectRepository(CapacityPost) private readonly posts: Repository<CapacityPost>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(BrokerNetworkLink) private readonly network: Repository<BrokerNetworkLink>,
    @InjectRepository(Match) private readonly matches: Repository<Match>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    private readonly db: DataSource,
    private readonly reference: ReferenceService,
    private readonly fleet: FleetService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Publish a truck's free space for a journey.
   * Caller must own the truck (fleet) or have it in their broker network, or be the truck's driver.
   */
  async publish(ctx: RequestContext, dto: PublishCapacityDto): Promise<CapacityPostDto> {
    const vehicle = await this.vehicles.findOne({ where: { id: dto.vehicleId }, relations: { owner: true, currentDriver: true, homePlace: true } });
    if (!vehicle) throw notFound('Truck');
    const via = await this.authorizePublisher(ctx, vehicle);

    if (vehicle.verificationStatus !== 'verified') throw conflict('vehicle_not_verified', `Truck ${vehicle.plate} is not verified yet. Raha Operations must approve its documents first.`);
    if (vehicle.status === 'off_road') throw conflict('vehicle_off_road', `Truck ${vehicle.plate} is marked off road`);
    if (dto.originPlaceId === dto.destinationPlaceId) throw badRequest('same_place', 'Origin and destination must differ');

    const departsAt = new Date(dto.departsAt);
    if (departsAt.getTime() < Date.now() - 3_600_000) throw badRequest('departure_in_past', 'Departure time is in the past');
    const total = dto.totalCapacityKg ?? vehicle.maxLoadKg;
    if (total > vehicle.maxLoadKg) throw badRequest('over_max_load', `${vehicle.plate} can carry at most ${vehicle.maxLoadKg} kg`);
    const committed = dto.committedKg ?? 0;
    if (committed > total) throw badRequest('committed_too_high', 'The load aboard is more than the truck can carry');

    const driverId = dto.driverUserId ?? vehicle.currentDriverId ?? null;
    if (!driverId) throw badRequest('driver_required', 'Assign a driver to this truck before publishing its space');

    const clash = await this.posts
      .createQueryBuilder('p')
      .where("p.vehicle_id = :v AND p.status IN ('open','full') AND abs(extract(epoch from (p.departs_at - :d)))/3600 < 18", { v: vehicle.id, d: departsAt })
      .getExists();
    if (clash) throw conflict('vehicle_already_listed', `${vehicle.plate} already has space published around that time. Close it first or edit it.`);

    const route = await this.reference.resolveRoute(dto.originPlaceId, dto.destinationPlaceId);
    const kind: CapacityKind = dto.kind ?? (committed > 0 ? 'on_route' : 'dedicated');
    const eta = new Date(departsAt.getTime() + (route.routeKm / AVG_SPEED_KMH) * 3_600_000);

    const saved = await this.db.transaction(async (tx) => {
      const post = await tx.getRepository(CapacityPost).save(
        tx.getRepository(CapacityPost).create({
          vehicleId: vehicle.id,
          driverId,
          fleetOrgId: vehicle.ownerOrgId,
          brokerOrgId: via.brokerOrgId,
          postedBy: ctx.userId,
          postedVia: via.postedVia,
          kind,
          corridorId: route.corridorId,
          originPlaceId: dto.originPlaceId,
          destinationPlaceId: dto.destinationPlaceId,
          departsAt,
          etaAt: eta,
          totalCapacityKg: total,
          committedKg: committed,
          matchedKg: 0,
          freeVolumeM3: dto.freeVolumeM3 ?? null,
          askingPerTonneEtb: dto.askingPerTonneEtb ?? null,
          routeKm: route.routeKm,
          status: committed >= total ? 'full' : 'open',
          notes: dto.notes ?? null,
        }),
      );
      await this.writeRoute(tx.query.bind(tx), post.id, route.stops.map((s) => s.place.id));
      await this.audit.record({ actor: ctx, action: 'capacity.publish', entityType: 'capacity_post', entityId: post.id, data: { vehicle: vehicle.plate, kind, committed, total } }, tx);
      return post;
    });
    return this.getDto(saved.id);
  }

  /**
   * "Don't drive back empty": opens (or reuses) a return-leg post for a truck that has just unloaded.
   * Called from the driver app, so no organization context is involved — the truck's driver is the authority.
   */
  async publishReturnLeg(vehicle: Vehicle, driverId: string, fromPlaceId: string, toPlaceId: string, departsAt: Date): Promise<CapacityPost> {
    const existing = await this.posts.findOne({ where: { vehicleId: vehicle.id, kind: 'return_leg', status: In(['open', 'full']) }, order: { createdAt: 'DESC' } });
    if (existing && existing.originPlaceId === fromPlaceId && existing.destinationPlaceId === toPlaceId) return existing;

    const route = await this.reference.resolveRoute(fromPlaceId, toPlaceId);
    const eta = new Date(departsAt.getTime() + (route.routeKm / AVG_SPEED_KMH) * 3_600_000);
    const post = await this.db.transaction(async (tx) => {
      const saved = await tx.getRepository(CapacityPost).save(
        tx.getRepository(CapacityPost).create({
          vehicleId: vehicle.id,
          driverId,
          fleetOrgId: vehicle.ownerOrgId,
          postedBy: driverId,
          postedVia: 'app',
          kind: 'return_leg',
          corridorId: route.corridorId,
          originPlaceId: fromPlaceId,
          destinationPlaceId: toPlaceId,
          departsAt,
          etaAt: eta,
          totalCapacityKg: vehicle.maxLoadKg,
          committedKg: 0,
          matchedKg: 0,
          routeKm: route.routeKm,
          status: 'open',
        }),
      );
      await this.writeRoute(tx.query.bind(tx), saved.id, route.stops.map((s) => s.place.id));
      return saved;
    });
    await this.audit.record({ actor: { userId: driverId, isStaff: false, ip: null }, action: 'capacity.return_leg', entityType: 'capacity_post', entityId: post.id, data: { vehicle: vehicle.plate } });
    return post;
  }

  /** Builds the PostGIS polyline origin -> … -> destination for on-the-way matching. */
  async writeRoute(query: (sql: string, params: unknown[]) => Promise<unknown>, postId: string, orderedPlaceIds: string[]): Promise<void> {
    await query(
      `UPDATE capacity_posts SET route = (
         SELECT ST_MakeLine(p.location::geometry ORDER BY u.ord)::geography
         FROM unnest($1::uuid[]) WITH ORDINALITY AS u(id, ord)
         JOIN places p ON p.id = u.id
       ) WHERE id = $2`,
      [orderedPlaceIds, postId],
    );
  }

  async update(ctx: RequestContext, id: string, dto: UpdateCapacityDto): Promise<CapacityPostDto> {
    const post = await this.loadAuthorized(ctx, id);
    if (!['open', 'full'].includes(post.status)) throw conflict('post_closed', 'This space is no longer open');
    const patch: Partial<CapacityPost> = {};
    if (dto.committedKg !== undefined) {
      if (dto.committedKg + post.matchedKg > post.totalCapacityKg) throw badRequest('committed_too_high', 'That is more than the truck can carry with the matches already confirmed');
      patch.committedKg = dto.committedKg;
      patch.status = dto.committedKg + post.matchedKg >= post.totalCapacityKg ? 'full' : 'open';
    }
    if (dto.departsAt) {
      const d = new Date(dto.departsAt);
      patch.departsAt = d;
      patch.etaAt = new Date(d.getTime() + ((post.routeKm ?? 0) / AVG_SPEED_KMH) * 3_600_000);
    }
    if (dto.freeVolumeM3 !== undefined) patch.freeVolumeM3 = dto.freeVolumeM3;
    if (dto.askingPerTonneEtb !== undefined) patch.askingPerTonneEtb = dto.askingPerTonneEtb;
    if (dto.notes !== undefined) patch.notes = dto.notes;
    if (Object.keys(patch).length) await this.posts.update(id, patch);
    await this.audit.record({ actor: ctx, action: 'capacity.update', entityType: 'capacity_post', entityId: id, data: { ...dto } });
    return this.getDto(id);
  }

  async close(ctx: RequestContext, id: string): Promise<CapacityPostDto> {
    const post = await this.loadAuthorized(ctx, id);
    if (post.matchedKg > 0) throw conflict('has_matches', 'Loads are already matched to this space. Cancel those first.');
    await this.db.transaction(async (tx) => {
      await tx.getRepository(CapacityPost).update(id, { status: 'closed' });
      // proposals waiting on a closed space can no longer be accepted
      await tx.getRepository(Match).update({ capacityPostId: id, status: In(['pending_carrier', 'pending_shipper']) }, { status: 'cancelled' });
    });
    await this.audit.record({ actor: ctx, action: 'capacity.close', entityType: 'capacity_post', entityId: id });
    return this.getDto(id);
  }

  async list(ctx: RequestContext, opts: { status?: 'active' | 'all'; vehicleId?: string } = {}): Promise<CapacityPostDto[]> {
    const org = ctx.org;
    const qb = this.posts.createQueryBuilder('p').leftJoinAndSelect('p.vehicle', 'v').leftJoinAndSelect('v.owner', 'vo').leftJoinAndSelect('v.currentDriver', 'vd').leftJoinAndSelect('v.homePlace', 'vh')
      .leftJoinAndSelect('p.driver', 'd').leftJoinAndSelect('p.fleetOrg', 'fo').leftJoinAndSelect('p.brokerOrg', 'bo').leftJoinAndSelect('p.origin', 'o').leftJoinAndSelect('p.destination', 'ds').leftJoinAndSelect('p.corridor', 'c');
    if (org?.type === 'fleet') qb.where('p.fleet_org_id = :org', { org: org.id });
    else if (org?.type === 'brokerage') {
      qb.where('(p.broker_org_id = :org OR p.vehicle_id IN (SELECT vehicle_id FROM broker_network WHERE broker_org_id = :org))', { org: org.id });
    } else throw forbidden('Only fleets and brokers publish truck space', 'wrong_org_type');
    if (opts.vehicleId) qb.andWhere('p.vehicle_id = :vid', { vid: opts.vehicleId });
    if (opts.status !== 'all') qb.andWhere("p.status IN ('open','full')");
    qb.orderBy('p.departsAt', 'ASC').limit(200);
    const rows = await qb.getMany();
    return this.toDtos(rows);
  }

  async getDto(id: string): Promise<CapacityPostDto> {
    const post = await this.posts.findOne({ where: { id }, relations: POST_RELATIONS });
    if (!post) throw notFound('Truck space');
    return (await this.toDtos([post]))[0]!;
  }

  async toDtos(posts: CapacityPost[]): Promise<CapacityPostDto[]> {
    if (!posts.length) return [];
    const counts = await this.matches
      .createQueryBuilder('m')
      .select('m.capacity_post_id', 'id')
      .addSelect('count(*)', 'n')
      .where("m.capacity_post_id IN (:...ids) AND m.status IN ('pending_carrier','pending_shipper')", { ids: posts.map((p) => p.id) })
      .groupBy('m.capacity_post_id')
      .getRawMany<{ id: string; n: string }>();
    const pending = new Map(counts.map((c) => [c.id, Number(c.n)]));
    return posts.map((p) => ({
      id: p.id,
      kind: p.kind,
      status: p.status,
      vehicle: this.fleet.toVehicleDto(p.vehicle),
      driver: p.driver ? { id: p.driver.id, name: p.driver.fullName, phone: p.driver.phone } : null,
      fleetOrgId: p.fleetOrgId,
      fleetName: p.fleetOrg.name,
      brokerName: p.brokerOrg?.name ?? null,
      origin: this.reference.toPlaceDto(p.origin),
      destination: this.reference.toPlaceDto(p.destination),
      corridorName: p.corridor?.name ?? null,
      routeKm: p.routeKm,
      departsAt: p.departsAt.toISOString(),
      etaAt: p.etaAt?.toISOString() ?? null,
      bar: capacityBar(p),
      committedKg: p.committedKg,
      matchedKg: p.matchedKg,
      freeKg: Math.max(0, p.totalCapacityKg - p.committedKg - p.matchedKg),
      freeVolumeM3: p.freeVolumeM3,
      askingPerTonneEtb: p.askingPerTonneEtb,
      postedVia: p.postedVia,
      notes: p.notes,
      pendingOffers: pending.get(p.id) ?? 0,
      createdAt: p.createdAt.toISOString(),
    }));
  }

  /** Cleans up spaces whose departure passed without a trip. Runs every 10 minutes. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireStale(): Promise<void> {
    const cutoff = new Date(Date.now() - 3 * 3_600_000);
    const stale = await this.posts.find({ where: { status: In(['open', 'full']), departsAt: LessThan(cutoff) }, select: ['id', 'matchedKg'] });
    const unused = stale.filter((p) => p.matchedKg === 0).map((p) => p.id);
    if (unused.length) await this.posts.update({ id: In(unused) }, { status: 'expired' });
  }

  // ───────────────────────── authorization ─────────────────────────

  private async authorizePublisher(ctx: RequestContext, vehicle: Vehicle): Promise<{ postedVia: CapacityPost['postedVia']; brokerOrgId: string | null }> {
    const org = ctx.org;
    if (org?.type === 'fleet' && org.id === vehicle.ownerOrgId) {
      const isDriverOnly = org.role === 'driver';
      if (isDriverOnly && vehicle.currentDriverId !== ctx.userId) throw forbidden('You can only publish space for your own truck', 'not_your_truck');
      return { postedVia: isDriverOnly ? 'app' : 'fleet', brokerOrgId: null };
    }
    if (org?.type === 'brokerage') {
      const linked = await this.network.exist({ where: { brokerOrgId: org.id, vehicleId: vehicle.id } });
      if (linked) return { postedVia: 'broker', brokerOrgId: org.id };
    }
    // A driver acting from the driver app with no active org context may still own the assignment.
    if (vehicle.currentDriverId === ctx.userId) return { postedVia: 'app', brokerOrgId: null };
    throw forbidden('That truck is not in your fleet or broker network', 'not_your_truck');
  }

  private async loadAuthorized(ctx: RequestContext, id: string): Promise<CapacityPost> {
    const post = await this.posts.findOne({ where: { id }, relations: { vehicle: true } });
    if (!post) throw notFound('Truck space');
    await this.authorizePublisher(ctx, post.vehicle);
    return post;
  }
}
