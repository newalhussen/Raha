import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { formatTonnes, initials, type BodyType, type FitKind, type ScoreDetailDto, type TruckOptionDto } from '@raha/contracts';
import type { GeoPoint } from '../../common/geo';
import { CapacityPost, DriverProfile, Match, Shipment } from '../../database/entities';
import { AVG_SPEED_KMH, POST_RELATIONS } from '../capacity/capacity.service';
import { FleetService } from '../fleet/fleet.service';
import { PricingService } from './pricing.service';

/** How far (km) a pickup/drop-off may sit from a truck's line of travel and still count as "on the way". */
export const DEFAULT_DETOUR_KM = 15;
const MIN_LEG_FRACTION = 0.01;

/** The parts of a shipment matching needs — lets the UI preview options before anything is saved. */
export interface ShipSpec {
  /** Present for saved shipments so existing proposals are reported. */
  id: string | null;
  weightKg: number;
  volumeM3: number | null;
  readyAt: Date;
  readyUntil: Date | null;
  requirements: string[];
  pickup: GeoPoint;
  dropoff: GeoPoint;
}

export interface MatchCandidate {
  post: CapacityPost;
  /** Position of pickup / drop-off along the truck's route (0 = origin, 1 = destination). */
  fPick: number;
  fDrop: number;
  offRouteKm: number;
  /** Road km the load travels on this truck. */
  distanceKm: number;
  pickupAt: Date;
  etaAt: Date;
  fit: FitKind;
  priceEtb: number;
  brokerFeeEtb: number;
  savingsPct: number | null;
  score: ScoreDetailDto;
  existingMatch: { id: string; status: Match['status'] } | null;
}

export interface RankOptions {
  detourKm?: number;
  limit?: number;
}

interface GeoRow {
  post_id: string;
  f_pick: number;
  f_drop: number;
  d_pick_km: number;
  d_drop_km: number;
}

/** A load that could go on a given truck, from the driver's point of view. */
export interface LoadForPost {
  shipment: Shipment;
  fPick: number;
  fDrop: number;
  dPickKm: number;
  dDropKm: number;
  /** Distance from the truck's origin town to the pickup point. */
  fromOriginKm: number;
  onRoute: boolean;
  fitsWeight: boolean;
  distanceKm: number;
  priceEtb: number;
}

/** Requirements a cargo has vs what each truck body offers. */
export function bodyCompatible(requirements: string[], body: BodyType): boolean {
  const need = new Set(requirements);
  if (need.has('container')) return body === 'container';
  if (need.has('flatbed')) return body === 'flatbed';
  if (need.has('perishable')) return body === 'refrigerated';
  if (need.has('covered')) return ['dry_box', 'refrigerated', 'container', 'pickup'].includes(body);
  return true;
}

@Injectable()
export class MatchingService {
  constructor(
    @InjectRepository(CapacityPost) private readonly posts: Repository<CapacityPost>,
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    @InjectRepository(Match) private readonly matches: Repository<Match>,
    @InjectRepository(DriverProfile) private readonly driverProfiles: Repository<DriverProfile>,
    private readonly db: DataSource,
    private readonly pricing: PricingService,
    private readonly fleet: FleetService,
  ) {}

  async specOf(shipmentId: string): Promise<ShipSpec> {
    const s = await this.shipments.findOneOrFail({ where: { id: shipmentId }, relations: { pickupPlace: true, dropoffPlace: true } });
    return {
      id: s.id,
      weightKg: s.weightKg,
      volumeM3: s.volumeM3,
      readyAt: s.readyAt,
      readyUntil: s.readyUntil,
      requirements: s.requirements,
      pickup: s.pickupPoint ?? s.pickupPlace.location,
      dropoff: s.dropoffPoint ?? s.dropoffPlace.location,
    };
  }

