import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import {
  ETHIOPIAN_MONTHS,
  formatTime,
  formatTonnes,
  initials,
  piecesLabel,
  startOfEthiopianMonth,
  toEthiopian,
  type CapacityBarDto,
  type DriverEarningsDto,
  type DriverHomeDto,
  type DriverLoadDetailDto,
  type DriverLoadDto,
  type DriverNextAction,
  type DriverProfileDto,
  type DriverTripDetailDto,
  type DriverTripLoadDto,
  type DriverTripSummaryDto,
  type DriverVehicleDto,
  type DriverVerificationRow,
  type ReturnLoadsDto,
  type SyncAction,
  type SyncResult,
} from '@raha/contracts';
import { DomainError, badRequest, conflict, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import {
  CapacityPost,
  DriverProfile,
  Issue,
  Match,
  Organization,
  Payment,
  Shipment,
  Trip,
  Vehicle,
  Membership,
  User,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { CapacityService, POST_RELATIONS, capacityBar } from '../capacity/capacity.service';
import { FleetService, normalizePlate } from '../fleet/fleet.service';
import { MatchesService } from '../matching/matches.service';
import { MatchingService, type LoadForPost } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReferenceService } from '../reference/reference.service';
import { VerificationService } from '../verification/verification.service';
import { buildStrip } from '../trips/strip';
import { TripsService, TRIP_RELATIONS } from '../trips/trips.service';
import { cargoLabel } from '../shipments/shipment-view.service';
import type { CheckinDto, DeliverDto, OnboardDto, PickupDto, RegisterTruckDto, ReportIssueDto } from './driver.dto';

const WEEK_MS = 7 * 86_400_000;
const EAT_OFFSET_MS = 3 * 3_600_000;

function startOfWeekEat(now: Date): Date {
  const eat = new Date(now.getTime() + EAT_OFFSET_MS);
  const dow = (eat.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate() - dow) - EAT_OFFSET_MS);
}

