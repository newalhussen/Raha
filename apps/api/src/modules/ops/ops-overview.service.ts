import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  CARGO_TYPES,
  formatAge,
  formatKg,
  formatTonnes,
  type CorridorBoardRowDto,
  type CorridorDotDto,
  type DeliveryReviewDto,
  type NeedsHumanDto,
  type OpsOverviewDto,
} from '@raha/contracts';
import { Delivery, Issue, Shipment, Trip } from '../../database/entities';
import { MatchingService } from '../matching/matching.service';
import { ReferenceService } from '../reference/reference.service';
import { StorageService } from '../files/storage.service';
import { TRIP_RELATIONS } from '../trips/trips.service';
import { IssuesService } from '../issues/issues.service';

/** A truck on the road with no check-in for this long needs a phone call. */
export const LATE_CHECKIN_HOURS = 3;
const EAT = 'Africa/Addis_Ababa';

@Injectable()
export class OpsOverviewService {
  constructor(
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(Shipment) private readonly shipments: Repository<Shipment>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(Delivery) private readonly deliveries: Repository<Delivery>,
    private readonly reference: ReferenceService,
    private readonly matching: MatchingService,
    private readonly storage: StorageService,
    private readonly issueService: IssuesService,
  ) {}

  async overview(): Promise<OpsOverviewDto> {
    const [stats, onRoad, corridors, needsHuman, review, loadFactor, verificationCount, issueCounts] = await Promise.all([
      this.stats(),
      this.trips.find({ where: { status: 'in_transit' }, relations: TRIP_RELATIONS }),
      this.reference.listCorridors(),
      this.needsHuman(),
      this.deliveryReview(),
      this.loadFactor(),
      this.trips.query(`SELECT count(*)::int AS n FROM verification_cases WHERE status IN ('pending','in_review')`),
      this.issueService.openCounts(),
    ]);

    const board: CorridorBoardRowDto[] = corridors.map((c) => {
      const corridorTrips = onRoad.filter((t) => t.corridorId === c.id);
      const dots: CorridorDotDto[] = corridorTrips.map((t) => {
        const stop = c.stops.find((s) => s.place.id === t.lastPlaceId);
        const km = stop?.kmFromOrigin ?? 0;
        const late = this.isLate(t);
        const shared = new Set(t.loads.map((l) => l.shipment.shipperOrgId)).size > 1;
        return { x: Math.max(2, Math.min(98, Math.round((km / c.distanceKm) * 100))), kind: late ? 'late' : shared ? 'shared' : 'ok', tripId: t.id };
      });
      return { corridorId: c.id, name: c.name, detail: `${c.distanceKm} km${c.via ? ` · ${c.via}` : ''}`, trips: corridorTrips.length, dots };
    });

    return {
      stats,
      corridors: board.sort((a, b) => b.trips - a.trips),
      needsHuman,
      deliveryReview: review,
      loadFactor,
      generatedAt: new Date().toISOString(),
      counts: { verification: verificationCount[0]?.n ?? 0, support: issueCounts.support, disputes: issueCounts.disputes },
    };
  }

  async counts(): Promise<OpsOverviewDto['counts']> {
    const [v] = await this.trips.query(`SELECT count(*)::int AS n FROM verification_cases WHERE status IN ('pending','in_review')`);
    const i = await this.issueService.openCounts();
    return { verification: v.n, support: i.support, disputes: i.disputes };
  }

  isLate(t: Pick<Trip, 'status' | 'lastCheckinAt'>): boolean {
    return t.status === 'in_transit' && !!t.lastCheckinAt && Date.now() - t.lastCheckinAt.getTime() > LATE_CHECKIN_HOURS * 3_600_000;
  }

