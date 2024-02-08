import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CARGO_TYPES,
  formatEtb,
  formatKg,
  formatTime,
  formatTonnes,
  initials,
  type CapacityBarDto,
  type CarrierSummaryDto,
  type ProofDto,
  type ShipmentDetailDto,
  type ShipmentSummaryDto,
  type TimelineEventDto,
} from '@raha/contracts';
import { loadEnv } from '../../config/env';
import type { RequestContext } from '../../common/request-context';
import {
  CapacityPost,
  Delivery,
  DriverProfile,
  Issue,
  Match,
  Proof,
  Shipment,
  ShipmentMessage,
  Trip,
  TripCheckin,
  TripLoad,
} from '../../database/entities';
import { FleetService } from '../fleet/fleet.service';
import { StorageService } from '../files/storage.service';
import { MatchesService } from '../matching/matches.service';
import { PaymentsService } from '../payments/payments.service';
import { ReferenceService } from '../reference/reference.service';
import { buildStrip } from '../trips/strip';
import { TripsService } from '../trips/trips.service';
import { POST_RELATIONS } from '../capacity/capacity.service';

export const SHIPMENT_RELATIONS = { shipperOrg: true, loggedByOrg: true, pickupPlace: true, dropoffPlace: true } as const;

const OPEN_ISSUE = ['open', 'in_progress', 'waiting'] as const;

export function cargoLabel(type: string): string {
  return CARGO_TYPES.find((c) => c.key === type)?.label ?? type;
}

/** "Coffee, sacked · 800 kg" style heading used in tables. */
export function cargoSummary(s: Pick<Shipment, 'cargoType' | 'weightKg'>): string {
  const label = cargoLabel(s.cargoType).split(',')[0]!;
  return `${label} · ${formatKg(s.weightKg)}`;
}

@Injectable()
export class ShipmentViewService {
  private readonly env = loadEnv();

  constructor(
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(TripLoad) private readonly tripLoads: Repository<TripLoad>,
    @InjectRepository(TripCheckin) private readonly checkins: Repository<TripCheckin>,
    @InjectRepository(CapacityPost) private readonly posts: Repository<CapacityPost>,
    @InjectRepository(DriverProfile) private readonly driverProfiles: Repository<DriverProfile>,
    @InjectRepository(Match) private readonly matches: Repository<Match>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(Proof) private readonly proofs: Repository<Proof>,
    @InjectRepository(Delivery) private readonly deliveries: Repository<Delivery>,
    @InjectRepository(ShipmentMessage) private readonly messages: Repository<ShipmentMessage>,
    private readonly reference: ReferenceService,
    private readonly storage: StorageService,
    private readonly matchesService: MatchesService,
    private readonly payments: PaymentsService,
    private readonly tripsService: TripsService,
    private readonly fleet: FleetService,
  ) {}

  // ───────────────────────── summaries (batched) ─────────────────────────

  async summaries(rows: Shipment[]): Promise<ShipmentSummaryDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const tripIds = [...new Set(rows.map((r) => r.tripId).filter((x): x is string => !!x))];

    const [trips, pending, openIssues] = await Promise.all([
      tripIds.length ? this.trips.find({ where: { id: In(tripIds) }, relations: { vehicle: true, driver: true, fleetOrg: true, capacityPost: { brokerOrg: true } } }) : Promise.resolve([] as Trip[]),
      this.matches
        .createQueryBuilder('m')
        .select('m.shipment_id', 'id')
        .addSelect('count(*)', 'n')
        .where("m.shipment_id IN (:...ids) AND m.status IN ('pending_carrier','pending_shipper')", { ids })
        .groupBy('m.shipment_id')
        .getRawMany<{ id: string; n: string }>(),
      this.issues.createQueryBuilder('i').select('DISTINCT i.shipment_id', 'id').where('i.shipment_id IN (:...ids) AND i.status IN (:...open)', { ids, open: OPEN_ISSUE }).getRawMany<{ id: string }>(),
    ]);
    const tripById = new Map(trips.map((t) => [t.id, t]));
    const pendingBy = new Map(pending.map((p) => [p.id, Number(p.n)]));
    const flagged = new Set(openIssues.map((i) => i.id));