@Injectable()
export class DriverService {
  constructor(
    @InjectRepository(DriverProfile) private readonly profiles: Repository<DriverProfile>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(CapacityPost) private readonly posts: Repository<CapacityPost>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(Match) private readonly matches: Repository<Match>,
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly tripsService: TripsService,
    private readonly matching: MatchingService,
    private readonly matchesService: MatchesService,
    private readonly capacity: CapacityService,
    private readonly reference: ReferenceService,
    private readonly notifications: NotificationsService,
    private readonly verification: VerificationService,
    private readonly fleet: FleetService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────── home ─────────────────────────

  async vehicleOf(userId: string): Promise<Vehicle | null> {
    return this.vehicles.findOne({ where: { currentDriverId: userId }, relations: { owner: true, currentDriver: true, homePlace: true } });
  }

  /** The space the driver is currently offering (soonest open/full post). */
  async activePost(userId: string): Promise<CapacityPost | null> {
    return this.posts.findOne({ where: { driverId: userId, status: In(['open', 'full']) }, relations: POST_RELATIONS, order: { departsAt: 'ASC' } });
  }

  async home(userId: string): Promise<DriverHomeDto> {
    const [user, profile, vehicle, post, activeTrip, unread] = await Promise.all([
      this.users.findOneByOrFail({ id: userId }),
      this.profiles.findOneByOrFail({ userId }),
      this.vehicleOf(userId),
      this.activePost(userId),
      this.trips.findOne({ where: { driverId: userId, status: In(['planned', 'to_pickup', 'loading', 'in_transit']) }, order: { plannedDepartureAt: 'ASC' } }),
      this.notifications.unreadCount(userId),
    ]);

    let suggestion: DriverHomeDto['suggestion'] = null;
    if (post && post.status === 'open') {
      const loads = (await this.matching.loadsForPost(post, 'route')).filter((l) => l.onRoute && l.fitsWeight);
      if (loads.length) {
        const best = [...loads].sort((a, b) => b.priceEtb - a.priceEtb)[0]!;
        suggestion = { count: loads.length, freeKg: post.totalCapacityKg - post.committedKg - post.matchedKg, bestWeightKg: best.shipment.weightKg, bestPriceEtb: best.priceEtb, destinationName: post.destination.name };
      }
    }

    const week = await this.earnedBetween(userId, startOfWeekEat(new Date()), new Date(Date.now() + 86_400_000));
    return {
      driver: { id: userId, name: user.fullName, initials: initials(user.fullName), plate: vehicle?.plate ?? null, available: profile.available },
      route: post
        ? {
            capacityPostId: post.id,
            origin: this.reference.toPlaceDto(post.origin),
            destination: this.reference.toPlaceDto(post.destination),
            departsAt: post.departsAt.toISOString(),
            bar: capacityBar(post),
            loadedKg: post.committedKg + post.matchedKg,
            freeKg: Math.max(0, post.totalCapacityKg - post.committedKg - post.matchedKg),
          }
        : null,
      suggestion,
      weekEarningsEtb: week.totalEtb,
      tripsDoneWeek: week.trips,
      unreadCount: unread,
      activeTripId: activeTrip?.id ?? null,
    };
  }

  async setAvailability(userId: string, available: boolean): Promise<void> {
    await this.profiles.update(userId, { available });
  }

  async setReturnAlerts(userId: string, on: boolean): Promise<void> {
    await this.profiles.update(userId, { returnAlerts: on });
  }

  // ───────────────────────── loads ─────────────────────────

  async loads(userId: string, mode: 'route' | 'near' | 'all'): Promise<DriverLoadDto[]> {
    const post = await this.activePost(userId);
    if (!post) return [];
    const rows = await this.matching.loadsForPost(post, mode);
    const live = await this.matches.find({ where: { capacityPostId: post.id, status: In(['pending_carrier', 'pending_shipper', 'confirmed']) } });
    const liveByShipment = new Map(live.map((m) => [m.shipmentId, m]));
    return this.toLoadDtos(post, rows, liveByShipment);
  }

  private toLoadDtos(post: CapacityPost, rows: LoadForPost[], live: Map<string, Match>): DriverLoadDto[] {
    const free = Math.max(0, post.totalCapacityKg - post.committedKg - post.matchedKg);
    const fits = rows.filter((r) => r.onRoute && r.fitsWeight);
    // "best fit" = the load that pays the most per kilo of space it uses
    const perKg = (r: LoadForPost) => r.priceEtb / r.shipment.weightKg;
    const best = fits.length ? [...fits].sort((a, b) => perKg(b) - perKg(a) || b.priceEtb - a.priceEtb)[0]! : null;

    const dtos = rows.map((r): DriverLoadDto => {
      const s = r.shipment;
      const m = live.get(s.id);
      let fit: DriverLoadDto['fit'];
      let fitLabel: string;
      let usesPct: number | null = null;
      if (!r.onRoute) {
        fit = 'off_route';
        fitLabel = `${Math.round(Math.max(r.dPickKm, r.dDropKm))} km off your route`;
      } else if (!r.fitsWeight) {
        fit = 'too_heavy';
        fitLabel = 'Too heavy for your open space';
      } else {
        usesPct = free > 0 ? Math.round((s.weightKg / free) * 100) : null;
        if (best && best.shipment.id === s.id) {
          fit = 'best';
          fitLabel = `BEST FIT · uses ${usesPct}% of your empty ${formatTonnes(free, free % 1000 === 0 ? 0 : 1)}`;
        } else {
          fit = 'fits';
          fitLabel = r.fPick >= 0.03 ? 'Pickup on your way' : r.fDrop <= 0.97 ? 'Drop on your way' : 'Same route';
        }
      }
      return {
        shipmentId: s.id,
        ref: s.ref,
        pickup: this.reference.toPlaceDto(s.pickupPlace),
        dropoff: this.reference.toPlaceDto(s.dropoffPlace),
        priceEtb: r.priceEtb,
        weightKg: s.weightKg,
        cargoLabel: cargoLabel(s.cargoType),
        piecesLabel: piecesLabel(s.cargoType, s.pieces),
        readyAt: s.readyAt.toISOString(),
        pickupAddress: s.pickupAddress,
        pickupDistanceKm: r.fromOriginKm,
        fit,
        fitLabel,
        usesPct,
        myMatch: m && m.status !== undefined && ['pending_carrier', 'pending_shipper', 'confirmed'].includes(m.status) ? { id: m.id, status: m.status as 'pending_carrier' | 'pending_shipper' | 'confirmed' } : null,
      };
    });

    const order = { best: 0, fits: 1, too_heavy: 2, off_route: 3 } as const;
    return dtos.sort((a, b) => order[a.fit] - order[b.fit] || b.priceEtb - a.priceEtb);
  }

  async loadDetail(userId: string, shipmentId: string): Promise<DriverLoadDetailDto> {
    const post = await this.activePost(userId);
    if (!post) throw conflict('no_open_space', 'Publish your truck’s space first to see load details');
    const rows = await this.matching.loadsForPost(post, 'all', 200);
    const row = rows.find((r) => r.shipment.id === shipmentId);
    if (!row) throw notFound('Load');
    const live = await this.matches.find({ where: { capacityPostId: post.id, shipmentId, status: In(['pending_carrier', 'pending_shipper', 'confirmed']) } });
    const [dto] = this.toLoadDtos(post, [row], new Map(live.map((m) => [m.shipmentId, m])));
    const s = row.shipment;

    const afterInk = post.committedKg + post.matchedKg;
    const afterBar: CapacityBarDto = { totalKg: post.totalCapacityKg, inkKg: post.committedKg, amberKg: post.matchedKg + (row.fitsWeight ? s.weightKg : 0), freeKg: Math.max(0, post.totalCapacityKg - afterInk - (row.fitsWeight ? s.weightKg : 0)) };
    const aboard = afterInk + (row.fitsWeight ? s.weightKg : 0);
    return {
      ...dto!,
      distanceKm: row.distanceKm,
      sameDirection: row.onRoute,
      dropoffAddress: s.dropoffAddress,
      shipperName: s.shipperOrg.name,
      shipperVerified: s.shipperOrg.verificationStatus === 'verified',
      paidBy: 'Paid by shipper on delivery',
      contact: live.some((m) => m.status === 'confirmed') ? { name: s.pickupContactName, phone: s.pickupContactPhone } : null,
      afterBar,
      afterNote: `After this load: ${formatTonnes(aboard, aboard % 1000 === 0 ? 0 : 1)} of ${formatTonnes(post.totalCapacityKg, 0)} · ${formatTonnes(afterBar.freeKg, afterBar.freeKg % 1000 === 0 ? 0 : 1)} still free`,
    };
  }

  /** Driver taps "Accept load": answers a booking request, or applies for an open load. */
  async acceptLoad(ctx: RequestContext, shipmentId: string): Promise<{ state: 'confirmed' | 'pending_shipper'; matchId: string; tripId: string | null }> {
    const post = await this.activePost(ctx.userId);
    if (!post) throw conflict('no_open_space', 'You have no open space. Publish your truck’s route first.');
    if (post.status !== 'open') throw conflict('space_full', 'Your truck is full');

    const requested = await this.matches.findOne({ where: { shipmentId, capacityPostId: post.id, status: 'pending_carrier' } });
    if (requested) {
      const m = await this.matchesService.respond(ctx, requested.id, 'accept');
      return { state: 'confirmed', matchId: m.id, tripId: m.tripId };
    }
    const mine = await this.matches.findOne({ where: { shipmentId, capacityPostId: post.id, status: In(['pending_shipper', 'confirmed']) } });
    if (mine) return { state: mine.status === 'confirmed' ? 'confirmed' : 'pending_shipper', matchId: mine.id, tripId: mine.tripId };

    const m = await this.matchesService.propose(ctx, { shipmentId, capacityPostId: post.id, side: 'carrier' });
    return { state: 'pending_shipper', matchId: m.id, tripId: null };
  }

  async declineLoad(ctx: RequestContext, shipmentId: string, reason?: string): Promise<void> {
    const post = await this.activePost(ctx.userId);
    if (!post) return;
    const requested = await this.matches.findOne({ where: { shipmentId, capacityPostId: post.id, status: 'pending_carrier' } });
    if (requested) await this.matchesService.respond(ctx, requested.id, 'decline', reason);
  }

  // ───────────────────────── trips ─────────────────────────

  async tripList(userId: string, state: 'active' | 'completed'): Promise<DriverTripSummaryDto[]> {
    const statuses = state === 'active' ? ['planned', 'to_pickup', 'loading', 'in_transit'] : ['completed'];
    const rows = await this.trips.find({
      where: { driverId: userId, status: In(statuses) },
      relations: TRIP_RELATIONS,
      order: state === 'active' ? { plannedDepartureAt: 'ASC' } : { completedAt: 'DESC' },
      take: state === 'completed' ? 30 : 20,
    });
    const posts = await this.postsByTrip(rows);
    return rows.map((t) => this.toTripSummary(t, posts.get(t.id) ?? null));
  }

  private async postsByTrip(trips: Trip[]): Promise<Map<string, CapacityPost>> {
    const ids = trips.map((t) => t.capacityPostId).filter((x): x is string => !!x);
    const posts = ids.length ? await this.posts.find({ where: { id: In(ids) } }) : [];
    const byId = new Map(posts.map((p) => [p.id, p]));
    return new Map(trips.filter((t) => t.capacityPostId).map((t) => [t.id, byId.get(t.capacityPostId!)!]));
  }

  private toTripSummary(t: Trip, post: CapacityPost | null): DriverTripSummaryDto {
    const loads = [...t.loads].sort((a, b) => a.dropOrder - b.dropOrder);
    const total = loads.reduce((n, l) => n + (l.shipment.agreedPriceEtb ?? 0), 0);
    const tone: DriverTripSummaryDto['tone'] = t.status === 'completed' ? 'green' : t.status === 'in_transit' ? 'lapis' : ['to_pickup', 'loading', 'planned'].includes(t.status) ? 'amber' : 'neutral';
    const pickupLoad = loads.find((l) => ['assigned', 'arrived_pickup'].includes(l.status));
    const statusLabel =
      t.status === 'in_transit' ? 'In transit' : t.status === 'completed' ? 'Completed' : pickupLoad ? `Pickup ${formatTime(pickupLoad.shipment.readyAt)}` : t.status === 'loading' ? 'Loading' : 'Planned';
    return {
      id: t.id,
      ref: t.ref,
      status: t.status,
      origin: this.reference.toPlaceDto(t.origin),
      destination: this.reference.toPlaceDto(t.destination),
      loadLines: loads.map((l) => ({
        ref: l.shipment.ref,
        shipperName: l.shipment.shipperOrg.name,
        weightKg: l.weightKg,
        isRahaMatch: l.isRahaMatch,
        status: l.status,
        label: !l.isRahaMatch ? 'main load' : post?.kind === 'return_leg' ? 'return-load match' : 'Raha match',
      })),
      statusLabel,
      tone,
      pickupAt: pickupLoad?.shipment.readyAt.toISOString() ?? null,
      departedAt: t.departedAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      totalEtb: total,
    };
  }

  async tripDetail(userId: string, tripId: string): Promise<DriverTripDetailDto> {
    const trip = await this.tripsService.loadTrip(tripId);
    if (trip.driverId !== userId) throw new DomainError('not_your_trip', 'This trip belongs to another driver', HttpStatus.FORBIDDEN);
    const [checkins, route, post] = await Promise.all([
      this.tripsService.checkinsOf(tripId),
      this.tripsService.routeFor(trip),
      trip.capacityPostId ? this.posts.findOne({ where: { id: trip.capacityPostId } }) : Promise.resolve(null),
    ]);

    const strip = buildStrip({
      corridorName: trip.corridor?.name ?? route.corridorName,
      direction: route.direction,
      routeKm: route.routeKm,
      stops: route.stops,
      checkins: checkins.map((c) => ({ placeId: c.placeId, at: c.checkedInAt, channel: c.channel })),
      status: trip.status,
      departedAt: trip.departedAt,
      plannedDepartureAt: trip.plannedDepartureAt,
      completedAt: trip.completedAt,
      etaAt: trip.etaAt,
    });

    // PIN digests are only handed to the phone once the cargo is aboard (needed to verify offline).
    const pickedIds = trip.loads.filter((l) => ['picked_up', 'in_transit', 'delivered'].includes(l.status)).map((l) => l.shipmentId);
    const pins = pickedIds.length
      ? await this.shipments.createQueryBuilder('s').select(['s.id']).addSelect(['s.pinSalt', 's.pinHash']).where('s.id IN (:...ids)', { ids: pickedIds }).getMany()
      : [];
    const pinById = new Map(pins.map((p) => [p.id, p]));

    const loads: DriverTripLoadDto[] = trip.loads.map((l) => {
      const s = l.shipment;
      const pin = pinById.get(s.id);
      return {
        loadId: l.id,
        shipmentId: s.id,
        ref: s.ref,
        status: l.status,
        dropOrder: l.dropOrder,
        shipperName: s.shipperOrg.name,
        weightKg: l.weightKg,
        cargoLabel: cargoLabel(s.cargoType),
        piecesLabel: piecesLabel(s.cargoType, s.pieces),
        pieces: s.pieces,
        isRahaMatch: l.isRahaMatch,
        priceEtb: s.agreedPriceEtb ?? 0,
        pickup: {
          place: this.reference.toPlaceDto(s.pickupPlace),
          address: s.pickupAddress,
          contactName: s.pickupContactName,
          contactPhone: s.pickupContactPhone,
          readyAt: s.readyAt.toISOString(),
          lat: s.pickupPoint?.coordinates[1] ?? s.pickupPlace.location.coordinates[1],
          lng: s.pickupPoint?.coordinates[0] ?? s.pickupPlace.location.coordinates[0],
        },
        dropoff: {
          place: this.reference.toPlaceDto(s.dropoffPlace),
          address: s.dropoffAddress,
          lat: s.dropoffPoint?.coordinates[1] ?? s.dropoffPlace.location.coordinates[1],
          lng: s.dropoffPoint?.coordinates[0] ?? s.dropoffPlace.location.coordinates[0],
        },
        receiver: { name: s.receiverName, phone: s.receiverPhone },
        pinCheck: pin?.pinSalt && pin.pinHash ? { salt: pin.pinSalt, digest: pin.pinHash } : null,
        pickupChecklist: l.pickupChecklist ? { counted: !!l.pickupChecklist.counted, noDamage: !!l.pickupChecklist.noDamage, waybill: !!l.pickupChecklist.waybill } : null,
        deliveredAt: l.deliveredAt?.toISOString() ?? null,
      };
    });

    const next = this.nextAction(trip, route.stops, checkins.map((c) => c.placeId));
    const step = ({ go_to_pickup: 1, confirm_pickup: 2, start_trip: 3, check_in: 4, deliver: 5, complete: 5 } as const)[next.type];
    const stepLabel = ({ go_to_pickup: 'GO TO PICKUP', confirm_pickup: 'LOAD CARGO', start_trip: 'DEPART', check_in: 'ON THE ROAD', deliver: 'DELIVER', complete: 'COMPLETE' } as const)[next.type];
    const summary = this.toTripSummary(trip, post);

    return {
      ...summary,
      step: step as DriverTripDetailDto['step'],
      stepLabel,
      next,
      loads,
      strip,
      bar: post ? capacityBar(post) : { totalKg: trip.vehicle.maxLoadKg, inkKg: trip.loads.reduce((n, l) => n + l.weightKg, 0), amberKg: 0, freeKg: 0 },
      etaAt: trip.etaAt?.toISOString() ?? null,
      plannedDepartureAt: trip.plannedDepartureAt?.toISOString() ?? null,
      checkins: checkins.map((c) => ({ placeId: c.placeId, placeName: c.place.name, at: c.checkedInAt.toISOString(), channel: c.channel, offline: c.offline })),
      fleetName: trip.fleetOrg.name,
      summary:
        trip.status === 'completed'
          ? {
              durationMinutes: trip.departedAt && trip.completedAt ? Math.round((trip.completedAt.getTime() - trip.departedAt.getTime()) / 60_000) : null,
              lines: loads.map((l) => ({ label: l.isRahaMatch ? `${l.shipperName} · Raha match` : l.shipperName, amountEtb: l.priceEtb, isRahaMatch: l.isRahaMatch })),
              totalEtb: summary.totalEtb,
              paymentNote: `Payment is recorded by ${trip.fleetOrg.name} (your fleet). You’ll get an SMS when it’s marked paid.`,
            }
          : null,
    };
  }

  /** What the driver should be doing right now — the single source of truth for the app's big amber button. */
  nextAction(trip: Trip, stops: Array<{ place: { id: string } }>, checkinPlaceIds: string[]): DriverNextAction {
    const live = [...trip.loads].filter((l) => !['delivered', 'failed'].includes(l.status)).sort((a, b) => a.dropOrder - b.dropOrder);
    if (!live.length) return { type: 'complete' };

    if (['planned', 'to_pickup', 'loading'].includes(trip.status)) {
      const arrived = live.find((l) => l.status === 'arrived_pickup');
      if (arrived) return { type: 'confirm_pickup', loadId: arrived.id };
      const waiting = live.filter((l) => l.status === 'assigned').sort((a, b) => a.shipment.readyAt.getTime() - b.shipment.readyAt.getTime())[0];
      if (waiting) return { type: 'go_to_pickup', loadId: waiting.id };
      return { type: 'start_trip' };
    }

    const reached = new Set(checkinPlaceIds);
    const due = live.find((l) => reached.has(l.shipment.dropoffPlaceId));
    if (due) return { type: 'deliver', loadId: due.id };
    const lastIdx = Math.max(...stops.map((s, i) => (reached.has(s.place.id) ? i : -1)));
    return { type: 'check_in', nextPlaceId: stops[lastIdx + 1]?.place.id ?? null };
  }

  // ───────────────────────── trip actions ─────────────────────────

  async begin(userId: string, tripId: string) {
    await this.tripsService.begin(userId, tripId);
    return this.tripDetail(userId, tripId);
  }

  async arrive(userId: string, tripId: string, loadId: string, at?: string) {
    await this.tripsService.arrive(userId, tripId, loadId, at ? new Date(at) : new Date());
    return this.tripDetail(userId, tripId);
  }

  async pickup(userId: string, tripId: string, loadId: string, dto: PickupDto) {
    await this.tripsService.pickup(userId, tripId, loadId, {
      at: dto.at ? new Date(dto.at) : new Date(),
      checklist: { counted: dto.counted, noDamage: dto.noDamage, waybill: dto.waybill },
      photoKeys: dto.photoKeys,
      actionId: dto.actionId ?? `${tripId}:${loadId}`,
      lat: dto.lat,
      lng: dto.lng,
    });
    return this.tripDetail(userId, tripId);
  }

  async start(userId: string, tripId: string, at?: string) {
    await this.tripsService.start(userId, tripId, at ? new Date(at) : new Date());
    return this.tripDetail(userId, tripId);
  }

  async checkin(userId: string, tripId: string, dto: CheckinDto) {
    await this.tripsService.checkin(tripId, {
      actorUserId: userId,
      enforceDriver: true,
      placeId: dto.placeId,
      clientId: dto.clientId,
      at: dto.at ? new Date(dto.at) : new Date(),
      channel: 'app',
      offline: dto.offline,
      lat: dto.lat,
      lng: dto.lng,
    });
    return this.tripDetail(userId, tripId);
  }

  async deliver(userId: string, tripId: string, loadId: string, dto: DeliverDto) {
    await this.tripsService.deliver(userId, tripId, loadId, {
      pin: dto.pin,
      condition: dto.condition,
      receivedCount: dto.receivedCount,
      photoKey: dto.photoKey ?? null,
      at: dto.at ? new Date(dto.at) : new Date(),
      offline: dto.offline,
    });
    return this.tripDetail(userId, tripId);
  }

  /**
   * Replays actions queued on the phone while it had no signal. Each action is idempotent, so a
   * retry after a dropped response is harmless; permanent failures are reported per action and never block the rest.
   */
  async sync(userId: string, actions: SyncAction[]): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    const ordered = [...actions].sort((a, b) => a.at.localeCompare(b.at));
    for (const a of ordered) {
      try {
        const at = new Date(a.at);
        const p = a.payload as Record<string, never> & Record<string, unknown>;
        switch (a.type) {
          case 'begin':
            await this.tripsService.begin(userId, a.tripId);
            break;
          case 'arrive':
            await this.tripsService.arrive(userId, a.tripId, a.loadId!, at);
            break;
          case 'pickup':
            await this.tripsService.pickup(userId, a.tripId, a.loadId!, {
              at,
              checklist: (p.checklist as { counted: boolean; noDamage: boolean; waybill: boolean }) ?? { counted: true, noDamage: true, waybill: false },
              photoKeys: (p.photoKeys as string[]) ?? [],
              actionId: a.id,
              lat: p.lat as number | undefined,
              lng: p.lng as number | undefined,
            });
            break;
          case 'start':
            await this.tripsService.start(userId, a.tripId, at);
            break;
          case 'checkin':
            await this.tripsService.checkin(a.tripId, {
              actorUserId: userId,
              enforceDriver: true,
              placeId: p.placeId as string,
              clientId: (p.clientId as string) ?? a.id,
              at,
              channel: 'app',
              offline: true,
              lat: p.lat as number | undefined,
              lng: p.lng as number | undefined,
            });
            break;
          case 'deliver': {
            const r = await this.tripsService.deliver(userId, a.tripId, a.loadId!, {
              pin: String(p.pin ?? ''),
              condition: (p.condition as DeliverDto['condition']) ?? 'all_good',
              receivedCount: p.receivedCount as number | undefined,
              photoKey: (p.photoKey as string | undefined) ?? null,
              at,
              offline: true,
            });
            results.push({ id: a.id, ok: true, duplicate: r.duplicate });
            continue;
          }
        }
        results.push({ id: a.id, ok: true });
      } catch (err) {
        if (err instanceof DomainError) {
          // "already done" outcomes are successes from the queue's point of view
          if (['not_in_transit', 'trip_started', 'trip_closed'].includes(err.code) && ['arrive', 'pickup', 'start', 'begin'].includes(a.type)) {
            results.push({ id: a.id, ok: true, duplicate: true });
          } else {
            results.push({ id: a.id, ok: false, error: { code: err.code, message: err.message } });
          }
        } else {
          results.push({ id: a.id, ok: false, error: { code: 'internal', message: 'Could not apply this action' } });
        }
      }
    }
    return results;
  }