  private async stats(): Promise<OpsOverviewDto['stats']> {
    const [row] = await this.trips.query(
      `SELECT
         (SELECT count(*) FROM trips WHERE status = 'in_transit')::int AS trips_on_road,
         (SELECT count(*) FROM shipments WHERE status = 'requested')::int AS open_loads,
         (SELECT count(DISTINCT vehicle_id) FROM capacity_posts WHERE status = 'open' AND departs_at > now() - interval '3 hours')::int AS trucks_with_space,
         (SELECT count(*) FROM matches WHERE status = 'confirmed' AND responded_at >= date_trunc('day', now() AT TIME ZONE '${EAT}') AT TIME ZONE '${EAT}')::int AS matches_today,
         (SELECT count(*) FROM trips WHERE status = 'in_transit'
            AND last_checkin_at < now() - interval '${LATE_CHECKIN_HOURS} hours')::int AS late_checkins,
         (SELECT count(*) FROM (
            SELECT t.id FROM trips t JOIN trip_loads tl ON tl.trip_id = t.id JOIN shipments s ON s.id = tl.shipment_id
             WHERE t.status = 'in_transit' GROUP BY t.id HAVING count(DISTINCT s.shipper_org_id) > 1) shared)::int AS shared_trips`,
    );
    const onRoad = row.trips_on_road as number;
    return {
      tripsOnRoad: onRoad,
      openLoads: row.open_loads,
      trucksWithSpace: row.trucks_with_space,
      matchesToday: row.matches_today,
      sharedLoadSharePct: onRoad ? Math.round((row.shared_trips / onRoad) * 100) : 0,
      lateCheckins: row.late_checkins,
    };
  }

  /** Everything a person at Raha should look at, most urgent first: disputes, late trucks, loads nobody can carry, support. */
  private async needsHuman(): Promise<NeedsHumanDto[]> {
    const out: NeedsHumanDto[] = [];

    const issues = await this.issues.find({ where: { status: In(['open', 'in_progress']) }, order: { priority: 'ASC', createdAt: 'DESC' }, take: 12 });
    for (const i of issues) {
      const kind = i.kind === 'late' ? 'LATE' : (i.kind.toUpperCase() as NeedsHumanDto['kind']);
      out.push({
        key: `issue:${i.id}`,
        kind,
        title: i.title,
        body: i.body ?? '',
        action: i.actionHint ?? (i.kind === 'dispute' ? 'Open case' : 'Reply'),
        primary: i.kind === 'dispute' || i.priority === 1,
        href: `/support/${i.id}`,
        createdAt: i.createdAt.toISOString(),
      });
    }

    const late = await this.trips.find({ where: { status: 'in_transit' }, relations: TRIP_RELATIONS });
    for (const t of late.filter((x) => this.isLate(x))) {
      const hours = Math.floor((Date.now() - t.lastCheckinAt!.getTime()) / 3_600_000);
      const place = t.lastPlaceId ? (await this.reference.place(t.lastPlaceId)).name : 'the start';
      out.push({
        key: `late:${t.id}`,
        kind: 'LATE',
        title: `No check-in for ${hours} h on ${t.origin.name} → ${t.destination.name}`,
        body: `${t.driver.fullName} · ${t.vehicle.plate} · last at ${place}.`,
        action: 'Call driver',
        primary: false,
        href: `/trips/${t.id}`,
        createdAt: t.lastCheckinAt!.toISOString(),
      });
    }

    // loads nobody has taken after a few hours
    const stale = await this.shipments.find({ where: { status: 'requested' }, relations: { shipperOrg: true, pickupPlace: true, dropoffPlace: true }, order: { createdAt: 'ASC' }, take: 30 });
    for (const s of stale.filter((x) => Date.now() - x.createdAt.getTime() > 3 * 3_600_000).slice(0, 5)) {
      const n = (await this.matching.rankForShipment(s.id)).length;
      if (n > 0) continue;
      const wider = (await this.matching.rankForShipment(s.id, { detourKm: 40 })).length;
      const cargo = CARGO_TYPES.find((c) => c.key === s.cargoType)?.label.split(',')[0]?.toLowerCase() ?? 'cargo';
      out.push({
        key: `match:${s.id}`,
        kind: 'MATCH',
        title: `${s.weightKg >= 1000 ? formatTonnes(s.weightKg, 0) : formatKg(s.weightKg)} ${cargo} ${s.pickupPlace.name} → ${s.dropoffPlace.name} has no fit`,
        body: `${s.shipperOrg.name} · ${formatAge(s.createdAt)} open.${wider ? ` ${wider} truck${wider > 1 ? 's' : ''} could fit with a wider detour.` : ''}`,
        action: 'Assist match',
        primary: false,
        href: `/matching/${s.id}`,
        createdAt: s.createdAt.toISOString(),
      });
    }

    const weight = { DISPUTE: 0, SAFETY: 0, LATE: 1, MATCH: 2, DOCUMENT: 3, SUPPORT: 3 } as const;
    return out.sort((a, b) => weight[a.kind] - weight[b.kind] || b.createdAt.localeCompare(a.createdAt)).slice(0, 10);
  }

