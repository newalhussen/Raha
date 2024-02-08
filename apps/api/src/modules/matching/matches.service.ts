import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThan, Repository } from 'typeorm';
import type { MatchDto, MatchProposer } from '@raha/contracts';
import { encryptString, pinDigest, randomDigits, randomToken } from '../../common/crypto';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { loadEnv } from '../../config/env';
import { CapacityPost, Match, Shipment, Trip } from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { FleetService } from '../fleet/fleet.service';
import { NotificationsService } from '../notifications/notifications.service';
import { T } from '../notifications/templates';
import { ReferenceService } from '../reference/reference.service';
import { TripsService } from '../trips/trips.service';
import { MatchingService } from './matching.service';
import { PricingService } from './pricing.service';
import { POST_RELATIONS } from '../capacity/capacity.service';

const PROPOSAL_TTL_HOURS = 6;

export interface ProposeInput {
  shipmentId: string;
  capacityPostId: string;
  /** Who is making the proposal. Decides which side must answer. */
  side: Extract<MatchProposer, 'shipper' | 'carrier' | 'broker' | 'fleet' | 'ops'>;
  priceEtb?: number;
  brokerFeeEtb?: number;
  /** Ops "assist match": both parties already agreed by phone, confirm straight away. */
  confirmNow?: boolean;
}

type Party = 'shipper' | 'carrier' | 'ops';

@Injectable()
export class MatchesService {
  private readonly log = new Logger(MatchesService.name);
  private readonly env = loadEnv();

  constructor(
    @InjectRepository(Match) private readonly matches: Repository<Match>,
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    @InjectRepository(CapacityPost) private readonly posts: Repository<CapacityPost>,
    private readonly db: DataSource,
    private readonly matching: MatchingService,
    private readonly pricing: PricingService,
    private readonly trips: TripsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly fleet: FleetService,
    private readonly reference: ReferenceService,
  ) {}

  // ───────────────────────── who may act ─────────────────────────

  /** Which side(s) of a proposal the caller stands on. */
  partiesOf(ctx: RequestContext, shipment: Pick<Shipment, 'shipperOrgId' | 'loggedByOrgId'>, post: Pick<CapacityPost, 'fleetOrgId' | 'brokerOrgId' | 'driverId'>): Party[] {
    const parties: Party[] = [];
    const orgId = ctx.org?.id;
    if (orgId && (orgId === shipment.shipperOrgId || orgId === shipment.loggedByOrgId)) parties.push('shipper');
    if ((orgId && (orgId === post.fleetOrgId || orgId === post.brokerOrgId)) || post.driverId === ctx.userId) parties.push('carrier');
    if (ctx.isStaff && ctx.permissions.includes('ops:match')) parties.push('ops');
    return parties;
  }

  // ───────────────────────── propose ─────────────────────────