  async reportIssue(userId: string, tripId: string, dto: ReportIssueDto): Promise<{ ref: string }> {
    const trip = await this.trips.findOne({ where: { id: tripId } });
    if (!trip || trip.driverId !== userId) throw notFound('Trip');
    const [{ n }] = await this.issues.query(`SELECT nextval('issue_ref_seq') AS n`);
    const kindMap = { breakdown: 'support', delay: 'late', cargo_problem: 'dispute', safety: 'safety', other: 'support' } as const;
    const issue = await this.issues.save(
      this.issues.create({
        ref: `IS-${n}`,
        kind: kindMap[dto.kind],
        priority: dto.kind === 'safety' || dto.kind === 'breakdown' ? 1 : 2,
        title: `${trip.ref}: driver reports ${dto.kind.replace('_', ' ')}`,
        body: dto.text,
        tripId,
        raisedBy: userId,
        raisedByOrg: trip.fleetOrgId,
        actionHint: 'Call driver',
      }),
    );
    return { ref: issue.ref };
  }

  // ───────────────────────── earnings ─────────────────────────

  private async earnedBetween(userId: string, from: Date, to: Date) {
    const rows = await this.deliveredLoads(userId, from, to);
    const tripIds = new Set(rows.map((r) => r.tripId));
    const matchTrips = new Set(rows.filter((r) => r.isRaha).map((r) => r.tripId));
    return {
      totalEtb: Math.round(rows.reduce((n, r) => n + r.price, 0)),
      trips: tripIds.size,
      matchTrips: matchTrips.size,
      matchEtb: Math.round(rows.filter((r) => r.isRaha).reduce((n, r) => n + r.price, 0)),
      rows,
    };
  }

