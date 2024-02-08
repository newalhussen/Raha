import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  formatDay,
  formatTime,
  formatTonnes,
  startOfEthiopianMonth,
  toEthiopian,
  type FleetBoardDto,
  type FleetCountsDto,
  type FleetOfferDto,
  type FleetPerfRowDto,
  type FleetTripRowDto,
  type FleetTruckRowDto,
} from '@raha/contracts';
import type { RequestContext } from '../../common/request-context';
import { CapacityPost, Match, Membership, Payment, Trip, Vehicle } from '../../database/entities';
import { capacityBar, POST_RELATIONS } from '../capacity/capacity.service';
import { FleetService, vehicleLabel } from '../fleet/fleet.service';
import { MatchingService } from '../matching/matching.service';
import { ReferenceService } from '../reference/reference.service';
import { TRIP_RELATIONS, TripsService } from '../trips/trips.service';

const LATE_CHECKIN_HOURS = 3;

@Injectable()
export class FleetConsoleService {
  constructor(
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(CapacityPost) private readonly posts: Repository<CapacityPost>,
    @InjectRepository(Match) private readonly matches: Repository<Match>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    private readonly fleet: FleetService,
    private readonly matching: MatchingService,
    private readonly reference: ReferenceService,
    private readonly tripsService: TripsService,
  ) {}

  async counts(orgId: string): Promise<FleetCountsDto> {
    const [row] = await this.vehicles.query(
      `SELECT
         (SELECT count(*) FROM trips WHERE fleet_org_id = $1 AND status IN ('planned','to_pickup','loading','in_transit'))::int AS active_trips,
         (SELECT count(*) FROM matches m JOIN capacity_posts cp ON cp.id = m.capacity_post_id WHERE cp.fleet_org_id = $1 AND m.status = 'pending_carrier')::int AS offers,
         (SELECT count(*) FROM vehicles WHERE owner_org_id = $1)::int AS trucks,
         (SELECT count(*) FROM memberships WHERE organization_id = $1 AND role = 'driver' AND status <> 'removed')::int AS drivers`,
      [orgId],
    );
    return { activeTrips: row.active_trips, offers: row.offers, trucks: row.trucks, drivers: row.drivers };
  }