  /**
   * Trucks that can carry this load, best first.
   *
   * 1. PostGIS narrows to open posts whose route passes within `detourKm` of BOTH the pickup and the
   *    drop-off (GiST-indexed ST_DWithin), with enough free weight/volume and a compatible departure window.
   * 2. ST_LineLocatePoint puts pickup and drop-off on the truck's line; the load must travel forward.
   * 3. Each survivor is priced and scored (fit, detour, timing, reliability, price, return-leg bonus).
   */
  async rankForShipment(shipmentId: string, opts: RankOptions = {}): Promise<MatchCandidate[]> {
    return this.rankForSpec(await this.specOf(shipmentId), opts);
  }

  async rankForSpec(spec: ShipSpec, opts: RankOptions = {}): Promise<MatchCandidate[]> {
    const detourKm = opts.detourKm ?? DEFAULT_DETOUR_KM;
    const pick = `ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography`;
    const drop = `ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography`;

    const rows: GeoRow[] = await this.db.query(
      `SELECT cp.id AS post_id,
              ST_LineLocatePoint(cp.route::geometry, ${pick}::geometry) AS f_pick,
              ST_LineLocatePoint(cp.route::geometry, ${drop}::geometry) AS f_drop,
              ST_Distance(cp.route, ${pick}) / 1000.0 AS d_pick_km,
              ST_Distance(cp.route, ${drop}) / 1000.0 AS d_drop_km
         FROM capacity_posts cp
         JOIN vehicles v ON v.id = cp.vehicle_id
        WHERE cp.status = 'open'
          AND v.status <> 'off_road'
          AND v.verification_status = 'verified'
          AND cp.total_capacity_kg - cp.committed_kg - cp.matched_kg >= $5
          AND ($6::numeric IS NULL OR cp.free_volume_m3 IS NULL OR cp.free_volume_m3 >= $6)
          AND cp.departs_at >= $7::timestamptz - interval '1 hour'
          AND cp.departs_at <= COALESCE($8::timestamptz, $7::timestamptz + interval '48 hours')
          AND ST_DWithin(cp.route, ${pick}, $9)
          AND ST_DWithin(cp.route, ${drop}, $9)`,
      [spec.pickup.coordinates[0], spec.pickup.coordinates[1], spec.dropoff.coordinates[0], spec.dropoff.coordinates[1], spec.weightKg, spec.volumeM3, spec.readyAt, spec.readyUntil, detourKm * 1000],
    );

    const forward = rows.filter((r) => r.f_drop - r.f_pick >= MIN_LEG_FRACTION);
    if (!forward.length) return [];

    const posts = await this.posts.find({ where: { id: In(forward.map((r) => r.post_id)) }, relations: POST_RELATIONS });
    const byId = new Map(posts.map((p) => [p.id, p]));
    const live = spec.id ? await this.matches.find({ where: { shipmentId: spec.id, status: In(['pending_carrier', 'pending_shipper', 'confirmed']) } }) : [];
    const liveByPost = new Map(live.map((m) => [m.capacityPostId, m]));

    const trips = await this.tripCounts(posts);
    const out: MatchCandidate[] = [];
    for (const r of forward) {
      const post = byId.get(r.post_id);
      if (!post || !bodyCompatible(spec.requirements, post.vehicle.bodyType)) continue;
      out.push(this.toCandidate(spec, post, r, liveByPost.get(post.id) ?? null, trips.get(post.driverId ?? '') ?? 0));
    }
    out.sort((a, b) => b.score.total - a.score.total || a.priceEtb - b.priceEtb);
    return opts.limit ? out.slice(0, opts.limit) : out;
  }