  private async deliveredLoads(userId: string, from: Date, to: Date) {
    const raw = await this.trips.query(
      `SELECT tl.id, tl.trip_id, tl.delivered_at, tl.is_raha_match, COALESCE(s.agreed_price_etb, 0)::float AS price,
              t.ref AS trip_ref, o.name AS origin, d.name AS destination
         FROM trip_loads tl
         JOIN trips t ON t.id = tl.trip_id
         JOIN shipments s ON s.id = tl.shipment_id
         JOIN places o ON o.id = t.origin_place_id
         JOIN places d ON d.id = t.destination_place_id
        WHERE t.driver_id = $1 AND tl.status = 'delivered' AND tl.delivered_at >= $2 AND tl.delivered_at < $3
        ORDER BY tl.delivered_at DESC`,
      [userId, from, to],
    );
    return (raw as Array<{ trip_id: string; delivered_at: Date; is_raha_match: boolean; price: number; origin: string; destination: string }>).map((r) => ({
      tripId: r.trip_id,
      at: new Date(r.delivered_at),
      isRaha: r.is_raha_match,
      price: Number(r.price),
      origin: r.origin,
      destination: r.destination,
    }));
  }

  async earnings(userId: string, period: 'week' | 'month' | 'year'): Promise<DriverEarningsDto> {
    const now = new Date();
    let from: Date;
    let to: Date;
    let bucketCount: number;
    let bucketOf: (d: Date) => number;
    let labels: string[];
    let label: string;

    if (period === 'week') {
      from = startOfWeekEat(now);
      to = new Date(from.getTime() + WEEK_MS);
      bucketCount = 7;
      bucketOf = (d) => Math.min(6, Math.floor((d.getTime() - from.getTime()) / 86_400_000));
      labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      label = 'This week';
    } else if (period === 'month') {
      from = startOfEthiopianMonth(now);
      to = new Date(from.getTime() + 30 * 86_400_000);
      bucketCount = 6;
      bucketOf = (d) => Math.min(5, Math.floor((d.getTime() - from.getTime()) / (5 * 86_400_000)));
      labels = ['1–5', '6–10', '11–15', '16–20', '21–25', '26–30'];
      label = toEthiopian(now).monthName;
    } else {
      const e = toEthiopian(now);
      const monthStart = startOfEthiopianMonth(now);
      from = new Date(monthStart.getTime() - (e.month - 1) * 30 * 86_400_000);
      to = new Date(from.getTime() + 365 * 86_400_000);
      bucketCount = 13;
      bucketOf = (d) => toEthiopian(d).month - 1;
      labels = ETHIOPIAN_MONTHS.map((m) => m.slice(0, 3));
      label = `${e.year} E.C.`;
    }

    const rows = await this.deliveredLoads(userId, from, to);
    const series = Array.from({ length: bucketCount }, (_, i) => ({ label: labels[i]!, etb: 0, matchEtb: 0 }));
    for (const r of rows) {
      const b = series[Math.max(0, Math.min(bucketCount - 1, bucketOf(r.at)))]!;
      b.etb += r.price;
      if (r.isRaha) b.matchEtb += r.price;
    }
    for (const b of series) {
      b.etb = Math.round(b.etb);
      b.matchEtb = Math.round(b.matchEtb);
    }

    // one list item per trip
    const byTrip = new Map<string, { origin: string; destination: string; at: Date; amount: number; drops: number }>();
    for (const r of rows) {
      const cur = byTrip.get(r.tripId) ?? { origin: r.origin, destination: r.destination, at: r.at, amount: 0, drops: 0 };
      cur.amount += r.price;
      cur.drops += 1;
      if (r.at > cur.at) cur.at = r.at;
      byTrip.set(r.tripId, cur);
    }
    const pay = byTrip.size ? await this.payments.find({ where: { tripId: In([...byTrip.keys()]) } }) : [];
    const payByTrip = new Map<string, Payment[]>();
    for (const p of pay) payByTrip.set(p.tripId!, [...(payByTrip.get(p.tripId!) ?? []), p]);
    const methodLabel: Record<string, string> = { telebirr: 'Telebirr', cbe: 'CBE', bank: 'Bank', cash: 'Cash', other: 'Other' };

    const items = [...byTrip.entries()]
      .sort((a, b) => b[1].at.getTime() - a[1].at.getTime())
      .slice(0, 40)
      .map(([tripId, t]) => {
        const ps = payByTrip.get(tripId) ?? [];
        const allPaid = ps.length > 0 && ps.every((p) => p.status === 'paid');
        return {
          tripId,
          route: `${t.origin} → ${t.destination}`,
          whenLabel: formatDay(t.at, now),
          drops: t.drops,
          amountEtb: Math.round(t.amount),
          status: allPaid ? ('paid' as const) : ('pending' as const),
          methodLabel: allPaid ? (ps[0]?.method ? methodLabel[ps[0].method] ?? null : null) : null,
        };
      });

    const matchTrips = new Set(rows.filter((r) => r.isRaha).map((r) => r.tripId)).size;
    return {
      period,
      label,
      totalEtb: Math.round(rows.reduce((n, r) => n + r.price, 0)),
      trips: byTrip.size,
      matchTrips,
      matchEtb: Math.round(rows.filter((r) => r.isRaha).reduce((n, r) => n + r.price, 0)),
      series,
      items,
    };
  }