  async propose(ctx: RequestContext, input: ProposeInput): Promise<Match> {
    const shipment = await this.shipments.findOne({ where: { id: input.shipmentId }, relations: { shipperOrg: true, pickupPlace: true, dropoffPlace: true } });
    if (!shipment) throw notFound('Shipment');
    const post = await this.posts.findOne({ where: { id: input.capacityPostId }, relations: POST_RELATIONS });
    if (!post) throw notFound('Truck space');

    const parties = this.partiesOf(ctx, shipment, post);
    const asShipperSide = input.side === 'shipper' || input.side === 'broker';
    if (input.side === 'ops') {
      if (!parties.includes('ops')) throw forbidden('Only Raha Operations can propose on behalf of both sides', 'ops_only');
    } else if (asShipperSide ? !parties.includes('shipper') : !parties.includes('carrier')) {
      throw forbidden(asShipperSide ? 'Only the shipper (or the broker handling this load) can book a truck' : 'Only the truck’s driver, fleet or broker can offer this truck', 'wrong_party');
    }
    if (input.side === 'carrier' || input.side === 'fleet') await this.assertCarrierReady(post);

    if (shipment.status !== 'requested') throw conflict('shipment_not_open', 'This shipment already has a truck or was cancelled');
    if (post.status !== 'open') throw conflict('space_closed', 'That truck space is no longer open');
    if (post.departsAt.getTime() < Date.now() - 3_600_000) throw conflict('space_expired', 'That truck has already left');
    if (await this.matches.exist({ where: { shipmentId: shipment.id, capacityPostId: post.id, status: In(['pending_carrier', 'pending_shipper', 'confirmed']) } })) {
      throw conflict('already_proposed', 'There is already a proposal between this load and this truck');
    }

    const candidate = await this.matching.evaluate(shipment.id, post.id, input.side === 'ops' ? 40 : undefined);
    if (!candidate) throw conflict('does_not_fit', 'This truck cannot take this load: it is not on the way, too heavy, or the body type does not suit the cargo.');

    const priceEtb = input.priceEtb ?? candidate.priceEtb;
    if (priceEtb < 0) throw badRequest('invalid_price', 'Price must be positive');
    const brokerFee = input.brokerFeeEtb ?? (input.side === 'broker' ? this.pricing.brokerFeeOn(priceEtb) : candidate.brokerFeeEtb);

    const pendingStatus: Match['status'] = asShipperSide || input.side === 'ops' ? 'pending_carrier' : 'pending_shipper';
    const match = await this.matches.save(
      this.matches.create({
        shipmentId: shipment.id,
        capacityPostId: post.id,
        status: pendingStatus,
        proposedBy: input.side,
        proposedByUser: ctx.userId,
        proposedByOrg: ctx.org?.id ?? null,
        priceEtb,
        brokerFeeEtb: brokerFee,
        fitKind: candidate.fit,
        isRahaMatch: true,
        score: candidate.score.total,
        scoreDetail: candidate.score as unknown as Record<string, unknown>,
        offRouteKm: candidate.offRouteKm,
        expiresAt: new Date(Date.now() + PROPOSAL_TTL_HOURS * 3_600_000),
      }),
    );
    await this.audit.record({ actor: ctx, action: 'match.propose', entityType: 'match', entityId: match.id, data: { side: input.side, shipment: shipment.ref, plate: post.vehicle.plate, priceEtb } });

    if (input.confirmNow) {
      if (!parties.includes('ops')) throw forbidden('Only Raha Operations can confirm both sides at once', 'ops_only');
      return this.confirm(ctx, match.id, true);
    }
    await this.notifyProposal(match, shipment, post);
    return match;
  }

  // ───────────────────────── respond ─────────────────────────

  async respond(ctx: RequestContext, matchId: string, action: 'accept' | 'decline' | 'cancel', reason?: string): Promise<Match> {
    const match = await this.matches.findOne({ where: { id: matchId } });
    if (!match) throw notFound('Proposal');
    const shipment = await this.shipments.findOneOrFail({ where: { id: match.shipmentId } });
    const post = await this.posts.findOneOrFail({ where: { id: match.capacityPostId } });
    const parties = this.partiesOf(ctx, shipment, post);
    if (!parties.length) throw forbidden('This proposal is not yours to answer', 'not_a_party');

    if (action === 'cancel') return this.cancel(ctx, match, shipment, post, parties, reason);

    if (match.status === 'confirmed') return match; // double-tap / both sides pressed accept — idempotent
    if (!['pending_carrier', 'pending_shipper'].includes(match.status)) throw conflict('proposal_closed', `This proposal is ${match.status}`);
    if (match.expiresAt && match.expiresAt < new Date()) {
      await this.matches.update(match.id, { status: 'expired' });
      throw conflict('proposal_expired', 'This proposal expired. Ask for a new one.');
    }

    const mustBe: Party = match.status === 'pending_carrier' ? 'carrier' : 'shipper';
    if (!parties.includes(mustBe) && !parties.includes('ops')) {
      throw forbidden(mustBe === 'carrier' ? 'The carrier has to answer this one' : 'The shipper has to answer this one', 'wrong_party');
    }

    if (action === 'accept') {
      if (mustBe === 'carrier') await this.assertCarrierReady(post);
      return this.confirm(ctx, match.id, false);
    }

    await this.matches.update(match.id, { status: 'declined', respondedBy: ctx.userId, respondedAt: new Date(), declineReason: reason ?? null });
    await this.audit.record({ actor: ctx, action: 'match.decline', entityType: 'match', entityId: match.id, data: { reason } });
    await this.notifyDeclined(match, shipment, post, ctx, reason ?? null);
    return this.matches.findOneByOrFail({ id: match.id });
  }