  /** Does `post` still fit this saved shipment? Used when a proposal is made or confirmed. */
  async evaluate(shipmentId: string, postId: string, detourKm = DEFAULT_DETOUR_KM): Promise<MatchCandidate | null> {
    const spec = await this.specOf(shipmentId);
    const [row]: GeoRow[] = await this.db.query(
      `SELECT cp.id AS post_id,
              ST_LineLocatePoint(cp.route::geometry, ST_SetSRID(ST_MakePoint($2, $3), 4326)) AS f_pick,
              ST_LineLocatePoint(cp.route::geometry, ST_SetSRID(ST_MakePoint($4, $5), 4326)) AS f_drop,
              ST_Distance(cp.route, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography) / 1000.0 AS d_pick_km,
              ST_Distance(cp.route, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography) / 1000.0 AS d_drop_km
         FROM capacity_posts cp WHERE cp.id = $1`,
      [postId, spec.pickup.coordinates[0], spec.pickup.coordinates[1], spec.dropoff.coordinates[0], spec.dropoff.coordinates[1]],
    );
    if (!row || row.f_drop - row.f_pick < MIN_LEG_FRACTION) return null;
    if (row.d_pick_km > detourKm || row.d_drop_km > detourKm) return null;
    const post = await this.posts.findOne({ where: { id: postId }, relations: POST_RELATIONS });
    if (!post || !bodyCompatible(spec.requirements, post.vehicle.bodyType)) return null;
    const trips = await this.tripCounts([post]);
    return this.toCandidate(spec, post, row, null, trips.get(post.driverId ?? '') ?? 0);
  }

  /**
   * The inverse question, for the driver app: which open loads suit this truck?
   *  - `route`: pickup and drop-off both within the detour tolerance of the truck's line, travelling forward,
   *  - `near`:  pickup within 40 km of where the truck starts (any direction),
   *  - `all`:   every open load, nearest pickup first.
   * Loads that are on the way but heavier than the free space are returned flagged so the UI can grey them out.
   */
  async loadsForPost(post: CapacityPost, mode: 'route' | 'near' | 'all', limit = 40, detourKm = DEFAULT_DETOUR_KM): Promise<LoadForPost[]> {
    const spatial =
      mode === 'route'
        ? `AND ST_DWithin(cp.route, pick.g, $2) AND ST_DWithin(cp.route, dst.g, $2)`
        : mode === 'near'
          ? `AND ST_DWithin(o.location, pick.g, 40000)`
          : '';
    const rows: Array<GeoRow & { shipment_id: string; from_origin_km: number }> = await this.db.query(
      `SELECT s.id AS shipment_id, cp.id AS post_id,
              ST_LineLocatePoint(cp.route::geometry, pick.g::geometry) AS f_pick,
              ST_LineLocatePoint(cp.route::geometry, dst.g::geometry) AS f_drop,
              ST_Distance(cp.route, pick.g) / 1000.0 AS d_pick_km,
              ST_Distance(cp.route, dst.g) / 1000.0 AS d_drop_km,
              ST_Distance(o.location, pick.g) / 1000.0 AS from_origin_km
         FROM capacity_posts cp
         JOIN places o ON o.id = cp.origin_place_id
         JOIN shipments s ON s.status = 'requested'
         JOIN places pp ON pp.id = s.pickup_place_id
         JOIN places dp ON dp.id = s.dropoff_place_id
         CROSS JOIN LATERAL (SELECT COALESCE(s.pickup_point, pp.location) AS g) pick
         CROSS JOIN LATERAL (SELECT COALESCE(s.dropoff_point, dp.location) AS g) dst
        WHERE cp.id = $1
          AND s.ready_at <= cp.departs_at + interval '12 hours'
          AND COALESCE(s.ready_until, s.ready_at + interval '48 hours') >= cp.departs_at - interval '1 hour'
          ${spatial}
        ORDER BY from_origin_km ASC
        LIMIT $3`,
      [post.id, detourKm * 1000, limit * 2],
    );
    if (!rows.length) return [];

    const shipments = await this.shipments.find({ where: { id: In(rows.map((r) => r.shipment_id)) }, relations: { pickupPlace: true, dropoffPlace: true, shipperOrg: true } });
    const byId = new Map(shipments.map((s) => [s.id, s]));
    const free = post.totalCapacityKg - post.committedKg - post.matchedKg;
    const routeKm = post.routeKm ?? 1;

    const out: LoadForPost[] = [];
    for (const r of rows) {
      const s = byId.get(r.shipment_id);
      if (!s || !bodyCompatible(s.requirements, post.vehicle?.bodyType ?? 'dry_box')) continue;
      const onRoute = r.f_drop - r.f_pick >= MIN_LEG_FRACTION && r.d_pick_km <= detourKm && r.d_drop_km <= detourKm;
      const distanceKm = onRoute ? Math.max(1, Math.round((r.f_drop - r.f_pick) * routeKm)) : Math.max(1, Math.round(routeKm * 0.5));
      const { priceEtb, brokerFeeEtb } = this.pricing.priceFor(post, s.weightKg, distanceKm);
      out.push({
        shipment: s,
        fPick: r.f_pick,
        fDrop: r.f_drop,
        dPickKm: r.d_pick_km,
        dDropKm: r.d_drop_km,
        fromOriginKm: Math.round(r.from_origin_km * 10) / 10,
        onRoute,
        fitsWeight: s.weightKg <= free,
        distanceKm,
        priceEtb: priceEtb - brokerFeeEtb,
      });
    }
    return out.slice(0, limit);
  }