  // ───────────────────────── profile & vehicle ─────────────────────────

  async profile(userId: string): Promise<DriverProfileDto> {
    const [user, profile, vehicle, membership] = await Promise.all([
      this.users.findOneByOrFail({ id: userId }),
      this.profiles.findOneByOrFail({ userId }),
      this.vehicleOf(userId),
      this.memberships.findOne({ where: { userId, status: 'active' }, relations: { organization: true }, order: { createdAt: 'ASC' } }),
    ]);
    const vstate = (v: string): DriverVerificationRow['state'] => (v === 'verified' ? 'verified' : v === 'pending' ? 'pending' : v === 'rejected' ? 'rejected' : v === 'expired' ? 'expired' : 'missing');

    const rows: DriverVerificationRow[] = [
      { key: 'phone', label: 'Phone number', state: 'verified', note: null },
      { key: 'licence', label: `Driving licence${profile.licenceGrade ? ` · Grade ${profile.licenceGrade}` : ''}`, state: vstate(profile.verificationStatus), note: null },
      { key: 'fayda', label: 'Fayda ID', state: vstate(profile.verificationStatus), note: null },
    ];
    if (vehicle) {
      const expiring = (await this.verification.expiring('vehicle', [vehicle.id])).get(vehicle.id)?.find((d) => d.kind === 'insurance');
      rows.push({
        key: 'insurance',
        label: 'Third-party insurance',
        state: expiring ? (expiring.daysLeft <= 0 ? 'expired' : 'expiring') : vstate(vehicle.verificationStatus),
        note: expiring ? (expiring.daysLeft <= 0 ? 'Expired' : `Expires in ${expiring.daysLeft} days`) : null,
      });
    }
    return {
      userId,
      fullName: user.fullName,
      initials: initials(user.fullName),
      phone: user.phone,
      sinceYear: user.createdAt.getFullYear(),
      fleetName: membership?.organization.name ?? null,
      verification: rows,
      language: user.language,
      dataSaver: user.dataSaver,
      supportNumber: '8817',
      notifyTelegram: user.notifyTelegram,
      notifySms: user.notifySms,
      notifyCall: user.notifyCall,
    };
  }

