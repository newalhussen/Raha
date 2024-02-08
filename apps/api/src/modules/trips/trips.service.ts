import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  formatEtb,
  type CheckinChannel,
  type DeliveryCondition,
  type DeliveryConfirmation,
  type TripStatus,
} from '@raha/contracts';
import { point } from '../../common/geo';
import { DomainError, badRequest, conflict, forbidden, notFound } from '../../common/errors';
import { decryptString, pinDigest, safeEqualHex } from '../../common/crypto';
import { loadEnv } from '../../config/env';
import {
  CapacityPost,
  Delivery,
  DriverProfile,
  Issue,
  Match,
  Membership,
  Payment,
  Proof,
  Shipment,
  Trip,
  TripCheckin,
  TripLoad,
  Vehicle,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { T } from '../notifications/templates';
import { ReferenceService, type ResolvedRoute } from '../reference/reference.service';
import { estimateEta } from './strip';

export const TRIP_RELATIONS = {
  vehicle: true,
  driver: true,
  fleetOrg: true,
  origin: true,
  destination: true,
  corridor: true,
  loads: { shipment: { pickupPlace: true, dropoffPlace: true, shipperOrg: true } },
} as const;

const PIN_MAX_ATTEMPTS = 5;
const PAYMENT_DUE_DAYS = 7;

export interface FinalizeDeliveryInput {
  tripId: string;
  loadId: string;
  confirmedBy: DeliveryConfirmation;
  pinVerified: boolean;
  condition: DeliveryCondition;
  receivedCount?: number | null;
  photoKey?: string | null;
  at: Date;
  notes?: string | null;
  offlineSynced?: boolean;
  actorUserId?: string | null;
}

@Injectable()
export class TripsService {
  private readonly log = new Logger(TripsService.name);
  private readonly env = loadEnv();

  constructor(
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(TripLoad) private readonly loads: Repository<TripLoad>,
    @InjectRepository(TripCheckin) private readonly checkins: Repository<TripCheckin>,
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    private readonly db: DataSource,
    private readonly reference: ReferenceService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────── attaching confirmed matches ─────────────────────────

  /** The planned trip for a capacity post, created on the first confirmed match. */
  async ensureTripForPost(tx: EntityManager, post: CapacityPost): Promise<Trip> {
    const repo = tx.getRepository(Trip);
    const existing = await repo.findOne({ where: { capacityPostId: post.id, status: In<TripStatus>(['planned', 'to_pickup', 'loading']) }, lock: { mode: 'pessimistic_write' } });
    if (existing) return existing;
    if (!post.driverId) throw conflict('no_driver', 'This truck space has no driver assigned');
    const [{ seq }] = await tx.query<Array<{ seq: string }>>(`SELECT nextval('trip_ref_seq') AS seq`);
    return repo.save(
      repo.create({
        ref: `TR-${String(new Date().getFullYear() % 100).padStart(2, '0')}-${String(seq).padStart(5, '0')}`,
        vehicleId: post.vehicleId,
        driverId: post.driverId,
        fleetOrgId: post.fleetOrgId,
        capacityPostId: post.id,
        corridorId: post.corridorId,
        originPlaceId: post.originPlaceId,
        destinationPlaceId: post.destinationPlaceId,
        status: 'planned',
        plannedDepartureAt: post.departsAt,
        etaAt: post.etaAt,
      }),
    );
  }

  async addLoad(tx: EntityManager, trip: Trip, shipment: Shipment, match: Match | null, isRahaMatch: boolean): Promise<TripLoad> {
    const load = await tx.getRepository(TripLoad).save(
      tx.getRepository(TripLoad).create({ tripId: trip.id, shipmentId: shipment.id, matchId: match?.id ?? null, isRahaMatch, weightKg: shipment.weightKg, dropOrder: 99 }),
    );
    await this.reorderDrops(tx, trip.id);
    return load;
  }

  /** Drop-off order follows the truck's direction of travel (PostGIS line position of each drop-off). */
  async reorderDrops(tx: EntityManager, tripId: string): Promise<void> {
    const rows = await tx.query<Array<{ id: string; f: number }>>(
      `SELECT tl.id,
              ST_LineLocatePoint(cp.route::geometry, COALESCE(s.dropoff_point, dp.location)::geometry) AS f
         FROM trip_loads tl
         JOIN trips t ON t.id = tl.trip_id
         JOIN capacity_posts cp ON cp.id = t.capacity_post_id
         JOIN shipments s ON s.id = tl.shipment_id
         JOIN places dp ON dp.id = s.dropoff_place_id
        WHERE tl.trip_id = $1 AND cp.route IS NOT NULL
        ORDER BY f ASC, tl.created_at ASC`,
      [tripId],
    );
    let order = 1;
    for (const r of rows) await tx.getRepository(TripLoad).update(r.id, { dropOrder: order++ });
  }

  /** Remove a load from a trip that has not left yet (shipment cancelled / match withdrawn). */
  async removeLoad(tx: EntityManager, shipmentId: string): Promise<void> {
    const load = await tx.getRepository(TripLoad).findOne({ where: { shipmentId } });
    if (!load) return;
    const trip = await tx.getRepository(Trip).findOneOrFail({ where: { id: load.tripId }, lock: { mode: 'pessimistic_write' } });
    if (trip.status === 'in_transit' || trip.status === 'completed') throw conflict('trip_started', 'The truck has already left with this load');
    await tx.getRepository(TripLoad).delete(load.id);
    const remaining = await tx.getRepository(TripLoad).count({ where: { tripId: trip.id } });
    if (remaining === 0) await tx.getRepository(Trip).update(trip.id, { status: 'cancelled' });
    else await this.reorderDrops(tx, trip.id);
  }

  // ───────────────────────── driver actions (idempotent) ─────────────────────────

  private async lockTripForDriver(tx: EntityManager, userId: string, tripId: string): Promise<Trip> {
    const trip = await tx.getRepository(Trip).findOne({ where: { id: tripId }, lock: { mode: 'pessimistic_write' } });
    if (!trip) throw notFound('Trip');
    if (trip.driverId !== userId) throw forbidden('This trip belongs to another driver', 'not_your_trip');
    return trip;
  }

  private async getLoad(tx: EntityManager, tripId: string, loadId: string): Promise<TripLoad> {
    const load = await tx.getRepository(TripLoad).findOne({ where: { id: loadId, tripId } });
    if (!load) throw notFound('Load');
    return load;
  }

  /** "Go to pickup": the driver is on the way. */
  async begin(userId: string, tripId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const trip = await this.lockTripForDriver(tx, userId, tripId);
      if (trip.status === 'planned') await tx.getRepository(Trip).update(trip.id, { status: 'to_pickup' });
      else if (!['to_pickup', 'loading', 'in_transit'].includes(trip.status)) throw conflict('trip_closed', 'This trip is already finished');
    });
  }

  /** "I've arrived" at a pickup. */
  async arrive(userId: string, tripId: string, loadId: string, at: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      const trip = await this.lockTripForDriver(tx, userId, tripId);
      if (!['planned', 'to_pickup', 'loading'].includes(trip.status)) throw conflict('trip_started', 'This trip has already left');
      const load = await this.getLoad(tx, tripId, loadId);
      if (load.status !== 'assigned') return; // already arrived / picked up — idempotent
      await tx.getRepository(TripLoad).update(load.id, { status: 'arrived_pickup', arrivedPickupAt: at });
      await tx.getRepository(Trip).update(trip.id, { status: 'loading' });
    });
  }

  /** Cargo counted, photographed and loaded. */
  async pickup(userId: string, tripId: string, loadId: string, input: { at: Date; checklist: { counted: boolean; noDamage: boolean; waybill: boolean }; photoKeys: string[]; actionId: string; lat?: number; lng?: number }): Promise<void> {
    if (!input.photoKeys.length) throw badRequest('photo_required', 'Take at least one photo of the loaded cargo');
    if (!input.checklist.counted) throw badRequest('count_required', 'Count the cargo before confirming pickup');
    await this.db.transaction(async (tx) => {
      const trip = await this.lockTripForDriver(tx, userId, tripId);
      if (!['planned', 'to_pickup', 'loading'].includes(trip.status)) throw conflict('trip_started', 'This trip has already left');
      const load = await this.getLoad(tx, tripId, loadId);
      if (load.status === 'picked_up' || load.status === 'in_transit' || load.status === 'delivered') return; // idempotent replay

      const location = input.lat != null && input.lng != null ? point(input.lat, input.lng) : null;
      for (let i = 0; i < input.photoKeys.length; i++) {
        await tx.getRepository(Proof).save(
          tx.getRepository(Proof).create({
            shipmentId: load.shipmentId,
            tripLoadId: load.id,
            kind: 'pickup_photo',
            fileKey: input.photoKeys[i]!,
            clientId: deterministicUuid(`${input.actionId}:${i}`),
            takenAt: input.at,
            location,
            uploadedBy: userId,
          }),
        );
      }
      await tx.getRepository(TripLoad).update(load.id, { status: 'picked_up', pickedUpAt: input.at, pickupChecklist: input.checklist, arrivedPickupAt: load.arrivedPickupAt ?? input.at });
      await tx.getRepository(Trip).update(trip.id, { status: 'loading' });
      if (load.isRahaMatch) await tx.query(`UPDATE vehicles SET current_load_kg = LEAST(max_load_kg, current_load_kg + $1), status = 'loading' WHERE id = $2`, [load.weightKg, trip.vehicleId]);
    });
  }

  /** "Start trip": everything is aboard; receivers get their PIN by SMS. */
  async start(userId: string, tripId: string, at: Date): Promise<void> {
    const started = await this.db.transaction(async (tx) => {
      const trip = await this.lockTripForDriver(tx, userId, tripId);
      if (trip.status === 'in_transit') return null; // replay
      if (!['planned', 'to_pickup', 'loading'].includes(trip.status)) throw conflict('trip_closed', 'This trip is already finished');
      const loads = await tx.getRepository(TripLoad).find({ where: { tripId } });
      if (!loads.length) throw conflict('no_loads', 'There is nothing to carry on this trip');
      const notReady = loads.filter((l) => l.status === 'assigned' || l.status === 'arrived_pickup');
      if (notReady.length) throw conflict('pickups_pending', `${notReady.length} pickup(s) are not confirmed yet`, { loadIds: notReady.map((l) => l.id) });

      const route = await this.reference.resolveRoute(trip.originPlaceId, trip.destinationPlaceId);
      const eta = estimateEta({ routeKm: route.routeKm, stops: route.stops, lastPlaceId: null, lastCheckinAt: null, departedAt: at, plannedDepartureAt: trip.plannedDepartureAt });
      await tx.getRepository(Trip).update(trip.id, { status: 'in_transit', departedAt: at, etaAt: eta, lastPlaceId: trip.originPlaceId, lastCheckinAt: at });
      await tx.getRepository(TripLoad).update({ tripId, status: 'picked_up' }, { status: 'in_transit' });
      await tx.query(`UPDATE shipments SET status = 'in_transit', updated_at = now() WHERE id = ANY($1::uuid[]) AND status = 'matched'`, [loads.map((l) => l.shipmentId)]);
      await tx.getRepository(Vehicle).update(trip.vehicleId, { status: 'on_trip' });
      if (trip.capacityPostId) await tx.getRepository(CapacityPost).update(trip.capacityPostId, { status: 'departed' });
      await tx.getRepository(TripCheckin).save(
        tx.getRepository(TripCheckin).create({ tripId, placeId: trip.originPlaceId, clientId: deterministicUuid(`start:${tripId}`), channel: 'app', checkedInAt: at }),
      );
      await this.audit.record({ actor: { userId, isStaff: false, ip: null }, action: 'trip.start', entityType: 'trip', entityId: trip.id }, tx);
      return { shipmentIds: loads.map((l) => l.shipmentId), eta };
    });

    if (started) await this.announceDeparture(started.shipmentIds, started.eta);
  }

  /** A driver (or SMS reply / ops call) reports being in a town on the route. */
  async checkin(
    tripId: string,
    input: { actorUserId: string | null; placeId: string; clientId: string; at: Date; channel: CheckinChannel; offline?: boolean; lat?: number; lng?: number; note?: string; enforceDriver?: boolean },
  ): Promise<{ duplicate: boolean }> {
    return this.db.transaction(async (tx) => {
      const trip = await tx.getRepository(Trip).findOne({ where: { id: tripId }, lock: { mode: 'pessimistic_write' } });
      if (!trip) throw notFound('Trip');
      if (input.enforceDriver && trip.driverId !== input.actorUserId) throw forbidden('This trip belongs to another driver', 'not_your_trip');
      if (trip.status !== 'in_transit' && trip.status !== 'completed') throw conflict('not_in_transit', 'Check-ins start once the trip has departed');

      const route = await this.reference.resolveRoute(trip.originPlaceId, trip.destinationPlaceId);
      const stop = route.stops.find((s) => s.place.id === input.placeId);
      if (!stop) throw badRequest('not_on_route', 'That town is not on this trip’s route');

      const dup = await tx.getRepository(TripCheckin).findOne({ where: { tripId, clientId: input.clientId } });
      if (dup) return { duplicate: true };

      await tx.getRepository(TripCheckin).save(
        tx.getRepository(TripCheckin).create({
          tripId,
          placeId: input.placeId,
          clientId: input.clientId,
          channel: input.channel,
          checkedInAt: input.at,
          offline: input.offline ?? false,
          location: input.lat != null && input.lng != null ? point(input.lat, input.lng) : null,
          note: input.note ?? null,
        }),
      );

      // Only a later milestone moves the trip's position (offline check-ins can arrive out of order).
      const lastStop = route.stops.find((s) => s.place.id === trip.lastPlaceId);
      if (trip.status === 'in_transit' && (!lastStop || stop.km >= lastStop.km) && (!trip.lastCheckinAt || input.at >= trip.lastCheckinAt)) {
        const eta = estimateEta({ routeKm: route.routeKm, stops: route.stops, lastPlaceId: input.placeId, lastCheckinAt: input.at, departedAt: trip.departedAt, plannedDepartureAt: trip.plannedDepartureAt });
        await tx.getRepository(Trip).update(trip.id, { lastPlaceId: input.placeId, lastCheckinAt: input.at, etaAt: eta });
      }
      return { duplicate: false };
    });
  }

  /** Driver hands over cargo; the receiver's PIN is verified here, always, even if the phone checked it offline. */
  async deliver(
    userId: string,
    tripId: string,
    loadId: string,
    input: { pin: string; condition: DeliveryCondition; receivedCount?: number; photoKey?: string | null; at: Date; offline?: boolean },
  ): Promise<{ duplicate: boolean }> {
    const tripLoad = await this.loads.findOne({ where: { id: loadId, tripId } });
    if (!tripLoad) throw notFound('Load');
    if (tripLoad.status === 'delivered') return { duplicate: true };

    const shipment = await this.shipments
      .createQueryBuilder('s')
      .addSelect(['s.pinHash', 's.pinSalt'])
      .where('s.id = :id', { id: tripLoad.shipmentId })
      .getOneOrFail();

    if (shipment.pinAttempts >= PIN_MAX_ATTEMPTS) {
      throw new DomainError('pin_locked', 'Too many wrong PINs. Call Raha support on 8817 to confirm this delivery.', HttpStatus.LOCKED);
    }
    const ok = !!shipment.pinHash && !!shipment.pinSalt && safeEqualHex(pinDigest(shipment.pinSalt, input.pin), shipment.pinHash);
    if (!ok) {
      await this.shipments.increment({ id: shipment.id }, 'pinAttempts', 1);
      const left = Math.max(0, PIN_MAX_ATTEMPTS - shipment.pinAttempts - 1);
      throw new DomainError('pin_wrong', left > 0 ? `That PIN is not right. ${left} tries left.` : 'Too many wrong PINs. Call Raha support on 8817.', HttpStatus.UNPROCESSABLE_ENTITY, { attemptsLeft: left });
    }

    await this.finalizeDelivery({
      tripId,
      loadId,
      confirmedBy: 'pin',
      pinVerified: true,
      condition: input.condition,
      receivedCount: input.receivedCount ?? null,
      photoKey: input.photoKey ?? null,
      at: input.at,
      offlineSynced: input.offline ?? false,
      actorUserId: userId,
    });
    return { duplicate: false };
  }

  /**
   * Single place where a load becomes "delivered", whoever confirmed it (PIN, receiver link, shipper, ops).
   * Records proof, opens a payment due to the carrier, closes the trip when it was the last drop, flags
   * anything unusual for the ops review queue and opens a dispute for short/damaged deliveries.
   */
  async finalizeDelivery(input: FinalizeDeliveryInput): Promise<void> {
    const result = await this.db.transaction(async (tx) => {
      const trip = await tx.getRepository(Trip).findOne({ where: { id: input.tripId }, lock: { mode: 'pessimistic_write' } });
      if (!trip) throw notFound('Trip');
      const load = await tx.getRepository(TripLoad).findOne({ where: { id: input.loadId, tripId: input.tripId } });
      if (!load) throw notFound('Load');
      if (load.status === 'delivered') return null;
      if (!['in_transit', 'picked_up'].includes(load.status)) throw conflict('not_in_transit', 'This load is not on the road');

      const shipment = await tx.getRepository(Shipment).findOneOrFail({ where: { id: load.shipmentId }, lock: { mode: 'pessimistic_write' } });
      const match = shipment.matchId ? await tx.getRepository(Match).findOne({ where: { id: shipment.matchId } }) : null;

      let reviewFlag: string | null = null;
      if (input.condition === 'short_count') reviewFlag = 'short_count';
      else if (input.condition === 'damaged') reviewFlag = 'damaged';
      else if (!input.pinVerified && input.confirmedBy === 'shipper_manual') reviewFlag = 'no_pin';
      else if (input.confirmedBy === 'pin' && !input.photoKey) reviewFlag = 'no_photo';

      await tx.getRepository(Delivery).save(
        tx.getRepository(Delivery).create({
          shipmentId: shipment.id,
          tripLoadId: load.id,
          deliveredAt: input.at,
          confirmedBy: input.confirmedBy,
          pinVerified: input.pinVerified,
          condition: input.condition,
          receivedCount: input.receivedCount ?? null,
          expectedCount: shipment.pieces,
          notes: input.notes ?? null,
          offlineSynced: input.offlineSynced ?? false,
          reviewFlag,
        }),
      );
      if (input.photoKey) {
        await tx.getRepository(Proof).save(
          tx.getRepository(Proof).create({
            shipmentId: shipment.id,
            tripLoadId: load.id,
            kind: 'delivery_photo',
            fileKey: input.photoKey,
            clientId: deterministicUuid(`deliver:${load.id}`),
            takenAt: input.at,
            uploadedBy: input.actorUserId ?? null,
          }),
        );
      }

      await tx.getRepository(TripLoad).update(load.id, { status: 'delivered', deliveredAt: input.at });
      await tx.getRepository(Shipment).update(shipment.id, { status: 'delivered', deliveredAt: input.at, pinVerifiedAt: input.pinVerified ? input.at : null });
      if (load.isRahaMatch) await tx.query(`UPDATE vehicles SET current_load_kg = GREATEST(0, current_load_kg - $1) WHERE id = $2`, [load.weightKg, trip.vehicleId]);

      // The carrier is owed the agreed price; payment itself happens outside Raha and is recorded later.
      const price = shipment.agreedPriceEtb ?? match?.priceEtb ?? 0;
      await tx.getRepository(Payment).save(
        tx.getRepository(Payment).create({
          shipmentId: shipment.id,
          tripId: trip.id,
          payerOrgId: shipment.shipperOrgId,
          payeeOrgId: trip.fleetOrgId,
          amountEtb: price,
          status: 'pending',
          dueAt: new Date(input.at.getTime() + PAYMENT_DUE_DAYS * 86_400_000),
        }),
      );

      if (input.condition !== 'all_good') {
        const [{ n }] = await tx.query<Array<{ n: string }>>(`SELECT nextval('issue_ref_seq') AS n`);
        const detail =
          input.condition === 'short_count'
            ? `Short delivery: ${input.receivedCount ?? '?'} of ${shipment.pieces ?? '?'} pieces`
            : 'Cargo reported damaged on delivery';
        await tx.getRepository(Issue).save(
          tx.getRepository(Issue).create({
            ref: `IS-${n}`,
            kind: 'dispute',
            priority: 1,
            title: detail,
            body: `${shipment.ref} · confirmed by ${input.confirmedBy}.`,
            shipmentId: shipment.id,
            tripId: trip.id,
            raisedBy: input.actorUserId ?? null,
            raisedByOrg: shipment.shipperOrgId,
            actionHint: 'Open case',
          }),
        );
      }

      const remaining = await tx.getRepository(TripLoad).count({ where: { tripId: trip.id, status: In(['assigned', 'arrived_pickup', 'picked_up', 'in_transit']) } });
      let tripCompleted = false;
      if (remaining === 0) {
        tripCompleted = true;
        await tx.getRepository(Trip).update(trip.id, { status: 'completed', completedAt: input.at });
        await tx.getRepository(Vehicle).update(trip.vehicleId, { status: 'available', currentLoadKg: 0 });
        await tx.getRepository(DriverProfile).increment({ userId: trip.driverId }, 'tripsCompleted', 1);
      }
      await this.audit.record({ actor: input.actorUserId ? { userId: input.actorUserId, isStaff: false, ip: null } : null, action: 'delivery.confirm', entityType: 'shipment', entityId: shipment.id, data: { by: input.confirmedBy, condition: input.condition, reviewFlag } }, tx);
      return { shipment, trip, price, tripCompleted };
    });

    if (!result) return;
    const { shipment, trip, price } = result;
    const managers = await this.orgUserIds(trip.fleetOrgId, ['owner', 'manager']);
    const shipperUsers = await this.orgUserIds(shipment.shipperOrgId, ['owner', 'manager', 'staff']);
    await Promise.all([
      this.notifications.notifyMany(shipperUsers, (userId) => ({ userId, type: 'delivery.completed', ...T.deliveredForShipper('en', { ref: shipment.ref, at: input.at, by: input.confirmedBy === 'pin' ? 'PIN confirmed' : input.confirmedBy.replace('_', ' ') }), via: { telegram: true }, data: { shipmentId: shipment.id }, dedupeKey: `delivered:${shipment.id}:${userId}` })),
      this.notifications.notifyMany([trip.driverId, ...managers], (userId) => ({ userId, type: 'delivery.completed', ...T.deliveredForCarrier('en', { ref: shipment.ref, amountEtb: price }), data: { shipmentId: shipment.id, tripId: trip.id }, dedupeKey: `delivered-carrier:${shipment.id}:${userId}` })),
    ]);
  }

  // ───────────────────────── departure announcements ─────────────────────────

  private async announceDeparture(shipmentIds: string[], eta: Date | null): Promise<void> {
    const shipments = await this.shipments
      .createQueryBuilder('s')
      .addSelect(['s.pinEnc'])
      .leftJoinAndSelect('s.shipperOrg', 'org')
      .leftJoinAndSelect('s.dropoffPlace', 'dp')
      .where('s.id IN (:...ids)', { ids: shipmentIds })
      .getMany();

    for (const s of shipments) {
      const trip = s.tripId ? await this.trips.findOne({ where: { id: s.tripId }, relations: { vehicle: true } }) : null;
      const arrival = eta ?? trip?.etaAt ?? new Date(Date.now() + 4 * 3_600_000);
      const cargo = s.pieces ? `${s.pieces} ${s.cargoType}` : s.cargoType;
      if (s.pinEnc) {
        const pin = decryptString(this.env.pinEncKey, s.pinEnc);
        const msg = T.receiverPin({ ref: s.ref, shipper: s.shipperOrg.name, cargo, eta: arrival, plate: trip?.vehicle.plate ?? '', pin, url: `${this.env.publicWebUrl}/r/${s.receiverCode}` });
        await this.notifications.notify({ phone: s.receiverPhone, type: 'trip.receiver_pin', title: 'Delivery PIN', body: msg.en, sms: msg.en, dedupeKey: `pin-en:${s.id}` });
        await this.notifications.notify({ phone: s.receiverPhone, type: 'trip.receiver_pin_am', title: 'Delivery PIN', body: msg.am, sms: msg.am, dedupeKey: `pin-am:${s.id}` });
      }
      const users = await this.orgUserIds(s.shipperOrgId, ['owner', 'manager', 'staff']);
      await this.notifications.notifyMany(users, (userId) => ({ userId, type: 'trip.started', ...T.tripStartedForShipper('en', { ref: s.ref, to: s.dropoffPlace.name, eta: arrival }), via: { telegram: true }, data: { shipmentId: s.id }, dedupeKey: `departed:${s.id}:${userId}` }));
    }
  }

  async orgUserIds(orgId: string, roles: Array<Membership['role']>): Promise<string[]> {
    const rows = await this.memberships.find({ where: { organizationId: orgId, role: In(roles), status: 'active' }, select: ['userId'] });
    return rows.map((r) => r.userId);
  }

  // ───────────────────────── queries used by several modules ─────────────────────────

  async loadTrip(tripId: string): Promise<Trip> {
    const trip = await this.trips.findOne({ where: { id: tripId }, relations: TRIP_RELATIONS });
    if (!trip) throw notFound('Trip');
    trip.loads.sort((a, b) => a.dropOrder - b.dropOrder);
    return trip;
  }

  async routeFor(trip: Pick<Trip, 'originPlaceId' | 'destinationPlaceId'>): Promise<ResolvedRoute> {
    return this.reference.resolveRoute(trip.originPlaceId, trip.destinationPlaceId);
  }

  async loadForShipment(shipmentId: string): Promise<TripLoad | null> {
    return this.loads.findOne({ where: { shipmentId } });
  }

  async checkinsOf(tripId: string): Promise<TripCheckin[]> {
    return this.checkins.find({ where: { tripId }, relations: { place: true }, order: { checkedInAt: 'ASC' } });
  }

  /** Formats a price the way the apps do. */
  money(n: number): string {
    return formatEtb(n);
  }
}

/** Stable UUID-shaped value from a string so replays of the same action hit the same unique key. */
export function deterministicUuid(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
