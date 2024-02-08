import type { CapacityBarDto, CorridorStripDto, StripStopDto } from '@raha/contracts';
import { formatTonnes } from '@raha/contracts';

/**
 * Capacity Bar — the brand idea in one component.
 * Ink = freight already aboard · Amber = Raha match · Hatched = open capacity.
 * Segments are flex-proportional to kilograms, so the same bar means the same thing everywhere.
 */
export function CapacityBar({ bar, height = 16, label }: { bar: CapacityBarDto; height?: number; label?: string }) {
  const total = Math.max(bar.totalKg, 1);
  const pct = (kg: number) => `${(kg / total) * 100}%`;
  const aboard = bar.inkKg + bar.amberKg;
  return (
    <div
      className="capbar"
      style={{ ['--h' as string]: `${height}px` }}
      role="img"
      aria-label={label ?? `${formatTonnes(aboard)} of ${formatTonnes(bar.totalKg)} used, ${formatTonnes(bar.freeKg)} free`}
    >
      {bar.inkKg > 0 ? <i className="ink" style={{ flex: `0 0 ${pct(bar.inkKg)}` }} /> : null}
      {bar.amberKg > 0 ? <i className="amber" style={{ flex: `0 0 ${pct(bar.amberKg)}` }} /> : null}
      {bar.freeKg > 0 ? <i className="free" style={{ flex: `1 1 ${pct(bar.freeKg)}` }} /> : null}
    </div>
  );
}

export function CapacityLegend({ ink = 'Committed load', amber = 'Raha match', free = 'Open capacity' }: { ink?: string; amber?: string; free?: string }) {
  return (
    <div className="legend">
      <span><i style={{ background: 'var(--capbar-ink)' }} />{ink}</span>
      <span><i style={{ background: 'var(--amber)' }} />{amber}</span>
      <span><i style={{ background: 'repeating-linear-gradient(135deg, var(--border-strong) 0 2px, transparent 2px 4px)' }} />{free}</span>
    </div>
  );
}

function stopClass(s: StripStopDto): string {
  const shape = s.kind === 'town' ? ' town' : '';
  if (s.state === 'current') return 'strip-node current';
  if (s.state === 'upcoming') return `strip-node todo${shape}`;
  return `strip-node${shape}`;
}

/**
 * Corridor Strip — milestone-based progress. Squares are endpoints, circles are towns on the corridor.
 * Position comes from driver check-ins (a tap or an SMS reply), never from continuous tracking.
 */
export function CorridorStrip({ strip, showNotes = true }: { strip: CorridorStripDto; showNotes?: boolean }) {
  const last = strip.stops.length - 1;
  return (
    <div className="strip-scroll">
      <div className="strip" role="list" aria-label={`Progress along ${strip.corridorName}`}>
        {strip.stops.map((s, i) => {
          const upcoming = s.state === 'upcoming';
          const nextUpcoming = strip.stops[i + 1]?.state === 'upcoming';
          return (
            <div key={s.placeId} className={`strip-stop${i === last ? ' last' : ''}`} role="listitem">
              <div className="strip-track">
                <span className={stopClass(s)} />
                {i < last ? <span className={`strip-line${nextUpcoming || upcoming ? ' todo' : ''}`} /> : null}
              </div>
              <span className={`strip-name${upcoming ? ' todo' : ''}`}>{s.code}</span>
              {showNotes ? (
                <span className={`strip-note${s.state === 'current' ? ' now' : ''}`}>
                  {s.name}
                  {s.label ? <><br />{s.label}{s.pendingSync ? ' · sending…' : ''}</> : null}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