  async vehicle(userId: string): Promise<DriverVehicleDto | null> {
    const v = await this.vehicleOf(userId);
    if (!v) return null;
    const post = await this.activePost(userId);
    const bodyLabel = { dry_box: 'Covered dry box', flatbed: 'Flatbed', tipper: 'Tipper', refrigerated: 'Refrigerated box', tanker: 'Tanker', container: 'Container carrier', pickup: 'Pickup' }[v.bodyType];
    return {
      vehicleId: v.id,
      plate: v.plate,
      label: `${v.makeModel}${v.year ? ` ${v.year}` : ''} · ${bodyLabel} · ${v.owner.name}`,
      maxLoadKg: v.maxLoadKg,
      boxVolumeM3: v.boxVolumeM3,
      bodyLabel,
      verified: v.verificationStatus === 'verified',
      currentLoadKg: v.currentLoadKg,
      bar: post ? capacityBar(post) : { totalKg: v.maxLoadKg, inkKg: v.currentLoadKg, amberKg: 0, freeKg: Math.max(0, v.maxLoadKg - v.currentLoadKg) },
      ownerName: v.owner.name,
    };
  }

  /** "Update how much is loaded": the driver corrects the weight aboard; free space follows. */
  async setLoaded(userId: string, loadedKg: number): Promise<DriverVehicleDto> {
    const v = await this.vehicleOf(userId);
    if (!v) throw conflict('no_vehicle', 'No truck is assigned to you');
    if (loadedKg > v.maxLoadKg) throw badRequest('over_max_load', `Your truck carries at most ${v.maxLoadKg} kg`);
    await this.vehicles.update(v.id, { currentLoadKg: loadedKg });
    const post = await this.activePost(userId);
    if (post) {
      const committed = Math.max(0, loadedKg - post.matchedKg);
      await this.posts.update(post.id, { committedKg: committed, status: committed + post.matchedKg >= post.totalCapacityKg ? 'full' : 'open' });
    }
    return (await this.vehicle(userId))!;
  }

