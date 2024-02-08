import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import {
  formatAge,
  formatDay,
  formatTime,
  normalizeEthiopianPhone,
  type BoardLoadDto,
  type BoardTruckDto,
  type BrokerBoardDto,
  type BrokerCountsDto,
  type BrokerShipperDto,
  type BrokerTripRowDto,
  type InboxItemDto,
  type NetworkTruckDto,
} from '@raha/contracts';
import { badRequest, conflict, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { BrokerNetworkLink, CapacityPost, DriverProfile, InboundMessage, Membership, Organization, Shipment, Trip, User, Vehicle } from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { capacityBar, POST_RELATIONS } from '../capacity/capacity.service';
import { FleetService, normalizePlate, vehicleLabel } from '../fleet/fleet.service';
import { MatchingService } from '../matching/matching.service';
import { PricingService } from '../matching/pricing.service';
import { ReferenceService } from '../reference/reference.service';
import { cargoLabel, ShipmentViewService } from '../shipments/shipment-view.service';
import { ShipmentsService } from '../shipments/shipments.service';
import type { CreateShipmentDto } from '../shipments/shipments.dto';
import { TRIP_RELATIONS, TripsService } from '../trips/trips.service';
import type { AddNetworkTruckDto, LogLoadDto } from './broker.dto';

const ON_SHIFT_MINUTES = 45;
const LATE_CHECKIN_HOURS = 3;

@Injectable()
export class BrokerService {
  constructor(
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    @InjectRepository(CapacityPost) private readonly posts: Repository<CapacityPost>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(BrokerNetworkLink) private readonly network: Repository<BrokerNetworkLink>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(DriverProfile) private readonly driverProfiles: Repository<DriverProfile>,
    @InjectRepository(InboundMessage) private readonly inbound: Repository<InboundMessage>,
    private readonly matching: MatchingService,
    private readonly pricing: PricingService,
    private readonly shipmentsService: ShipmentsService,
    private readonly view: ShipmentViewService,
    private readonly tripsService: TripsService,
    private readonly fleet: FleetService,
    private readonly reference: ReferenceService,
    private readonly audit: AuditService,
  ) {}

  /** Loads this brokerage handles: logged by them, or belonging to shipper accounts they manage. */
  private handled(brokerOrgId: string, extra?: (qb: ReturnType<Repository<Shipment>['createQueryBuilder']>) => void) {
    const qb = this.shipments
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.shipperOrg', 'so')
      .leftJoinAndSelect('s.loggedByOrg', 'lo')
      .leftJoinAndSelect('s.pickupPlace', 'pp')
      .leftJoinAndSelect('s.dropoffPlace', 'dp')
      .where(new Brackets((b) => b.where('s.logged_by_org_id = :org', { org: brokerOrgId }).orWhere('so.managed_by_org_id = :org', { org: brokerOrgId })));
    extra?.(qb);
    return qb;
  }

  async counts(ctx: RequestContext, brokerOrgId: string): Promise<BrokerCountsDto> {
    const [row] = await this.orgs.query(
      `SELECT
         (SELECT count(*) FROM shipments s JOIN organizations so ON so.id = s.shipper_org_id
           WHERE s.status = 'requested' AND (s.logged_by_org_id = $1 OR so.managed_by_org_id = $1))::int AS open_loads,
         (SELECT count(DISTINCT t.id) FROM trips t JOIN trip_loads tl ON tl.trip_id = t.id JOIN shipments s ON s.id = tl.shipment_id
            JOIN organizations so ON so.id = s.shipper_org_id LEFT JOIN capacity_posts cp ON cp.id = t.capacity_post_id
           WHERE t.status IN ('planned','to_pickup','loading','in_transit') AND (s.logged_by_org_id = $1 OR so.managed_by_org_id = $1 OR cp.broker_org_id = $1))::int AS active_trips,
         (SELECT count(*) FROM inbound_messages WHERE org_id = $1 AND handled_at IS NULL)::int AS inbox`,
      [brokerOrgId],
    );
    const team = await this.memberships.find({ where: { organizationId: brokerOrgId, status: 'active' }, relations: { user: true, organization: true }, order: { createdAt: 'ASC' } });
    return {
      openLoads: row.open_loads,
      activeTrips: row.active_trips,
      inbox: row.inbox,
      area: team[0]?.organization.city ?? null,
      dispatchers: team.map((m) => ({ name: shortName(m.user.fullName), isMe: m.userId === ctx.userId, onShift: m.userId === ctx.userId || (!!m.user.appLastSeenAt && Date.now() - m.user.appLastSeenAt.getTime() < ON_SHIFT_MINUTES * 60_000) })),
    };
  }

  // ───────────────────────── match board ─────────────────────────

  async board(ctx: RequestContext, brokerOrgId: string): Promise<BrokerBoardDto> {
    const open = await this.handled(brokerOrgId, (qb) => qb.andWhere("s.status = 'requested'").orderBy('s.createdAt', 'ASC').take(40)).getMany();
    const loads: BoardLoadDto[] = [];
    for (const s of open) {
      const cands = await this.matching.rankForShipment(s.id);
      const returnLegs = cands.filter((c) => c.fit === 'empty_return').length;
      const n = cands.length;
      loads.push({
        shipmentId: s.id,
        ref: s.ref,
        pickup: this.reference.toPlaceDto(s.pickupPlace),
        dropoff: this.reference.toPlaceDto(s.dropoffPlace),
        weightKg: s.weightKg,
        shipperName: s.shipperOrg.name,
        cargoLabel: cargoLabel(s.cargoType),
        ageMinutes: Math.round((Date.now() - s.createdAt.getTime()) / 60_000),
        fitsLabel: n === 0 ? '0 fit · find truck' : returnLegs === n ? `${n} return leg${n > 1 ? 's' : ''}` : `${n} truck${n > 1 ? 's' : ''} fit`,
        fitCount: n,
        source: { app: 'Raha app', phone: 'Phone call', telegram: 'Telegram', broker: 'Raha app', fleet: 'Fleet', ops: 'Ops' }[s.source],
        readyAt: s.readyAt.toISOString(),
        status: s.status,
      });
    }

    const [trucksWithSpace, tripRows, inbox, team] = await Promise.all([
      this.posts
        .createQueryBuilder('p')
        .where("p.status = 'open' AND p.departs_at > now() - interval '3 hours'")
        .getCount(),
      this.activeTrips(brokerOrgId),
      this.inboxItems(brokerOrgId),
      this.memberships.find({ where: { organizationId: brokerOrgId, status: 'active' }, relations: { user: true, organization: true }, order: { createdAt: 'ASC' } }),
    ]);
    const org = team[0]?.organization ?? (await this.orgs.findOneByOrFail({ id: brokerOrgId }));
    return {
      dateLabel: formatDay(new Date()),
      openLoads: loads.length,
      trucksWithSpace,
      loads,
      trips: tripRows,
      attentionCount: tripRows.filter((t) => t.tone === 'red').length,
      inbox: inbox.slice(0, 4),
      dispatchers: team.map((m) => ({
        name: shortName(m.user.fullName),
        isMe: m.userId === ctx.userId,
        onShift: m.userId === ctx.userId || (!!m.user.appLastSeenAt && Date.now() - m.user.appLastSeenAt.getTime() < ON_SHIFT_MINUTES * 60_000),
      })),
      org: { name: org.name, area: org.city ?? org.address, dispatchers: team.length },
    };
  }

  /** Trucks that can take one of the broker's loads, best first, with the broker's fee. */
  async trucksFor(brokerOrgId: string, shipmentId: string): Promise<BoardTruckDto[]> {
    const s = await this.handled(brokerOrgId, (qb) => qb.andWhere('s.id = :id', { id: shipmentId })).getOne();
    if (!s) throw notFound('Load');
    const cands = await this.matching.rankForShipment(shipmentId);
    const mine = new Set((await this.network.find({ where: { brokerOrgId } })).map((n) => n.vehicleId));
    return cands.map((c) => {
      const base = this.matching.toTruckOption(c, s.weightKg, s.dropoffPlace.name);
      const fee = c.brokerFeeEtb || this.pricing.brokerFeeOn(c.priceEtb);
      const tag =
        c.fit === 'same_trip' ? `SAME TRIP · ${kgToT(c.post.totalCapacityKg - c.post.committedKg - c.post.matchedKg)} SPARE` : c.fit === 'empty_return' ? 'EMPTY RETURN' : c.fit === 'partial' ? 'PARTIAL' : 'DEDICATED';
      return {
        ...base,
        brokerFeeEtb: fee,
        ownerLabel: `${base.driver.name} · ${c.post.fleetOrg.name.endsWith('Transport') || c.post.fleetOrg.name.includes(' ') ? c.post.fleetOrg.name : 'own truck'}${mine.has(c.post.vehicleId) ? ' · your network' : ''}`,
        tag,
      };
    });
  }

  // ───────────────────────── logging loads from calls ─────────────────────────

  async logLoad(ctx: RequestContext, brokerOrgId: string, dto: LogLoadDto) {
    let shipperOrgId = dto.shipperOrgId;
    if (!shipperOrgId) {
      if (!dto.shipperName?.trim()) throw badRequest('shipper_required', 'Say which business this load is for');
      const existing = await this.orgs.findOne({ where: { managedByOrgId: brokerOrgId, type: 'shipper', name: dto.shipperName.trim() } });
      const org =
        existing ??
        (await this.orgs.save(
          this.orgs.create({ type: 'shipper', name: dto.shipperName.trim(), phone: dto.shipperPhone ? normalizeEthiopianPhone(dto.shipperPhone) : null, managedByOrgId: brokerOrgId, createdBy: ctx.userId }),
        ));
      shipperOrgId = org.id;
    } else {
      const org = await this.orgs.findOne({ where: { id: shipperOrgId } });
      if (!org || (org.managedByOrgId !== brokerOrgId && org.id !== brokerOrgId)) throw badRequest('not_your_shipper', 'That business is not one of your shippers');
    }
    const shipment = await this.shipmentsService.create(ctx, dto as CreateShipmentDto, { shipperOrgId, source: dto.source ?? 'phone', loggedByOrgId: brokerOrgId });
    return this.shipmentsService.detail(ctx, shipment.id);
  }

  // ───────────────────────── trips ─────────────────────────

  async activeTrips(brokerOrgId: string): Promise<BrokerTripRowDto[]> {
    const loadRows: Array<{ trip_id: string }> = await this.trips.query(
      `SELECT DISTINCT t.id AS trip_id
         FROM trips t
         JOIN trip_loads tl ON tl.trip_id = t.id
         JOIN shipments s ON s.id = tl.shipment_id
         JOIN organizations so ON so.id = s.shipper_org_id
         LEFT JOIN capacity_posts cp ON cp.id = t.capacity_post_id
        WHERE t.status IN ('planned','to_pickup','loading','in_transit')
          AND (s.logged_by_org_id = $1 OR so.managed_by_org_id = $1 OR cp.broker_org_id = $1)`,
      [brokerOrgId],
    );
    if (!loadRows.length) return [];
    const trips = await this.trips.find({ where: { id: In(loadRows.map((r) => r.trip_id)) }, relations: TRIP_RELATIONS });
    const out: BrokerTripRowDto[] = [];
    for (const t of trips) {
      const route = await this.tripsService.routeFor(t);
      const stop = route.stops.find((s) => s.place.id === t.lastPlaceId);
      const late = t.status === 'in_transit' && !!t.lastCheckinAt && Date.now() - t.lastCheckinAt.getTime() > LATE_CHECKIN_HOURS * 3_600_000;
      const atReceiver = t.status === 'in_transit' && t.lastPlaceId === t.destinationPlaceId;
      const pct = t.status === 'in_transit' && stop && route.routeKm ? Math.round((stop.km / route.routeKm) * 100) : t.status === 'loading' ? 8 : 0;
      const state: [string, BrokerTripRowDto['tone']] = late ? ['LATE CHECK-IN', 'red'] : atReceiver ? ['AT RECEIVER', 'red'] : t.status === 'in_transit' ? ['IN TRANSIT', 'lapis'] : t.status === 'loading' ? ['LOADING', 'amber'] : ['PLANNED', 'amber'];
      out.push({
        tripId: t.id,
        route: `${t.origin.name} → ${t.destination.name}`,
        stateLabel: state[0],
        tone: state[1],
        progressPct: Math.min(100, pct),
        who: `${shortName(t.driver.fullName)} · ${t.vehicle.plate.split(' ')[0]}`,
        lastLabel: late && t.lastCheckinAt ? `no check-in ${formatAge(t.lastCheckinAt).replace('h', ' h')}` : atReceiver ? 'PIN pending' : t.lastCheckinAt && stop ? `${stop.place.name} ${formatTime(t.lastCheckinAt)}` : t.status === 'loading' ? `at pickup ${formatTime(t.updatedAt)}` : t.plannedDepartureAt ? `departs ${formatTime(t.plannedDepartureAt)}` : '—',
      });
    }
    return out.sort((a, b) => (a.tone === 'red' ? -1 : 0) - (b.tone === 'red' ? -1 : 0));
  }

  // ───────────────────────── network & shippers ─────────────────────────

  async networkTrucks(brokerOrgId: string): Promise<NetworkTruckDto[]> {
    const links = await this.network.find({ where: { brokerOrgId } });
    if (!links.length) return [];
    const vehicles = await this.vehicles.find({ where: { id: In(links.map((l) => l.vehicleId)) }, relations: { owner: true, currentDriver: true, homePlace: true }, order: { plate: 'ASC' } });
    const onRoad = new Set(vehicles.filter((v) => v.status === 'on_trip').map((v) => v.id));
    const posts = (await this.posts.find({ where: { vehicleId: In(vehicles.map((v) => v.id)), status: In(['open', 'full', 'departed']) }, relations: POST_RELATIONS, order: { departsAt: 'DESC' } })).filter((p) => p.status !== 'departed' || (onRoad.has(p.vehicleId) && p.departsAt.getTime() > Date.now() - 4 * 86_400_000));
    const note = new Map(links.map((l) => [l.vehicleId, l.note]));
    return vehicles.map((v) => {
      const p = posts.find((x) => x.vehicleId === v.id);
      return {
        vehicleId: v.id,
        plate: v.plate,
        model: vehicleLabel(v),
        driverName: v.currentDriver?.fullName ?? null,
        ownerName: v.owner.name,
        status: v.status,
        nowLabel: p ? `${p.origin.name} → ${p.destination.name} · ${p.status === 'departed' ? 'on the road' : `departs ${formatTime(p.departsAt)}`}` : v.statusNote ?? (v.homePlace ? `${v.homePlace.name}` : 'Parked'),
        bar: p ? capacityBar(p) : null,
        note: note.get(v.id) ?? null,
      };
    });
  }

  /** Bring a truck that is not on Raha yet into the broker's network: owner, truck and driver in one step. */
  async addNetworkTruck(ctx: RequestContext, brokerOrgId: string, dto: AddNetworkTruckDto): Promise<NetworkTruckDto> {
    const plate = normalizePlate(dto.plate);
    let found = await this.vehicles.findOne({ where: { plate } });
    if (!found) {
      const phone = normalizeEthiopianPhone(dto.ownerPhone ?? '');
      if (!phone || !dto.ownerName?.trim()) throw badRequest('owner_required', 'This truck is new to Raha. Add the owner’s name and phone number.');
      let owner = await this.users.findOne({ where: { phone } });
      if (!owner) owner = await this.users.save(this.users.create({ phone, fullName: dto.ownerName.trim() }));
      let membership = await this.memberships.findOne({ where: { userId: owner.id, role: 'owner', status: In(['active', 'invited']) }, relations: { organization: true } });
      if (!membership || membership.organization.type !== 'fleet') {
        const org = await this.orgs.save(this.orgs.create({ type: 'fleet', name: `${dto.ownerName.trim()} (owner-operator)`, phone, createdBy: ctx.userId }));
        membership = await this.memberships.save(this.memberships.create({ userId: owner.id, organizationId: org.id, role: 'owner', status: owner.lastLoginAt ? 'active' : 'invited', invitedBy: ctx.userId }));
      }
      await this.driverProfiles.upsert({ userId: owner.id }, ['userId']);
      found = await this.fleet.createVehicle(ctx, membership.organizationId, {
        plate,
        makeModel: dto.makeModel ?? 'Truck',
        bodyType: dto.bodyType ?? 'dry_box',
        maxLoadKg: dto.maxLoadKg ?? 5000,
        driverUserId: owner.id,
      }).then((v) => this.vehicles.findOneByOrFail({ id: v.id }));
    }
    const vehicle = found as Vehicle;
    if (await this.network.exist({ where: { brokerOrgId, vehicleId: vehicle.id } })) throw conflict('already_in_network', `${plate} is already in your network`);
    await this.network.save(this.network.create({ brokerOrgId, vehicleId: vehicle.id, note: dto.note ?? null }));
    await this.audit.record({ actor: ctx, action: 'broker.network_add', entityType: 'vehicle', entityId: vehicle.id, data: { plate } });
    return (await this.networkTrucks(brokerOrgId)).find((t) => t.vehicleId === vehicle.id)!;
  }

  async removeNetworkTruck(ctx: RequestContext, brokerOrgId: string, vehicleId: string): Promise<void> {
    await this.network.delete({ brokerOrgId, vehicleId });
    await this.audit.record({ actor: ctx, action: 'broker.network_remove', entityType: 'vehicle', entityId: vehicleId });
  }

  async shippers(brokerOrgId: string): Promise<BrokerShipperDto[]> {
    const rows: Array<{ id: string; name: string; phone: string | null; managed: boolean; total: string; active: string; last: Date | null }> = await this.orgs.query(
      `SELECT o.id, o.name, o.phone, (o.managed_by_org_id = $1) AS managed,
              count(s.id) AS total,
              count(s.id) FILTER (WHERE s.status IN ('requested','matched','in_transit')) AS active,
              max(s.created_at) AS last
         FROM organizations o
         LEFT JOIN shipments s ON s.shipper_org_id = o.id AND (s.logged_by_org_id = $1 OR o.managed_by_org_id = $1)
        WHERE o.type = 'shipper' AND (o.managed_by_org_id = $1 OR s.logged_by_org_id = $1)
        GROUP BY o.id ORDER BY max(s.created_at) DESC NULLS LAST, o.name`,
      [brokerOrgId],
    );
    return rows.map((r) => ({ orgId: r.id, name: r.name, phone: r.phone, shipments: Number(r.total), active: Number(r.active), lastShipmentAt: r.last ? new Date(r.last).toISOString() : null, managed: r.managed }));
  }

  // ───────────────────────── inbox ─────────────────────────

  async inboxItems(brokerOrgId: string, includeHandled = false): Promise<InboxItemDto[]> {
    const rows = await this.inbound.find({ where: includeHandled ? { orgId: brokerOrgId } : { orgId: brokerOrgId, handledAt: undefined }, order: { createdAt: 'DESC' }, take: 40 });
    return rows
      .filter((r) => includeHandled || !r.handledAt)
      .map((r) => ({ id: r.id, channel: r.channel, fromName: r.fromName, fromPhone: r.fromPhone, body: r.body, ageLabel: formatAge(r.createdAt), handled: !!r.handledAt, createdAt: r.createdAt.toISOString() }));
  }

  async handleInbox(ctx: RequestContext, brokerOrgId: string, id: string): Promise<void> {
    await this.inbound.update({ id, orgId: brokerOrgId }, { handledAt: new Date(), handledBy: ctx.userId });
  }
}

const shortName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]![0]}.` : full;
};
const kgToT = (kg: number) => `${(kg / 1000).toFixed(kg % 1000 === 0 ? 0 : 1)} T`;
