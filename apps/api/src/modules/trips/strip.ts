import { formatTime, type CheckinChannel, type CorridorStripDto, type StripStopDto, type TripStatus } from '@raha/contracts';
import { AVG_SPEED_KMH } from '../capacity/capacity.service';

export interface StripInput {
  corridorName: string | null;
  direction: 'forward' | 'reverse' | null;
  routeKm: number;
  /** Stops in travel order with road km from the origin. */
  stops: Array<{ place: { id: string; code: string; name: string; nameAm: string | null }; km: number }>;
  checkins: Array<{ placeId: string; at: Date; channel: CheckinChannel; pendingSync?: boolean }>;
  status: TripStatus;
  departedAt: Date | null;
  plannedDepartureAt: Date | null;
  completedAt: Date | null;
  etaAt: Date | null;
}

/**
 * Milestone progress, not GPS: a stop is "done" once the driver checked in there (app tap or SMS reply);
 * the latest check-in is "current"; everything after it is "upcoming". Squares are endpoints, circles are towns.
 */
export function buildStrip(input: StripInput): CorridorStripDto {
  const { stops } = input;
  const lastIdx = stops.length - 1;
  const checkinByPlace = new Map<string, StripInput['checkins'][number]>();
  for (const c of [...input.checkins].sort((a, b) => a.at.getTime() - b.at.getTime())) checkinByPlace.set(c.placeId, c);

  // furthest stop that has a check-in (origin counts as reached once the truck departed)
  let reached = -1;
  stops.forEach((s, i) => {
    if (checkinByPlace.has(s.place.id) || (i === 0 && input.departedAt) || (i === lastIdx && input.completedAt)) reached = Math.max(reached, i);
  });
  const finished = input.status === 'completed';

  const out: StripStopDto[] = stops.map((s, i) => {
    const kind: StripStopDto['kind'] = i === 0 ? 'origin' : i === lastIdx ? 'destination' : 'town';
    const ci = checkinByPlace.get(s.place.id);
    const base = { placeId: s.place.id, code: s.place.code, name: s.place.name, nameAm: s.place.nameAm, kind, channel: ci?.channel ?? null };

    if (i === 0 && input.departedAt) {
      const label = `Picked up ${formatTime(input.departedAt)}`;
      return { ...base, state: reached === 0 && !finished && input.status === 'in_transit' && lastIdx > 0 ? 'current' : 'done', at: input.departedAt.toISOString(), label };
    }
    if (i === lastIdx) {
      if (finished && input.completedAt) return { ...base, state: 'done', at: input.completedAt.toISOString(), label: `Arrived ${formatTime(input.completedAt)}` };
      if (ci) return { ...base, state: 'current', at: ci.at.toISOString(), label: `Arrived ${formatTime(ci.at)}` };
      const eta = input.etaAt;
      return { ...base, state: 'upcoming', at: null, label: eta ? `ETA ${formatTime(eta)}` : null };
    }
    if (ci) {
      const isCurrent = i === reached && !finished;
      return {
        ...base,
        state: isCurrent ? 'current' : 'done',
        at: ci.at.toISOString(),
        label: isCurrent ? `Driver check-in ${formatTime(ci.at)}` : formatTime(ci.at),
        pendingSync: ci.pendingSync,
      };
    }
    // A town the truck has clearly passed (a later stop was reached) but nobody checked in at.
    return { ...base, state: i < reached ? 'done' : 'upcoming', at: null, label: null };
  });

  const reachedKm = reached >= 0 ? stops[reached]!.km : 0;
  const progressPct = finished ? 100 : input.routeKm > 0 ? Math.max(0, Math.min(99, Math.round((reachedKm / input.routeKm) * 100))) : 0;

  return {
    corridorName: input.corridorName ?? `${stops[0]?.place.name ?? ''} → ${stops[lastIdx]?.place.name ?? ''}`,
    direction: input.direction === 'reverse' ? 'reverse' : 'forward',
    stops: out,
    etaAt: input.etaAt ? input.etaAt.toISOString() : null,
    progressPct,
  };
}

/** Remaining driving time from the last known milestone, else the planned schedule. */
export function estimateEta(args: {
  routeKm: number;
  stops: Array<{ place: { id: string }; km: number }>;
  lastPlaceId: string | null;
  lastCheckinAt: Date | null;
  departedAt: Date | null;
  plannedDepartureAt: Date | null;
}): Date | null {
  const hoursFor = (km: number) => (km / AVG_SPEED_KMH) * 3_600_000;
  if (args.lastPlaceId && args.lastCheckinAt) {
    const stop = args.stops.find((s) => s.place.id === args.lastPlaceId);
    if (stop) return new Date(args.lastCheckinAt.getTime() + hoursFor(Math.max(0, args.routeKm - stop.km)));
  }
  const start = args.departedAt ?? args.plannedDepartureAt;
  return start ? new Date(start.getTime() + hoursFor(args.routeKm)) : null;
}