  // ───────────────────────── return loads ─────────────────────────

  /** After unloading: reverse the last trip's route, open return space for the whole truck and list loads that fit. */
  async returnLoads(userId: string): Promise<ReturnLoadsDto> {
    const [profile, vehicle] = await Promise.all([this.profiles.findOneByOrFail({ userId }), this.vehicleOf(userId)]);
    if (!vehicle) throw conflict('no_vehicle', 'No truck is assigned to you');

    const last = await this.trips.findOne({ where: { driverId: userId, status: 'completed', completedAt: MoreThanOrEqual(new Date(Date.now() - 36 * 3_600_000)) }, relations: { origin: true, destination: true }, order: { completedAt: 'DESC' } });
    let post = await this.posts.findOne({ where: { driverId: userId, kind: 'return_leg', status: In(['open', 'full']) }, relations: POST_RELATIONS, order: { createdAt: 'DESC' } });
    if (!post && last) {
      const created = await this.capacity.publishReturnLeg(vehicle, userId, last.destinationPlaceId, last.originPlaceId, new Date(Date.now() + 2 * 3_600_000));
      post = await this.posts.findOneOrFail({ where: { id: created.id }, relations: POST_RELATIONS });
    }
    if (!post) throw conflict('no_recent_trip', 'Finish a delivery first, then Raha can look for a load back');

    const rows = await this.matching.loadsForPost(post, 'route');
    const live = await this.matches.find({ where: { capacityPostId: post.id, status: In(['pending_carrier', 'pending_shipper', 'confirmed']) } });
    return {
      freeKg: Math.max(0, post.totalCapacityKg - post.committedKg - post.matchedKg),
      from: this.reference.toPlaceDto(post.origin),
      to: this.reference.toPlaceDto(post.destination),
      capacityPostId: post.id,
      loads: this.toLoadDtos(post, rows, new Map(live.map((m) => [m.shipmentId, m]))),
      alertsOn: profile.returnAlerts,
    };
  }