  async board(ctx: RequestContext, orgId: string): Promise<FleetBoardDto> {
    const [vehicles, posts, activeTrips, drivers, team] = await Promise.all([
      this.vehicles.find({ where: { ownerOrgId: orgId }, relations: { currentDriver: true, homePlace: true }, order: { plate: 'ASC' } }),
      this.posts.find({ where: { fleetOrgId: orgId, status: In(['open', 'full', 'departed']) }, relations: POST_RELATIONS, order: { departsAt: 'ASC' } }),
      this.trips.find({ where: { fleetOrgId: orgId, status: In(['planned', 'to_pickup', 'loading', 'in_transit']) }, relations: { origin: true, destination: true } }),
      this.fleet.listDrivers(orgId),
      this.memberships.find({ where: { organizationId: orgId, status: 'active', role: In(['owner', 'manager']) }, relations: { user: true } }),
    ]);

    // The space that describes each truck right now: its trip's space while on the road, else its next open space.
    const liveTripPosts = new Set(activeTrips.map((t) => t.capacityPostId).filter((x): x is string => !!x));
    const livePosts = posts.filter((p) => p.status !== 'departed' || liveTripPosts.has(p.id));
    const postsOf = new Map<string, CapacityPost[]>();
    for (const p of livePosts) postsOf.set(p.vehicleId, [...(postsOf.get(p.vehicleId) ?? []), p]);
    const postFor = (v: Vehicle): CapacityPost | null => {
      const list = postsOf.get(v.id) ?? [];
      const departed = list.find((p) => p.status === 'departed');
      const open = list.find((p) => p.status !== 'departed');
      return (v.status === 'on_trip' ? departed ?? open : open ?? departed) ?? null;
    };
    const tripByVehicle = new Map(activeTrips.filter((t) => t.status === 'in_transit').map((t) => [t.vehicleId, t]));
    const lastPlaceIds = [...tripByVehicle.values()].map((t) => t.lastPlaceId).filter((x): x is string => !!x);
    const lastPlaces = new Map((await Promise.all([...new Set(lastPlaceIds)].map((id) => this.reference.place(id)))).map((p) => [p.id, p]));

    const trucks: FleetTruckRowDto[] = vehicles.map((v) => {
      const post = postFor(v);
      const trip = tripByVehicle.get(v.id);
      const tonnes = (kg: number) => formatTonnes(kg, kg % 1000 === 0 ? 0 : 1).replace(' t', '');
      let nowLabel: string;
      let bar = { totalKg: v.maxLoadKg, inkKg: 0, amberKg: 0, freeKg: v.maxLoadKg };
      let capacityLabel = `Empty · ${tonnes(v.maxLoadKg)} t free`;

      if (v.status === 'off_road') {
        nowLabel = v.statusNote ?? (v.homePlace ? `Garage, ${v.homePlace.name}` : 'Off road');
        capacityLabel = 'Not available';
      } else if (trip) {
        const where = trip.lastPlaceId ? lastPlaces.get(trip.lastPlaceId)?.name : null;
        nowLabel = `${trip.origin.name} → ${trip.destination.name}${where ? ` · ${where}` : ''}`;
      } else if (post && post.status !== 'departed') {
        nowLabel = `${post.origin.name} → ${post.destination.name} · departs ${formatTime(post.departsAt)}`;
      } else {
        nowLabel = v.statusNote ?? (v.homePlace ? `${v.homePlace.name} yard` : 'Parked');
      }
      if (post && v.status !== 'off_road') {
        bar = capacityBar(post);
        const aboard = post.committedKg + post.matchedKg;
        const free = post.totalCapacityKg - aboard;
        capacityLabel = aboard === 0 ? `Empty · ${tonnes(post.totalCapacityKg)} t free` : `${tonnes(aboard)} / ${tonnes(post.totalCapacityKg)} t · ${tonnes(free)} t free`;
      } else if (v.currentLoadKg > 0 && v.status !== 'off_road') {
        bar = { totalKg: v.maxLoadKg, inkKg: v.currentLoadKg, amberKg: 0, freeKg: Math.max(0, v.maxLoadKg - v.currentLoadKg) };
        capacityLabel = `${tonnes(v.currentLoadKg)} / ${tonnes(v.maxLoadKg)} t · loading`;
      }
      return {
        vehicleId: v.id,
        plate: v.plate,
        model: vehicleLabel(v),
        driverName: v.currentDriver?.fullName ?? null,
        nowLabel,
        bar,
        capacityLabel,
        status: v.status,
        capacityPostId: post?.id ?? null,
      };
    });

    const month = startOfEthiopianMonth(new Date());
    const [{ recorded }] = await this.payments.query(
      `SELECT COALESCE(SUM(amount_etb),0)::float AS recorded FROM payments WHERE payee_org_id = $1 AND status = 'paid' AND paid_at >= $2`,
      [orgId, month],
    );

    const openSpace = livePosts.filter((p) => p.status !== 'full').reduce((n, p) => n + Math.max(0, p.totalCapacityKg - p.committedKg - p.matchedKg), 0);
    const counts = {
      onTrip: vehicles.filter((v) => v.status === 'on_trip').length,
      available: vehicles.filter((v) => v.status === 'available').length,
      offRoad: vehicles.filter((v) => v.status === 'off_road').length,
      loading: vehicles.filter((v) => v.status === 'loading').length,
      trucks: vehicles.length,
      drivers: drivers.length,
    };

    const perf = await this.performance(orgId, vehicles);
    const loadedKm = perf.reduce((n, p) => n + p.totalPct, 0);
    return {
      dateLabel: formatDay(new Date()),
      counts,
      openSpaceKg: openSpace,
      recordedMonthEtb: Math.round(Number(recorded)),
      monthLabel: toEthiopian(new Date()).monthName,
      trucks,
      offers: (await this.offers(ctx, orgId, 5)).slice(0, 5),
      perf: perf.slice(0, 5),
      fleetLoadedPct: perf.length ? Math.round(loadedKm / perf.length) : 0,
      drivers: drivers.slice(0, 6),
      expiringDocs: drivers.filter((d) => d.warn).length,
      team: {
        owner: team.find((m) => m.role === 'owner')?.user.fullName ?? null,
        manager: team.find((m) => m.role === 'manager')?.user.fullName ?? null,
        drivers: drivers.length,
      },
    };
  }

  /**
   * "Loaded vs empty km" over the last 30 days: for every journey a truck published space for,
   * how much of the truck was full of the owner's own contracts, how much of Raha matches, how much ran empty.
   */
  private async performance(orgId: string, vehicles: Vehicle[]): Promise<FleetPerfRowDto[]> {
    const rows: Array<{ vehicle_id: string; km: number; own: number; matched: number }> = await this.posts.query(
      `SELECT vehicle_id, COALESCE(route_km, 0)::float AS km,
              committed_kg::float / total_capacity_kg AS own, matched_kg::float / total_capacity_kg AS matched
         FROM capacity_posts
        WHERE fleet_org_id = $1 AND status IN ('departed','expired') AND departs_at >= now() - interval '30 days' AND route_km > 0`,
      [orgId],
    );
    const agg = new Map<string, { km: number; own: number; matched: number }>();
    for (const r of rows) {
      const a = agg.get(r.vehicle_id) ?? { km: 0, own: 0, matched: 0 };
      a.km += r.km;
      a.own += r.km * r.own;
      a.matched += r.km * r.matched;
      agg.set(r.vehicle_id, a);
    }
    return vehicles
      .filter((v) => agg.has(v.id))
      .map((v) => {
        const a = agg.get(v.id)!;
        const own = Math.round((a.own / a.km) * 100);
        const matched = Math.round((a.matched / a.km) * 100);
        return { vehicleId: v.id, plate: v.plate.replace(/ [A-Z]{1,3}$/, ''), loadedPct: own, matchedPct: matched, emptyPct: Math.max(0, 100 - own - matched), totalPct: own + matched };
      })
      .sort((a, b) => b.totalPct - a.totalPct);
  }

