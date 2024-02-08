import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { CARGO_TYPES, type BodyType, type CapacityKind, type CheckinChannel, type DeliveryCondition, type MemberRole, type OrgType, type ShipmentSource, type ShipmentStatus, type TripLoadStatus, type TripStatus, type VehicleStatus } from '@raha/contracts';
import { encryptString, hashPassword, pinDigest, randomCode, randomDigits, randomToken } from '../../common/crypto';
import { loadEnv } from '../../config/env';
import {
  CapacityPost,
  Corridor,
  CorridorStop,
  Delivery,
  DriverProfile,
  Match,
  Membership,
  Organization,
  Payment,
  Place,
  Proof,
  Shipment,
  Trip,
  TripCheckin,
  TripLoad,
  User,
  Vehicle,
} from '../entities';
import { ReferenceService, type ResolvedRoute } from '../../modules/reference/reference.service';
import { hatchPng } from './png';

/** Small deterministic PRNG so every `db:seed` produces the same network. */
export function rng(seed = 20261008): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const AVG_SPEED_KMH = 45;
const round50 = (n: number) => Math.round(n / 50) * 50;

export interface UserSpec { name: string; phone: string; language?: 'en' | 'am'; email?: string; telegram?: boolean; seenMinutesAgo?: number | null; neverLoggedIn?: boolean }
export interface OrgSpec { type: OrgType; name: string; nameAm?: string; city?: string; phone?: string; verified?: boolean; managedBy?: Organization | null; tin?: string; licence?: string; createdDaysAgo?: number }
export interface VehicleSpec { plate: string; model: string; year?: number; body?: BodyType; maxKg: number; volume?: number; driver?: User | null; status?: VehicleStatus; note?: string | null; home?: string; verified?: boolean }
export interface PostSpec { from: string; to: string; departsInHours: number; committedKg?: number; totalKg?: number; kind?: CapacityKind; status?: CapacityPost['status']; broker?: Organization | null; via?: CapacityPost['postedVia']; askingPerTonne?: number }
export interface ShipmentSpec {
  shipper: Organization;
  createdBy?: User | null;
  loggedBy?: Organization | null;
  source?: ShipmentSource;
  from: string;
  to: string;
  pickupAddress: string;
  dropoffAddress: string;
  receiver: { name: string; phone: string };
  pickupContact?: { name: string; phone: string };
  cargo: string;
  pieces?: number;
  weightKg: number;
  volumeM3?: number;
  readyInHours: number;
  status?: ShipmentStatus;
  priceEtb?: number;
  createdMinutesAgo?: number;
  requirements?: string[];
}

export class Kit {
  readonly now = new Date();
  readonly env = loadEnv();
  readonly rand = rng();
  readonly reference: ReferenceService;
  private readonly storageRoot: string;

  constructor(readonly ds: DataSource) {
    this.reference = new ReferenceService(ds.getRepository(Place), ds.getRepository(Corridor), ds.getRepository(CorridorStop));
    this.storageRoot = path.resolve(this.env.storageDir);
  }

  // ───────────────────────── time ─────────────────────────