  // ───────────────────────── onboarding ─────────────────────────

  /** First sign-in: name + licence details. Creates the profile and, for independents, a personal fleet account. */
  async onboard(ctx: RequestContext, dto: OnboardDto): Promise<void> {
    await this.users.update(ctx.userId, { fullName: dto.fullName.trim() });
    await this.profiles.upsert(
      { userId: ctx.userId, licenceNumber: dto.licenceNumber ?? null, licenceGrade: dto.licenceGrade ?? null, licenceExpiry: dto.licenceExpiry ?? null },
      ['userId'],
    );
    const hasOrg = await this.memberships.exist({ where: { userId: ctx.userId, status: In(['active', 'invited']) } });
    if (!hasOrg) {
      const org = await this.orgs.save(this.orgs.create({ type: 'fleet', name: `${dto.fullName.trim()} Transport`, phone: ctx.phone, createdBy: ctx.userId }));
      await this.memberships.save(this.memberships.create({ userId: ctx.userId, organizationId: org.id, role: 'owner', status: 'active' }));
    }
    await this.audit.record({ actor: ctx, action: 'driver.onboard', entityType: 'driver', entityId: ctx.userId });
  }

  async registerTruck(ctx: RequestContext, dto: RegisterTruckDto): Promise<DriverVehicleDto> {
    const org = await this.memberships.findOne({ where: { userId: ctx.userId, status: 'active', role: 'owner' }, relations: { organization: true } });
    if (!org || org.organization.type !== 'fleet') throw conflict('not_an_owner', 'Ask your fleet owner to add your truck');
    await this.fleet.createVehicle(ctx, org.organizationId, { ...dto, plate: normalizePlate(dto.plate), driverUserId: ctx.userId });
    return (await this.vehicle(ctx.userId))!;
  }
}

function formatDay(d: Date, now: Date): string {
  const key = (x: Date) => new Date(x.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);
  if (key(d) === key(now)) return 'Today';
  if (key(d) === key(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Addis_Ababa' }).format(d).replace(',', '');
}