  // ───────────────────────── scoring ─────────────────────────

  private async tripCounts(posts: CapacityPost[]): Promise<Map<string, number>> {
    const ids = [...new Set(posts.map((p) => p.driverId).filter((x): x is string => !!x))];
    if (!ids.length) return new Map();
    const rows = await this.driverProfiles.find({ where: { userId: In(ids) }, select: ['userId', 'tripsCompleted'] });
    return new Map(rows.map((r) => [r.userId, r.tripsCompleted]));
  }

  private toCandidate(spec: ShipSpec, post: CapacityPost, r: GeoRow, existing: Match | null, carrierTrips: number): MatchCandidate {
    const routeKm = post.routeKm ?? 1;
    const distanceKm = Math.max(1, Math.round((r.f_drop - r.f_pick) * routeKm));
    const offRouteKm = Math.round(Math.max(r.d_pick_km, r.d_drop_km) * 10) / 10;

    const departs = post.departsAt.getTime();
    const hoursPerRoute = routeKm / AVG_SPEED_KMH;
    const atOrigin = r.f_pick < 0.03;
    const pickupAt = atOrigin
      ? new Date(Math.min(Math.max(spec.readyAt.getTime(), departs - 6 * 3_600_000), departs - 30 * 60_000))
      : new Date(departs + r.f_pick * hoursPerRoute * 3_600_000);
    const etaAt = new Date(departs + r.f_drop * hoursPerRoute * 3_600_000);

    const fit = this.fitKind(post, spec);
    const { priceEtb, brokerFeeEtb } = this.pricing.priceFor(post, spec.weightKg, distanceKm);
    const savingsPct = this.pricing.savingsPct(priceEtb, spec.weightKg, distanceKm);

    // --- scoring: 0-100, higher is better ------------------------------------------
    const used = post.committedKg + post.matchedKg + spec.weightKg;
    const fitScore = Math.min(100, (used / post.totalCapacityKg) * 100); // fuller trucks mean less waste
    const detourScore = 100 * (1 - Math.min(1, offRouteKm / DEFAULT_DETOUR_KM));
    const slackHours = Math.abs(departs - spec.readyAt.getTime()) / 3_600_000;
    const timingScore = slackHours <= 6 ? 100 : Math.max(0, 100 - ((slackHours - 6) / 42) * 100);
    // verified (required to be listed) is worth 40; track record on Raha earns the other 60
    const reliabilityScore = 40 + 60 * Math.min(1, carrierTrips / 200);
    const priceScore = savingsPct === null ? 30 : Math.min(100, savingsPct * 2.2);
    const returnBonus = post.kind === 'return_leg' || (post.committedKg + post.matchedKg === 0 && post.kind !== 'dedicated') ? 10 : 0;

    const weighted = fitScore * 0.3 + detourScore * 0.2 + timingScore * 0.2 + reliabilityScore * 0.15 + priceScore * 0.15 + returnBonus;
    const score: ScoreDetailDto = {
      total: Math.round(Math.min(100, weighted) * 10) / 10,
      fit: Math.round(fitScore),
      detour: Math.round(detourScore),
      timing: Math.round(timingScore),
      reliability: Math.round(reliabilityScore),
      price: Math.round(priceScore),
      returnLegBonus: returnBonus,
    };

    return {
      post,
      fPick: r.f_pick,
      fDrop: r.f_drop,
      offRouteKm,
      distanceKm,
      pickupAt,
      etaAt,
      fit,
      priceEtb,
      brokerFeeEtb,
      savingsPct,
      score,
      existingMatch: existing ? { id: existing.id, status: existing.status } : null,
    };
  }