  /** The transaction that turns a proposal into a booked truck. All capacity accounting happens here. */
  async confirm(ctx: RequestContext, matchId: string, byOps: boolean): Promise<Match> {
    const outcome = await this.db.transaction(async (tx) => {
      const match = await tx.getRepository(Match).findOne({ where: { id: matchId }, lock: { mode: 'pessimistic_write' } });
      if (!match) throw notFound('Proposal');
      if (match.status === 'confirmed') return { match, already: true as const };
      if (!['pending_carrier', 'pending_shipper'].includes(match.status)) throw conflict('proposal_closed', `This proposal is ${match.status}`);

      // lock order: shipment, then post — the same everywhere, so concurrent confirms cannot deadlock
      const shipment = await tx.getRepository(Shipment).findOneOrFail({ where: { id: match.shipmentId }, lock: { mode: 'pessimistic_write' } });
      const post = await tx.getRepository(CapacityPost).findOneOrFail({ where: { id: match.capacityPostId }, lock: { mode: 'pessimistic_write' } });

      if (shipment.status !== 'requested') throw conflict('shipment_not_open', 'This shipment already has a truck or was cancelled');
      if (post.status !== 'open') throw conflict('space_closed', 'That truck space is no longer open');
      const free = post.totalCapacityKg - post.committedKg - post.matchedKg;
      if (free < shipment.weightKg) throw conflict('capacity_exceeded', `Only ${free} kg of space is left on this truck, the load is ${shipment.weightKg} kg`, { freeKg: free });
      if (!(await this.matching.evaluate(shipment.id, post.id, byOps ? 40 : undefined))) throw conflict('does_not_fit', 'This load no longer fits this truck');

      await tx.getRepository(Match).update(match.id, { status: 'confirmed', respondedBy: ctx.userId, respondedAt: new Date() });
      const siblings = await tx.getRepository(Match).find({ where: { shipmentId: shipment.id, status: In(['pending_carrier', 'pending_shipper']) } });
      const toCancel = siblings.filter((m) => m.id !== match.id);
      if (toCancel.length) await tx.getRepository(Match).update({ id: In(toCancel.map((m) => m.id)) }, { status: 'cancelled', declineReason: 'Another truck was booked' });

      const matchedKg = post.matchedKg + shipment.weightKg;
      await tx.getRepository(CapacityPost).update(post.id, { matchedKg, status: post.committedKg + matchedKg >= post.totalCapacityKg ? 'full' : 'open' });

      const trip = await this.trips.ensureTripForPost(tx, post);
      await this.trips.addLoad(tx, trip, shipment, match, true);
      await tx.getRepository(Match).update(match.id, { tripId: trip.id });

      const pin = randomDigits(4);
      const salt = randomToken(9);
      await tx.getRepository(Shipment).update(shipment.id, {
        status: 'matched',
        agreedPriceEtb: match.priceEtb,
        matchId: match.id,
        tripId: trip.id,
        pinSalt: salt,
        pinHash: pinDigest(salt, pin),
        pinEnc: encryptString(this.env.pinEncKey, pin),
        pinAttempts: 0,
      });
      await this.audit.record({ actor: ctx, action: 'match.confirm', entityType: 'match', entityId: match.id, data: { shipment: shipment.ref, trip: trip.ref } }, tx);
      return { match: await tx.getRepository(Match).findOneByOrFail({ id: match.id }), already: false as const, cancelled: toCancel };
    });

    if (!outcome.already) await this.notifyConfirmed(outcome.match);
    return outcome.match;
  }

  /** Withdraw a pending proposal, or unwind a confirmed one while the truck has not left. */
  private async cancel(ctx: RequestContext, match: Match, shipment: Shipment, post: CapacityPost, parties: Party[], reason?: string): Promise<Match> {
    if (['declined', 'expired', 'cancelled'].includes(match.status)) return match;
    if (match.status === 'confirmed') {
      await this.db.transaction(async (tx) => {
        const trip = match.tripId ? await tx.getRepository(Trip).findOne({ where: { id: match.tripId } }) : null;
        if (trip && ['in_transit', 'completed'].includes(trip.status)) throw conflict('trip_started', 'The truck has already left. Call Raha support on 8817.');
        const s = await tx.getRepository(Shipment).findOneOrFail({ where: { id: shipment.id }, lock: { mode: 'pessimistic_write' } });
        await this.trips.removeLoad(tx, s.id);
        await tx.query(`UPDATE capacity_posts SET matched_kg = GREATEST(0, matched_kg - $1), status = CASE WHEN status = 'full' THEN 'open' ELSE status END WHERE id = $2`, [s.weightKg, match.capacityPostId]);
        await tx.getRepository(Shipment).update(s.id, { status: 'requested', agreedPriceEtb: null, matchId: null, tripId: null, pinHash: null, pinSalt: null, pinEnc: null });
        await tx.getRepository(Match).update(match.id, { status: 'cancelled', respondedBy: ctx.userId, respondedAt: new Date(), declineReason: reason ?? 'Cancelled' });
        await this.audit.record({ actor: ctx, action: 'match.unwind', entityType: 'match', entityId: match.id, data: { reason } }, tx);
      });
    } else {
      // only the proposing side (or ops) may withdraw a pending proposal
      const proposerParty: Party = ['shipper', 'broker'].includes(match.proposedBy) ? 'shipper' : match.proposedBy === 'ops' ? 'ops' : 'carrier';
      if (!parties.includes(proposerParty) && !parties.includes('ops')) throw forbidden('Only the side that made this proposal can withdraw it', 'wrong_party');
      await this.matches.update(match.id, { status: 'cancelled', respondedBy: ctx.userId, respondedAt: new Date(), declineReason: reason ?? 'Withdrawn' });
      await this.audit.record({ actor: ctx, action: 'match.withdraw', entityType: 'match', entityId: match.id });
    }
    await this.notifyDeclined(match, shipment, post, ctx, reason ?? 'Cancelled');
    return this.matches.findOneByOrFail({ id: match.id });
  }