    const driverIds = [...new Set(trips.map((t) => t.driverId))];
    const profiles = driverIds.length ? await this.driverProfiles.find({ where: { userId: In(driverIds) } }) : [];
    const tripsOnRaha = new Map(profiles.map((p) => [p.userId, p.tripsCompleted]));

    const out: ShipmentSummaryDto[] = [];
    for (const s of rows) {
      const trip = s.tripId ? tripById.get(s.tripId) : undefined;
      const carrier = trip ? this.carrierOf(trip, tripsOnRaha.get(trip.driverId) ?? 0) : null;
      const progress = await this.progress(s, trip ?? null, pendingBy.get(s.id) ?? 0);
      out.push({
        id: s.id,
        ref: s.ref,
        status: s.status,
        hasOpenIssue: flagged.has(s.id),
        pickup: this.reference.toPlaceDto(s.pickupPlace),
        dropoff: this.reference.toPlaceDto(s.dropoffPlace),
        cargoType: s.cargoType,
        cargoLabel: cargoLabel(s.cargoType),
        pieces: s.pieces,
        weightKg: s.weightKg,
        volumeM3: s.volumeM3,
        readyAt: s.readyAt.toISOString(),
        shipperOrgId: s.shipperOrgId,
        shipperName: s.shipperOrg.name,
        source: s.source,
        loggedByName: s.loggedByOrg?.name ?? null,
        carrier,
        priceEtb: s.agreedPriceEtb,
        progressPct: progress.pct,
        progressLabel: progress.label,
        pendingOffers: pendingBy.get(s.id) ?? 0,
        matchingTrucks: null,
        createdAt: s.createdAt.toISOString(),
      });
    }
    return out;
  }

  private carrierOf(trip: Trip, tripsCompleted: number): CarrierSummaryDto {
    return {
      driverId: trip.driverId,
      driverName: trip.driver.fullName,
      driverInitials: initials(trip.driver.fullName),
      driverPhone: trip.driver.phone,
      fleetName: trip.fleetOrg.name,
      viaBroker: trip.capacityPost?.brokerOrg?.name ?? null,
      plate: trip.vehicle.plate,
      vehicleLabel: this.fleet.toVehicleDto({ ...trip.vehicle, owner: trip.fleetOrg, currentDriver: null, homePlace: null } as never).label,
      tripsOnRaha: tripsCompleted,
      verified: trip.vehicle.verificationStatus === 'verified',
    };
  }

  private async progress(s: Shipment, trip: Trip | null, pendingOffers: number): Promise<{ pct: number; label: string }> {
    switch (s.status) {
      case 'delivered':
        return { pct: 100, label: s.pinVerifiedAt ? 'PIN confirmed' : s.deliveredAt ? `Received ${formatTime(s.deliveredAt)}` : 'Delivered' };
      case 'cancelled':
        return { pct: 0, label: 'Cancelled' };
      case 'in_transit': {
        if (!trip) return { pct: 10, label: 'On the road' };
        const route = await this.reference.resolveRoute(trip.originPlaceId, trip.destinationPlaceId);
        const stop = route.stops.find((x) => x.place.id === trip.lastPlaceId);
        const pct = stop && route.routeKm > 0 ? Math.min(95, Math.round((stop.km / route.routeKm) * 100)) : 5;
        const where = stop?.place.name ?? 'Departed';
        return { pct: Math.max(pct, 3), label: trip.lastCheckinAt ? `${where} · ${formatTime(trip.lastCheckinAt)}` : where };
      }
      case 'matched':
        return { pct: 0, label: 'Driver assigned' };
      default:
        return { pct: 0, label: pendingOffers > 0 ? `${pendingOffers} offer${pendingOffers > 1 ? 's' : ''}` : 'Not yet booked' };
    }
  }

  // ───────────────────────── detail ─────────────────────────

  async detail(s: Shipment, ctx: RequestContext): Promise<ShipmentDetailDto> {
    const [summary] = await this.summaries([s]);
    const trip = s.tripId ? await this.tripsService.loadTrip(s.tripId) : null;
    const checkins = trip ? await this.tripsService.checkinsOf(trip.id) : [];
    const post = trip?.capacityPostId ? await this.posts.findOne({ where: { id: trip.capacityPostId }, relations: POST_RELATIONS }) : null;

    let strip = null;
    let etaAt: string | null = null;
    if (trip) {
      const route = await this.tripsService.routeFor(trip);
      strip = buildStrip({
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
      etaAt = trip.etaAt?.toISOString() ?? null;
    }

    let bar: CapacityBarDto | null = null;
    let barNote: string | null = null;
    if (post && s.status !== 'cancelled') {
      const otherMatched = Math.max(0, post.matchedKg - s.weightKg);
      const others = post.committedKg + otherMatched;
      bar = { totalKg: post.totalCapacityKg, inkKg: others, amberKg: s.weightKg, freeKg: Math.max(0, post.totalCapacityKg - others - s.weightKg) };
      if (others > 0) barNote = `Your ${formatKg(s.weightKg)} is sharing a truck with ${post.committedKg > 0 && otherMatched === 0 ? "another shipper's " : "other shippers' "}${formatTonnes(others, others % 1000 === 0 ? 0 : 1)}`;
      else barNote = `Your ${formatKg(s.weightKg)} has this truck to itself so far`;
    }

    const [matches, proofRows, delivery, payment, messagesCount, timelineIssues, loadRow] = await Promise.all([
      this.matches.find({ where: { shipmentId: s.id }, relations: { capacityPost: POST_RELATIONS }, order: { createdAt: 'DESC' } }),
      this.proofs.find({ where: { shipmentId: s.id }, order: { takenAt: 'ASC' } }),
      this.deliveries.findOne({ where: { shipmentId: s.id } }),
      this.payments.forShipment(s.id),
      this.messages.count({ where: { shipmentId: s.id } }),
      this.issues.find({ where: { shipmentId: s.id }, order: { createdAt: 'ASC' } }),
      this.tripLoads.findOne({ where: { shipmentId: s.id } }),
    ]);

    const perm = (p: string) => ctx.permissions.includes(p as never);
    const staff = ctx.isStaff;
    return {
      ...summary!,
      pickupAddress: s.pickupAddress,
      dropoffAddress: s.dropoffAddress,
      pickupContact: { name: s.pickupContactName, phone: s.pickupContactPhone },
      cargoDescription: s.cargoDescription,
      requirements: s.requirements,
      readyUntil: s.readyUntil?.toISOString() ?? null,
      receiver: { name: s.receiverName, phone: s.receiverPhone },
      etaAt,
      strip,
      bar,
      barNote,
      matches: matches.map((m) => this.matchesService.toDto(ctx, m as Match & { capacityPost: CapacityPost }, s)),
      proofs: proofRows.map((p) => this.toProofDto(p)),
      delivery: delivery
        ? {
            deliveredAt: delivery.deliveredAt.toISOString(),
            confirmedBy: delivery.confirmedBy,
            pinVerified: delivery.pinVerified,
            condition: delivery.condition,
            receivedCount: delivery.receivedCount,
            expectedCount: delivery.expectedCount,
            notes: delivery.notes,
            reviewFlag: delivery.reviewFlag,
          }
        : null,
      payment: payment ? this.payments.toDto(payment) : null,
      messagesCount,
      timeline: this.timeline(s, matches, checkins, trip, loadRow, delivery, payment, timelineIssues),
      tripId: trip?.id ?? null,
      tripRef: trip?.ref ?? null,
      canCancel: ['requested', 'matched'].includes(s.status) && (perm('shipment:cancel') || staff),
      canBook: s.status === 'requested' && perm('match:book'),
      canConfirmManually: s.status === 'in_transit' && (perm('shipment:confirm_delivery') || staff),
      receiverLink: `${this.env.publicWebUrl}/r/${s.receiverCode}`,
    };
  }

  toProofDto(p: Proof): ProofDto {
    const label = p.kind === 'pickup_photo' ? `pickup ${formatTime(p.takenAt)}` : p.kind === 'delivery_photo' ? `delivery ${formatTime(p.takenAt)}` : p.kind === 'damage_photo' ? 'damage' : 'waybill';
    return { id: p.id, kind: p.kind, label, url: this.storage.signUrl(p.fileKey), takenAt: p.takenAt.toISOString() };
  }

  private timeline(
    s: Shipment,
    matches: Match[],
    checkins: TripCheckin[],
    trip: Trip | null,
    load: TripLoad | null,
    delivery: Delivery | null,
    payment: Awaited<ReturnType<PaymentsService['forShipment']>>,
    issues: Issue[],
  ): TimelineEventDto[] {
    const ev: TimelineEventDto[] = [{ at: s.createdAt.toISOString(), label: 'Shipment requested', detail: `${s.ref} · ${formatKg(s.weightKg)}`, tone: 'neutral' }];
    for (const m of matches) {
      const who = (m.capacityPost as CapacityPost | undefined)?.fleetOrg?.name ?? 'A carrier';
      ev.push({ at: m.createdAt.toISOString(), label: m.proposedBy === 'shipper' || m.proposedBy === 'broker' ? `Booking sent to ${who}` : `Offer from ${who}`, detail: formatEtb(m.priceEtb), tone: 'amber' });
      if (m.status === 'confirmed' && m.respondedAt) ev.push({ at: m.respondedAt.toISOString(), label: 'Truck booked', detail: (m.capacityPost as CapacityPost | undefined)?.vehicle?.plate ?? null, tone: 'amber' });
      if (['declined', 'expired'].includes(m.status) && (m.respondedAt || m.updatedAt)) ev.push({ at: (m.respondedAt ?? m.updatedAt).toISOString(), label: m.status === 'declined' ? `${who} declined` : `Offer from ${who} expired`, detail: m.declineReason, tone: 'neutral' });
    }
    if (load?.pickedUpAt) ev.push({ at: load.pickedUpAt.toISOString(), label: 'Cargo picked up', detail: 'Counted and photographed', tone: 'lapis' });
    if (trip?.departedAt) ev.push({ at: trip.departedAt.toISOString(), label: 'Truck departed', detail: trip.ref, tone: 'lapis' });
    for (const c of checkins) {
      if (trip && c.placeId === trip.originPlaceId && trip.departedAt && Math.abs(c.checkedInAt.getTime() - trip.departedAt.getTime()) < 1000) continue;
      ev.push({ at: c.checkedInAt.toISOString(), label: `Checked in at ${c.place.name}`, detail: c.channel === 'app' ? null : `via ${c.channel.toUpperCase()}`, tone: 'lapis' });
    }
    if (delivery) ev.push({ at: delivery.deliveredAt.toISOString(), label: 'Delivered', detail: delivery.pinVerified ? 'PIN confirmed' : delivery.confirmedBy.replace('_', ' '), tone: 'green' });
    if (payment?.paidAt) ev.push({ at: payment.paidAt.toISOString(), label: 'Payment recorded', detail: formatEtb(payment.amountEtb), tone: 'green' });
    for (const i of issues) ev.push({ at: i.createdAt.toISOString(), label: `Issue: ${i.title}`, detail: i.ref, tone: 'red' });
    if (s.cancelledAt) ev.push({ at: s.cancelledAt.toISOString(), label: 'Cancelled', detail: s.cancelReason, tone: 'neutral' });
    return ev.sort((a, b) => a.at.localeCompare(b.at));
  }
}