  /** Loads waiting on this fleet: answered, asked-of-us, and open loads that fit our published space. */
  async offers(ctx: RequestContext, orgId: string, limit = 30): Promise<FleetOfferDto[]> {
    const out: FleetOfferDto[] = [];
    const recent = await this.matches.find({
      where: { status: In(['pending_carrier', 'confirmed']) },
      relations: { shipment: { shipperOrg: true, loggedByOrg: true, pickupPlace: true, dropoffPlace: true }, capacityPost: { vehicle: true, driver: true } },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const notLeft = new Set((await this.trips.find({ where: { fleetOrgId: orgId, status: In(['planned', 'to_pickup', 'loading']) }, select: ['id'] })).map((t) => t.id));
    const mine = recent.filter((m) => m.capacityPost.fleetOrgId === orgId && m.isRahaMatch && (m.status === 'pending_carrier' || (m.tripId !== null && notLeft.has(m.tripId))));
    for (const m of mine.slice(0, 12)) {
      const s = m.shipment;
      const confirmed = m.status === 'confirmed';
      out.push({
        key: `m:${m.id}`,
        kind: confirmed ? 'accepted' : 'pending',
        shipmentId: s.id,
        matchId: m.id,
        capacityPostId: m.capacityPostId,
        title: `${s.weightKg.toLocaleString('en-US')} kg → ${s.dropoffPlace.name}`,
        forLabel: `for ${m.capacityPost.vehicle.plate.split(' ')[0]}`,
        subtitle: `${s.shipperOrg.name}${s.loggedByOrg ? ` · via ${s.loggedByOrg.name}` : ''} · ETB ${Math.round(m.priceEtb).toLocaleString('en-US')}`,
        priceEtb: m.priceEtb,
        stateLabel: confirmed ? `Accepted by ${(m.capacityPost.driver?.fullName ?? 'driver').split(' ')[0]}` : 'Waiting for you',
        canAssign: false,
        canAccept: !confirmed,
      });
    }

    const openPosts = await this.posts.find({ where: { fleetOrgId: orgId, status: 'open' }, relations: POST_RELATIONS, order: { departsAt: 'ASC' }, take: 12 });
    const seen = new Set(out.map((o) => o.shipmentId));
    for (const post of openPosts) {
      const loads = (await this.matching.loadsForPost(post, 'route', 8)).filter((l) => l.onRoute && l.fitsWeight && !seen.has(l.shipment.id));
      for (const l of loads) {
        seen.add(l.shipment.id);
        const s = l.shipment;
        const returnLeg = post.kind === 'return_leg';
        out.push({
          key: `s:${s.id}:${post.id}`,
          kind: 'assignable',
          shipmentId: s.id,
          matchId: null,
          capacityPostId: post.id,
          title: `${s.weightKg.toLocaleString('en-US')} kg ${s.pickupPlace.name} → ${s.dropoffPlace.name}`,
          forLabel: `${returnLeg ? 'return for' : 'for'} ${post.vehicle.plate.split(' ')[0]}`,
          subtitle: `${s.shipperOrg.name} · ETB ${Math.round(l.priceEtb).toLocaleString('en-US')}`,
          priceEtb: l.priceEtb,
          stateLabel: null,
          canAssign: true,
          canAccept: false,
        });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  async activeTrips(orgId: string): Promise<FleetTripRowDto[]> {
    const rows = await this.trips.find({ where: { fleetOrgId: orgId, status: In(['planned', 'to_pickup', 'loading', 'in_transit']) }, relations: TRIP_RELATIONS, order: { plannedDepartureAt: 'ASC' } });
    const out: FleetTripRowDto[] = [];
    for (const t of rows) {
      const route = await this.tripsService.routeFor(t);
      const stop = route.stops.find((s) => s.place.id === t.lastPlaceId);
      const pct = t.status === 'in_transit' && stop && route.routeKm ? Math.round((stop.km / route.routeKm) * 100) : 0;
      const late = t.status === 'in_transit' && !!t.lastCheckinAt && Date.now() - t.lastCheckinAt.getTime() > LATE_CHECKIN_HOURS * 3_600_000;
      out.push({
        tripId: t.id,
        ref: t.ref,
        status: t.status,
        route: `${t.origin.name} → ${t.destination.name}`,
        plate: t.vehicle.plate,
        driverName: t.driver.fullName,
        loads: t.loads.length,
        weightKg: t.loads.reduce((n, l) => n + l.weightKg, 0),
        progressPct: pct,
        lastLabel: t.status === 'in_transit' && t.lastCheckinAt ? `${stop?.place.name ?? 'Departed'} ${formatTime(t.lastCheckinAt)}` : t.plannedDepartureAt ? `departs ${formatTime(t.plannedDepartureAt)}` : '—',
        etaAt: t.etaAt?.toISOString() ?? null,
        late,
      });
    }
    return out;
  }
}