  // ───────────────────────── queries ─────────────────────────

  async forShipment(ctx: RequestContext, shipmentId: string): Promise<MatchDto[]> {
    const shipment = await this.shipments.findOneOrFail({ where: { id: shipmentId } });
    const rows = await this.matches.find({ where: { shipmentId }, relations: { capacityPost: POST_RELATIONS }, order: { createdAt: 'DESC' } });
    return rows.map((m) => this.toDto(ctx, m, shipment));
  }

  toDto(ctx: RequestContext, m: Match & { capacityPost: CapacityPost }, shipment: Pick<Shipment, 'shipperOrgId' | 'loggedByOrgId'>): MatchDto {
    const post = m.capacityPost;
    const parties = this.partiesOf(ctx, shipment, post);
    const pending = m.status === 'pending_carrier' || m.status === 'pending_shipper';
    const answerer: Party = m.status === 'pending_carrier' ? 'carrier' : 'shipper';
    const proposerParty: Party = ['shipper', 'broker'].includes(m.proposedBy) ? 'shipper' : m.proposedBy === 'ops' ? 'ops' : 'carrier';
    return {
      id: m.id,
      status: m.status,
      proposedBy: m.proposedBy,
      priceEtb: m.priceEtb,
      brokerFeeEtb: m.brokerFeeEtb,
      fit: m.fitKind,
      isRahaMatch: m.isRahaMatch,
      capacityPostId: m.capacityPostId,
      plate: post.vehicle.plate,
      vehicleLabel: this.fleet.toVehicleDto(post.vehicle).label,
      driverName: post.driver?.fullName ?? null,
      fleetName: post.fleetOrg.name,
      departsAt: post.departsAt.toISOString(),
      createdAt: m.createdAt.toISOString(),
      expiresAt: m.expiresAt?.toISOString() ?? null,
      declineReason: m.declineReason,
      canAccept: pending && (parties.includes(answerer) || parties.includes('ops')),
      canDecline: pending && (parties.includes(answerer) || parties.includes('ops')),
      canCancel: (pending && (parties.includes(proposerParty) || parties.includes('ops'))) || (m.status === 'confirmed' && parties.length > 0),
    };
  }