  private async deliveryReview(): Promise<OpsOverviewDto['deliveryReview']> {
    const open = (await this.deliveries.find({ where: { reviewedAt: IsNull() }, order: { createdAt: 'DESC' }, take: 100 })).filter((d) => d.reviewFlag).slice(0, 6);
    const shipments = open.length ? await this.shipments.find({ where: { id: In(open.map((d) => d.shipmentId)) } }) : [];
    const sMap = new Map(shipments.map((s) => [s.id, s]));
    const photos: Array<{ shipment_id: string; file_key: string }> = open.length
      ? await this.deliveries.query(`SELECT DISTINCT ON (shipment_id) shipment_id, file_key FROM proofs WHERE kind = 'delivery_photo' AND shipment_id = ANY($1::uuid[]) ORDER BY shipment_id, taken_at DESC`, [open.map((d) => d.shipmentId)])
      : [];
    const photoBy = new Map(photos.map((p) => [p.shipment_id, p.file_key]));

    const items: DeliveryReviewDto[] = open.map((d) => {
      const s = sMap.get(d.shipmentId);
      const caption =
        d.reviewFlag === 'photo_blurry' ? 'PIN ✓ · photo blurry'
        : d.reviewFlag === 'no_pin' ? 'Manual confirm · no PIN'
        : d.reviewFlag === 'no_photo' ? 'PIN ✓ · no photo'
        : d.reviewFlag === 'damaged' ? 'Reported damaged'
        : `Short count: ${d.receivedCount ?? '?'}/${d.expectedCount ?? s?.pieces ?? '?'} ${CARGO_TYPES.find((c) => c.key === s?.cargoType)?.unit ?? 'pieces'}`;
      const file = photoBy.get(d.shipmentId);
      return { shipmentId: d.shipmentId, ref: s?.ref ?? '', caption, tone: d.reviewFlag === 'photo_blurry' || d.reviewFlag === 'no_photo' ? 'ok' : 'warn', photoUrl: file ? this.storage.signUrl(file) : null };
    });

    const [today] = await this.deliveries.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE review_flag IS NOT NULL)::int AS flagged
         FROM deliveries WHERE delivered_at >= date_trunc('day', now() AT TIME ZONE '${EAT}') AT TIME ZONE '${EAT}'`,
    );
    return { items, flaggedToday: today.flagged, deliveriesToday: today.total };
  }

  /** Average truck fill (own contracts + Raha matches) per week across all published journeys. */
  private async loadFactor(): Promise<OpsOverviewDto['loadFactor']> {
    const rows: Array<{ wk: Date; pct: number }> = await this.trips.query(
      `SELECT date_trunc('week', departs_at AT TIME ZONE '${EAT}') AS wk,
              100.0 * SUM(committed_kg + matched_kg) / NULLIF(SUM(total_capacity_kg), 0) AS pct
         FROM capacity_posts
        WHERE status IN ('departed','expired') AND departs_at >= now() - interval '8 weeks'
        GROUP BY 1 ORDER BY 1`,
    );
    const series = rows.map((r, i) => ({ label: i === rows.length - 1 ? 'This week' : `Wk -${rows.length - 1 - i}`, pct: Math.round(Number(r.pct ?? 0)) }));
    return { series, currentPct: series[series.length - 1]?.pct ?? 0 };
  }
}