  /** now + h hours (negative for the past). */
  hrs(h: number): Date {
    return new Date(this.now.getTime() + h * 3_600_000);
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rand() * list.length)]!;
  }

  between(lo: number, hi: number): number {
    return lo + this.rand() * (hi - lo);
  }

  // ───────────────────────── people & orgs ─────────────────────────

  async user(spec: UserSpec): Promise<User> {
    return this.ds.getRepository(User).save(
      this.ds.getRepository(User).create({
        phone: spec.phone,
        fullName: spec.name,
        language: spec.language ?? 'en',
        email: spec.email ?? null,
        telegramChatId: spec.telegram ? `tg_${spec.phone.slice(-9)}` : null,
        appLastSeenAt: spec.neverLoggedIn || spec.telegram ? null : spec.seenMinutesAgo === undefined ? this.hrs(-this.between(0.2, 30)) : spec.seenMinutesAgo === null ? null : new Date(this.now.getTime() - spec.seenMinutesAgo * 60_000),
        lastLoginAt: spec.neverLoggedIn ? null : this.hrs(-this.between(1, 200)),
        createdAt: this.hrs(-24 * this.between(20, 400)),
      }),
    );
  }

  async staff(spec: UserSpec & { email: string; password: string; role: User['staffRole'] }): Promise<User> {
    const u = await this.user({ ...spec, seenMinutesAgo: 2 });
    await this.ds.getRepository(User).update(u.id, { isStaff: true, staffRole: spec.role, email: spec.email, passwordHash: await hashPassword(spec.password) });
    return u;
  }

  async org(spec: OrgSpec): Promise<Organization> {
    return this.ds.getRepository(Organization).save(
      this.ds.getRepository(Organization).create({
        type: spec.type,
        name: spec.name,
        nameAm: spec.nameAm ?? null,
        city: spec.city ?? 'Addis Ababa',
        phone: spec.phone ?? null,
        tin: spec.tin ?? (spec.verified === false ? null : String(1000000000 + Math.floor(this.rand() * 8999999999))),
        tradeLicenceNo: spec.licence ?? (spec.verified === false ? null : `AA/${Math.floor(this.rand() * 90000 + 10000)}/${2012 + Math.floor(this.rand() * 12)}`),
        verificationStatus: spec.verified === false ? 'unverified' : 'verified',
        verifiedAt: spec.verified === false ? null : this.hrs(-24 * this.between(30, 300)),
        managedByOrgId: spec.managedBy?.id ?? null,
        createdAt: this.hrs(-24 * (spec.createdDaysAgo ?? this.between(40, 500))),
      }),
    );
  }

  async join(user: User, org: Organization, role: MemberRole, status: 'active' | 'invited' = 'active'): Promise<Membership> {
    return this.ds.getRepository(Membership).save(this.ds.getRepository(Membership).create({ userId: user.id, organizationId: org.id, role, status }));
  }

  async driver(user: User, p: { grade?: string; licence?: string; expiryYears?: number; verified?: boolean; trips?: number; faydaLast4?: string; home?: string } = {}): Promise<DriverProfile> {
    const verified = p.verified !== false;
    return this.ds.getRepository(DriverProfile).save(
      this.ds.getRepository(DriverProfile).create({
        userId: user.id,
        licenceNumber: verified ? p.licence ?? `AA-0${Math.floor(this.rand() * 9)}-${100 + Math.floor(this.rand() * 899)} ${100 + Math.floor(this.rand() * 899)}` : null,
        licenceGrade: verified ? p.grade ?? '5' : null,
        licenceExpiry: verified ? new Date(this.now.getTime() + (p.expiryYears ?? 2) * 365 * 86_400_000).toISOString().slice(0, 10) : null,
        faydaIdLast4: verified ? p.faydaLast4 ?? String(1000 + Math.floor(this.rand() * 8999)) : null,
        homePlaceId: p.home ? (await this.reference.placeByCode(p.home)).id : null,
        verificationStatus: verified ? 'verified' : 'unverified',
        verifiedAt: verified ? this.hrs(-24 * this.between(20, 300)) : null,
        tripsCompleted: p.trips ?? 0,
      }),
    );
  }

  async vehicle(org: Organization, s: VehicleSpec): Promise<Vehicle> {
    const verified = s.verified !== false;
    const v = await this.ds.getRepository(Vehicle).save(
      this.ds.getRepository(Vehicle).create({
        ownerOrgId: org.id,
        plate: s.plate,
        makeModel: s.model,
        year: s.year ?? 2018 + Math.floor(this.rand() * 6),
        bodyType: s.body ?? 'dry_box',
        maxLoadKg: s.maxKg,
        boxVolumeM3: s.volume ?? Math.round(s.maxKg / 262),
        currentLoadKg: 0,
        status: s.status ?? 'available',
        statusNote: s.note ?? null,
        currentDriverId: s.driver?.id ?? null,
        homePlaceId: s.home ? (await this.reference.placeByCode(s.home)).id : null,
        verificationStatus: verified ? 'verified' : 'unverified',
        verifiedAt: verified ? this.hrs(-24 * this.between(10, 200)) : null,
      }),
    );
    return v;
  }

  // ───────────────────────── capacity ─────────────────────────

  async route(from: string, to: string): Promise<ResolvedRoute> {
    return this.reference.resolveRoute((await this.reference.placeByCode(from)).id, (await this.reference.placeByCode(to)).id);
  }

  async post(vehicle: Vehicle, driver: User | null, fleet: Organization, s: PostSpec): Promise<CapacityPost> {
    const route = await this.route(s.from, s.to);
    const departs = this.hrs(s.departsInHours);
    const total = s.totalKg ?? vehicle.maxLoadKg;
    const committed = s.committedKg ?? 0;
    const post = await this.ds.getRepository(CapacityPost).save(
      this.ds.getRepository(CapacityPost).create({
        vehicleId: vehicle.id,
        driverId: driver?.id ?? null,
        fleetOrgId: fleet.id,
        brokerOrgId: s.broker?.id ?? null,
        postedBy: driver?.id ?? null,
        postedVia: s.via ?? (s.broker ? 'broker' : 'fleet'),
        kind: s.kind ?? (committed > 0 ? 'on_route' : 'dedicated'),
        corridorId: route.corridorId,
        originPlaceId: route.stops[0]!.place.id,
        destinationPlaceId: route.stops[route.stops.length - 1]!.place.id,
        departsAt: departs,
        etaAt: new Date(departs.getTime() + (route.routeKm / AVG_SPEED_KMH) * 3_600_000),
        totalCapacityKg: total,
        committedKg: committed,
        matchedKg: 0,
        routeKm: route.routeKm,
        status: s.status ?? (committed >= total ? 'full' : 'open'),
        askingPerTonneEtb: s.askingPerTonne ?? null,
        createdAt: new Date(Math.min(departs.getTime() - 3_600_000, this.now.getTime())),
      }),
    );
    await this.ds.query(
      `UPDATE capacity_posts SET route = (SELECT ST_MakeLine(p.location::geometry ORDER BY u.ord)::geography FROM unnest($1::uuid[]) WITH ORDINALITY AS u(id, ord) JOIN places p ON p.id = u.id) WHERE id = $2`,
      [route.stops.map((x) => x.place.id), post.id],
    );
    return post;
  }

  // ───────────────────────── shipments ─────────────────────────

  async nextRef(): Promise<string> {
    const [{ n }] = await this.ds.query(`SELECT nextval('shipment_ref_seq') AS n`);
    return `RH-${String(this.now.getFullYear() % 100).padStart(2, '0')}-${String(n).padStart(5, '0')}`;
  }

  async shipment(s: ShipmentSpec, ref?: string): Promise<Shipment & { pin: string | null }> {
    const status = s.status ?? 'requested';
    const cargo = CARGO_TYPES.find((c) => c.key === s.cargo)!;
    const pin = status === 'requested' ? null : randomDigits(4);
    const salt = pin ? randomToken(9) : null;
    const created = new Date(this.now.getTime() - (s.createdMinutesAgo ?? 20) * 60_000);
    const sh = await this.ds.getRepository(Shipment).save(
      this.ds.getRepository(Shipment).create({
        ref: ref ?? (await this.nextRef()),
        shipperOrgId: s.shipper.id,
        createdBy: s.createdBy?.id ?? null,
        loggedByOrgId: s.loggedBy?.id ?? null,
        source: s.source ?? 'app',
        pickupPlaceId: (await this.reference.placeByCode(s.from)).id,
        pickupAddress: s.pickupAddress,
        pickupContactName: s.pickupContact?.name ?? null,
        pickupContactPhone: s.pickupContact?.phone ?? null,
        dropoffPlaceId: (await this.reference.placeByCode(s.to)).id,
        dropoffAddress: s.dropoffAddress,
        receiverName: s.receiver.name,
        receiverPhone: s.receiver.phone,
        cargoType: s.cargo,
        pieces: s.pieces ?? null,
        weightKg: s.weightKg,
        volumeM3: s.volumeM3 ?? Math.round((s.weightKg / 330) * 10) / 10,
        requirements: [...(cargo.requires as readonly string[]), ...(s.requirements ?? [])],
        readyAt: this.hrs(s.readyInHours),
        status,
        agreedPriceEtb: s.priceEtb ?? null,
        receiverCode: randomCode(10),
        pinSalt: salt,
        pinHash: pin && salt ? pinDigest(salt, pin) : null,
        pinEnc: pin ? encryptString(this.env.pinEncKey, pin) : null,
        createdAt: created,
      }),
    );
    return Object.assign(sh, { pin });
  }

  // ───────────────────────── trips ─────────────────────────

  async trip(post: CapacityPost, driver: User, vehicle: Vehicle, status: TripStatus, o: { departedAt?: Date; completedAt?: Date; lastPlace?: string; lastAt?: Date; plannedDepartureAt?: Date } = {}): Promise<Trip> {
    const [{ n }] = await this.ds.query(`SELECT nextval('trip_ref_seq') AS n`);
    const route = await this.reference.resolveRoute(post.originPlaceId, post.destinationPlaceId);
    const last = o.lastPlace ? await this.reference.placeByCode(o.lastPlace) : null;
    const lastStop = last ? route.stops.find((s) => s.place.id === last.id) : null;
    const departed = o.departedAt ?? null;
    const eta = departed
      ? new Date((o.lastAt ?? departed).getTime() + (((route.routeKm - (lastStop?.km ?? 0)) / AVG_SPEED_KMH) * 3_600_000))
      : post.etaAt;
    return this.ds.getRepository(Trip).save(
      this.ds.getRepository(Trip).create({
        ref: `TR-${String(this.now.getFullYear() % 100).padStart(2, '0')}-${String(n).padStart(5, '0')}`,
        vehicleId: vehicle.id,
        driverId: driver.id,
        fleetOrgId: post.fleetOrgId,
        capacityPostId: post.id,
        corridorId: post.corridorId,
        originPlaceId: post.originPlaceId,
        destinationPlaceId: post.destinationPlaceId,
        status,
        plannedDepartureAt: o.plannedDepartureAt ?? post.departsAt,
        departedAt: departed,
        completedAt: o.completedAt ?? null,
        etaAt: o.completedAt ?? eta,
        lastPlaceId: last?.id ?? (departed ? post.originPlaceId : null),
        lastCheckinAt: o.lastAt ?? departed,
        createdAt: new Date(post.createdAt.getTime() + 600_000),
      }),
    );
  }

  /**
   * Put a shipment on a trip. Raha matches get a confirmed `matches` row and add to the post's matched_kg;
   * the fleet's own contracts are already counted in the post's committed_kg.
   */
  async load(
    trip: Trip,
    post: CapacityPost,
    sh: Shipment & { pin?: string | null },
    o: { raha: boolean; status: TripLoadStatus; priceEtb: number; dropOrder?: number; pickedUpAt?: Date; deliveredAt?: Date; proposedBy?: Match['proposedBy']; fit?: Match['fitKind']; brokerFee?: number; matchedAt?: Date },
  ): Promise<TripLoad> {
    const matchedAt = o.matchedAt ?? new Date(sh.createdAt.getTime() + 25 * 60_000);
    const match = await this.ds.getRepository(Match).save(
      this.ds.getRepository(Match).create({
        shipmentId: sh.id,
        capacityPostId: post.id,
        tripId: trip.id,
        status: 'confirmed',
        proposedBy: o.proposedBy ?? (o.raha ? 'shipper' : 'fleet'),
        priceEtb: o.priceEtb,
        brokerFeeEtb: o.brokerFee ?? 0,
        fitKind: o.fit ?? (post.kind === 'return_leg' ? 'empty_return' : post.committedKg > 0 ? 'same_trip' : 'dedicated'),
        isRahaMatch: o.raha,
        score: Math.round(this.between(68, 96) * 10) / 10,
        respondedAt: matchedAt,
        createdAt: new Date(matchedAt.getTime() - 10 * 60_000),
      }),
    );
    await this.ds.getRepository(Shipment).update(sh.id, { matchId: match.id, tripId: trip.id, agreedPriceEtb: o.priceEtb });
    if (o.raha) await this.ds.query(`UPDATE capacity_posts SET matched_kg = matched_kg + $1 WHERE id = $2`, [sh.weightKg, post.id]);
    return this.ds.getRepository(TripLoad).save(
      this.ds.getRepository(TripLoad).create({
        tripId: trip.id,
        shipmentId: sh.id,
        matchId: match.id,
        isRahaMatch: o.raha,
        weightKg: sh.weightKg,
        dropOrder: o.dropOrder ?? 1,
        status: o.status,
        pickupChecklist: ['picked_up', 'in_transit', 'delivered'].includes(o.status) ? { counted: true, noDamage: true, waybill: true } : null,
        pickedUpAt: o.pickedUpAt ?? null,
        arrivedPickupAt: o.pickedUpAt ? new Date(o.pickedUpAt.getTime() - 12 * 60_000) : null,
        deliveredAt: o.deliveredAt ?? null,
      }),
    );
  }

  async checkins(trip: Trip, entries: Array<{ place: string; at: Date; channel?: CheckinChannel; offline?: boolean }>): Promise<void> {
    for (const e of entries) {
      await this.ds.getRepository(TripCheckin).save(
        this.ds.getRepository(TripCheckin).create({
          tripId: trip.id,
          placeId: (await this.reference.placeByCode(e.place)).id,
          clientId: randomUUID(),
          channel: e.channel ?? 'app',
          checkedInAt: e.at,
          receivedAt: new Date(e.at.getTime() + (e.offline ? 40 * 60_000 : 3_000)),
          offline: e.offline ?? false,
        }),
      );
    }
  }

  /** Evenly spaced check-ins from departure until `until`, at every stop passed on the way. */
  async autoCheckins(trip: Trip, route: ResolvedRoute, departedAt: Date, upToKm: number): Promise<{ place: string; at: Date } | null> {
    let lastEntry: { place: string; at: Date } | null = null;
    const entries = route.stops
      .filter((s) => s.km > 0 && s.km <= upToKm)
      .map((s) => ({ place: s.place.code, at: new Date(departedAt.getTime() + (s.km / AVG_SPEED_KMH) * 3_600_000 + this.between(-10, 25) * 60_000) }));
    await this.checkins(trip, entries);
    lastEntry = entries[entries.length - 1] ?? null;
    return lastEntry;
  }

  async deliver(trip: Trip, load: TripLoad, sh: Shipment, o: { at: Date; confirmedBy?: Delivery['confirmedBy']; condition?: DeliveryCondition; flag?: string | null; received?: number; photo?: boolean; paid?: { method: NonNullable<Payment['method']>; at: Date } | null; amountEtb: number; payerOrgId: string; reviewed?: boolean }): Promise<void> {
    await this.ds.getRepository(Delivery).save(
      this.ds.getRepository(Delivery).create({
        shipmentId: sh.id,
        tripLoadId: load.id,
        deliveredAt: o.at,
        confirmedBy: o.confirmedBy ?? 'pin',
        pinVerified: (o.confirmedBy ?? 'pin') === 'pin',
        condition: o.condition ?? 'all_good',
        receivedCount: o.received ?? null,
        expectedCount: sh.pieces,
        reviewFlag: o.flag ?? null,
        reviewedAt: o.reviewed ? new Date(o.at.getTime() + 3_600_000) : null,
        createdAt: o.at,
      }),
    );
    await this.ds.getRepository(Shipment).update(sh.id, { status: 'delivered', deliveredAt: o.at, pinVerifiedAt: (o.confirmedBy ?? 'pin') === 'pin' ? o.at : null });
    if (o.photo !== false) await this.proof(sh, load, 'delivery_photo', o.at);
    await this.ds.getRepository(Payment).save(
      this.ds.getRepository(Payment).create({
        shipmentId: sh.id,
        tripId: trip.id,
        payerOrgId: o.payerOrgId,
        payeeOrgId: trip.fleetOrgId,
        amountEtb: o.amountEtb,
        method: o.paid?.method ?? null,
        status: o.paid ? 'paid' : 'pending',
        dueAt: new Date(o.at.getTime() + 7 * 86_400_000),
        paidAt: o.paid?.at ?? null,
        reference: o.paid ? `${o.paid.method === 'telebirr' ? 'TB' : o.paid.method === 'cbe' ? 'CBE' : 'PAY'}${Math.floor(this.rand() * 9_000_000 + 1_000_000)}` : null,
        createdAt: o.at,
      }),
    );
  }

  // ───────────────────────── files ─────────────────────────

  async storeFile(tone = 0): Promise<string> {
    const d = new Date();
    const key = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.png`;
    const full = path.join(this.storageRoot, key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, hatchPng(480, 320, tone, 10 + Math.floor(this.rand() * 10)));
    return key;
  }

  async proof(sh: Shipment, load: TripLoad | null, kind: Proof['kind'], at: Date): Promise<void> {
    await this.ds.getRepository(Proof).save(
      this.ds.getRepository(Proof).create({ shipmentId: sh.id, tripLoadId: load?.id ?? null, kind, fileKey: await this.storeFile(this.between(0, 12)), clientId: randomUUID(), bytes: 80_000, takenAt: at }),
    );
  }

  round50 = round50;
}