  /** same_trip: partly loaded & leaving soon · partial: partly loaded, leaving later · empty_return · dedicated. */
  fitKind(post: CapacityPost, spec: Pick<ShipSpec, 'readyAt'>): FitKind {
    if (post.kind === 'dedicated') return 'dedicated';
    if (post.kind === 'return_leg' || post.committedKg + post.matchedKg === 0) return 'empty_return';
    const hours = (post.departsAt.getTime() - spec.readyAt.getTime()) / 3_600_000;
    return hours <= 12 ? 'same_trip' : 'partial';
  }

  // ───────────────────────── presentation ─────────────────────────

  toTruckOption(c: MatchCandidate, weightKg: number, dropoffName: string): TruckOptionDto {
    const { post } = c;
    const freeAfter = Math.max(0, post.totalCapacityKg - post.committedKg - post.matchedKg - weightKg);
    const aboardKg = post.committedKg + post.matchedKg;
    const bar = { totalKg: post.totalCapacityKg, inkKg: post.committedKg, amberKg: post.matchedKg + weightKg, freeKg: freeAfter };
    const tonnes = (kg: number) => formatTonnes(kg, kg % 1000 === 0 ? 0 : 1);
    const tonnesCaps = (kg: number) => tonnes(kg).toUpperCase();

    let fitBanner: string | null = null;
    if (c.fit === 'same_trip') fitBanner = `ALREADY GOING TO ${dropoffName.toUpperCase()} · HAS ${tonnesCaps(post.totalCapacityKg - aboardKg)} SPARE`;
    if (c.fit === 'empty_return') fitBanner = `RETURN TRIP TO ${dropoffName.toUpperCase()} · RUNNING EMPTY`;

    const capacityNote =
      c.fit === 'empty_return'
        ? `${tonnes(post.totalCapacityKg)} truck · empty return leg`
        : c.fit === 'dedicated'
          ? `${tonnes(post.totalCapacityKg)} truck · dedicated`
          : `${tonnes(post.totalCapacityKg)} truck · ${tonnes(aboardKg)} aboard · your ${weightKg.toLocaleString('en-US')} kg fits`;

    const priceNote = c.savingsPct
      ? `${c.savingsPct}% below a dedicated truck`
      : c.fit === 'dedicated'
        ? 'Dedicated, fastest'
        : post.brokerOrg
          ? 'Broker-managed'
          : 'Shared truck';

    const driverName = post.driver?.fullName ?? 'Driver';
    return {
      capacityPostId: post.id,
      fit: c.fit,
      fitBanner,
      highlighted: c.fit === 'same_trip' || c.fit === 'empty_return',
      driver: { id: post.driver?.id ?? null, name: driverName, initials: initials(driverName), verified: true },
      fleetName: post.fleetOrg.name,
      viaBroker: post.brokerOrg?.name ?? null,
      plate: post.vehicle.plate,
      vehicleLabel: this.fleet.toVehicleDto(post.vehicle).label,
      bar,
      capacityNote,
      pickupAt: c.pickupAt.toISOString(),
      departsAt: post.departsAt.toISOString(),
      etaAt: c.etaAt.toISOString(),
      priceEtb: c.priceEtb,
      priceNote,
      savingsPct: c.savingsPct,
      brokerFeeEtb: c.brokerFeeEtb,
      offRouteKm: c.offRouteKm,
      distanceKm: c.distanceKm,
      score: c.score,
      existingMatch: c.existingMatch,
    };
  }
}