  // ───────────────────────── housekeeping ─────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireStale(): Promise<void> {
    const res = await this.matches.update({ status: In(['pending_carrier', 'pending_shipper']), expiresAt: LessThan(new Date()) }, { status: 'expired' });
    if (res.affected) this.log.log(`expired ${res.affected} stale proposals`);
  }

  // ───────────────────────── rules & notifications ─────────────────────────

  /** A carrier can only take work once Raha has verified the driver and the truck. */
  private async assertCarrierReady(post: CapacityPost): Promise<void> {
    const rows = await this.db.query<Array<{ dv: string | null; vv: string }>>(
      `SELECT dp.verification_status AS dv, v.verification_status AS vv
         FROM vehicles v LEFT JOIN driver_profiles dp ON dp.user_id = $2
        WHERE v.id = $1`,
      [post.vehicleId, post.driverId],
    );
    const r = rows[0];
    if (!r || r.vv !== 'verified') throw conflict('vehicle_not_verified', 'This truck is not verified yet');
    if (post.driverId && r.dv !== 'verified') throw conflict('driver_not_verified', 'The driver is not verified yet. Raha Operations must approve the licence and ID first.');
  }

  private async notifyProposal(match: Match, shipment: Shipment & { shipperOrg: { name: string }; pickupPlace: { name: string }; dropoffPlace: { name: string } }, post: CapacityPost): Promise<void> {
    if (match.status === 'pending_carrier') {
      const managers = post.fleetOrgId ? await this.trips.orgUserIds(post.fleetOrgId, ['owner', 'manager']) : [];
      const brokers = post.brokerOrgId ? await this.trips.orgUserIds(post.brokerOrgId, ['owner', 'dispatcher']) : [];
      await this.notifications.notifyMany([post.driverId, ...managers, ...brokers], (userId) => ({
        userId,
        type: 'load.offered',
        ...T.loadOffered('en', { weightKg: shipment.weightKg, cargo: shipment.cargoType, from: shipment.pickupPlace.name, to: shipment.dropoffPlace.name, priceEtb: match.priceEtb, ref: shipment.ref }),
        via: { telegram: true, sms: userId === post.driverId },
        data: { shipmentId: shipment.id, matchId: match.id },
        dedupeKey: `offer:${match.id}:${userId}`,
      }));
    } else {
      const users = [...(await this.trips.orgUserIds(shipment.shipperOrgId, ['owner', 'manager', 'staff'])), ...(shipment.loggedByOrgId ? await this.trips.orgUserIds(shipment.loggedByOrgId, ['owner', 'dispatcher']) : [])];
      await this.notifications.notifyMany(users, (userId) => ({
        userId,
        type: 'match.offer',
        ...T.offerForShipper('en', { ref: shipment.ref, fleet: post.fleetOrg?.name ?? 'A carrier', weightKg: shipment.weightKg, from: shipment.pickupPlace.name, to: shipment.dropoffPlace.name, priceEtb: match.priceEtb }),
        via: { telegram: true },
        data: { shipmentId: shipment.id, matchId: match.id },
        dedupeKey: `offer:${match.id}:${userId}`,
      }));
    }
  }

  private async notifyConfirmed(match: Match): Promise<void> {
    const shipment = await this.shipments.findOneOrFail({ where: { id: match.shipmentId }, relations: { shipperOrg: true, pickupPlace: true } });
    const post = await this.posts.findOneOrFail({ where: { id: match.capacityPostId }, relations: POST_RELATIONS });
    const shipperUsers = [...(await this.trips.orgUserIds(shipment.shipperOrgId, ['owner', 'manager', 'staff'])), ...(shipment.loggedByOrgId ? await this.trips.orgUserIds(shipment.loggedByOrgId, ['owner', 'dispatcher']) : [])];
    const carrierUsers = [post.driverId, ...(await this.trips.orgUserIds(post.fleetOrgId, ['owner', 'manager'])), ...(post.brokerOrgId ? await this.trips.orgUserIds(post.brokerOrgId, ['owner', 'dispatcher']) : [])];

    await Promise.all([
      this.notifications.notifyMany(shipperUsers, (userId) => ({
        userId,
        type: 'match.confirmed',
        ...T.matchConfirmedForShipper('en', { ref: shipment.ref, plate: post.vehicle.plate, driver: post.driver?.fullName ?? 'Driver', departsAt: post.departsAt }),
        via: { telegram: true },
        data: { shipmentId: shipment.id },
        dedupeKey: `confirmed-s:${match.id}:${userId}`,
      })),
      this.notifications.notifyMany(carrierUsers, (userId) => ({
        userId,
        type: 'load.matched',
        ...T.matchConfirmedForCarrier('en', { ref: shipment.ref, shipper: shipment.shipperOrg.name, pickupAddress: shipment.pickupAddress, pickupAt: shipment.readyAt }),
        via: { telegram: true, sms: userId === post.driverId },
        data: { shipmentId: shipment.id, tripId: match.tripId },
        dedupeKey: `confirmed-c:${match.id}:${userId}`,
      })),
    ]);
  }

  private async notifyDeclined(match: Match, shipment: Shipment, post: CapacityPost, ctx: RequestContext, reason: string | null): Promise<void> {
    // tell whoever proposed
    const proposerIsShipperSide = ['shipper', 'broker'].includes(match.proposedBy);
    const users = proposerIsShipperSide
      ? [...(await this.trips.orgUserIds(shipment.shipperOrgId, ['owner', 'manager', 'staff'])), ...(shipment.loggedByOrgId ? await this.trips.orgUserIds(shipment.loggedByOrgId, ['owner', 'dispatcher']) : [])]
      : [post.driverId, ...(await this.trips.orgUserIds(post.fleetOrgId, ['owner', 'manager']))];
    await this.notifications.notifyMany(users.filter((u) => u !== ctx.userId), (userId) => ({
      userId,
      type: 'match.declined',
      ...T.matchDeclined('en', { ref: shipment.ref, by: ctx.org?.name ?? ctx.fullName, reason }),
      data: { shipmentId: shipment.id, matchId: match.id },
      dedupeKey: `declined:${match.id}:${userId}`,
    }));
  }
}
