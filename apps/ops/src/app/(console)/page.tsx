import Link from 'next/link';
import { Photo, Stats, Tag } from '@raha/ui';
import type { NeedsHumanDto, OpsOverviewDto } from '@raha/contracts';
import { AutoRefresh } from '@/components/AutoRefresh';
import { api } from '@/lib/raha';

const TONE: Record<NeedsHumanDto['kind'], 'red' | 'amber' | 'neutral'> = { DISPUTE: 'red', LATE: 'red', SAFETY: 'red', MATCH: 'amber', DOCUMENT: 'neutral', SUPPORT: 'neutral' };

export default async function ControlRoom() {
  const o = await api<OpsOverviewDto>('/ops/overview', { org: null });
  const s = o.stats;
  return (
    <main className="page-fluid">
      <AutoRefresh seconds={20} />
      <Stats
        items={[
          { label: 'Trips on the road', value: s.tripsOnRoad },
          { label: 'Open loads', value: s.openLoads },
          { label: 'Trucks with space', value: s.trucksWithSpace },
          { label: 'Matches today', value: s.matchesToday, tone: 'amber' },
          { label: 'Shared-load share', value: `${s.sharedLoadSharePct}%` },
          { label: 'Late check-ins', value: s.lateCheckins, tone: s.lateCheckins ? 'red' : undefined },
        ]}
      />

      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 620px), 1fr))' }}>
        <section className="panel">
          <div className="panel-head">
            <span className="kicker">CORRIDOR BOARD · TRIPS BY LAST CHECK-IN</span>
            <div className="row gap-12 xs muted">
              <span className="row gap-4"><i style={{ width: 8, height: 8, background: 'var(--bone)' }} />on time</span>
              <span className="row gap-4"><i style={{ width: 8, height: 8, background: 'var(--amber)', borderRadius: '50%' }} />shared load</span>
              <span className="row gap-4"><i style={{ width: 8, height: 8, background: 'var(--ops-orange)', transform: 'rotate(45deg)' }} />late</span>
            </div>
          </div>
          <div style={{ padding: '4px 18px 14px' }}>
            {o.corridors.map((c) => (
              <div key={c.corridorId} style={{ display: 'grid', gridTemplateColumns: '150px minmax(0,1fr) 70px', gap: 16, alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--surface-alt)' }}>
                <div><div className="semi small">{c.name}</div><div className="mono xs muted">{c.detail}</div></div>
                <div style={{ position: 'relative', height: 26 }}>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 2, background: 'var(--border-strong)' }} />
                  <span style={{ position: 'absolute', left: 0, top: 7, width: 12, height: 12, background: 'var(--stone)' }} />
                  <span style={{ position: 'absolute', right: 0, top: 7, width: 12, height: 12, border: '2px solid var(--stone)', boxSizing: 'border-box' }} />
                  {c.dots.map((d) => (
                    <Link key={d.tripId} href={`/trips/${d.tripId}`} aria-label="Open trip" style={{ position: 'absolute', left: `${d.x}%`, top: 8, width: 10, height: 10, background: d.kind === 'late' ? 'var(--ops-orange)' : d.kind === 'shared' ? 'var(--amber)' : 'var(--bone)', borderRadius: d.kind === 'shared' ? '50%' : 0, transform: d.kind === 'late' ? 'rotate(45deg)' : undefined }} />
                  ))}
                </div>
                <span className="mono small right">{c.trips} trips</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><span className="kicker">NEEDS A HUMAN</span><span className="xs muted">Sorted by urgency</span></div>
          {o.needsHuman.length === 0 ? <p className="p-20 small muted">Nothing needs attention.</p> : null}
          {o.needsHuman.map((n) => (
            <div key={n.key} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', gap: 14, padding: '14px 18px', borderBottom: '1px solid var(--surface-alt)', alignItems: 'start' }}>
              <Tag tone={TONE[n.kind]}>{n.kind}</Tag>
              <div><div className="semi small">{n.title}</div><div className="xs muted" style={{ marginTop: 3, lineHeight: 1.45 }}>{n.body}</div></div>
              <Link href={n.href} className={`btn btn-xs ${n.primary ? 'btn-amber' : 'btn-outline'}`} style={n.primary ? undefined : { color: 'var(--amber)', borderColor: 'var(--amber)' }}>{n.action}</Link>
            </div>
          ))}
        </section>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
        <section className="panel">
          <div className="panel-head"><span className="kicker">DELIVERY CONFIRMATIONS · REVIEW</span><span className="xs muted">Flagged {o.deliveryReview.flaggedToday} of {o.deliveryReview.deliveriesToday} today</span></div>
          <div style={{ padding: '16px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
            {o.deliveryReview.items.length === 0 ? <span className="small muted">All deliveries reviewed.</span> : null}
            {o.deliveryReview.items.map((d) => (
              <Link key={d.shipmentId} href={`/shipments/${d.shipmentId}`} className="col gap-6" style={{ textDecoration: 'none' }}>
                <Photo src={d.photoUrl} tag={d.ref.replace('RH-26-', 'RH-')} />
                <span className="xs" style={{ color: d.tone === 'warn' ? 'var(--ops-orange)' : 'var(--text-muted)' }}>{d.caption}</span>
              </Link>
            ))}
          </div>
        </section>
        <section className="panel panel-pad">
          <div className="row between"><span className="kicker">NETWORK · LAST 8 WEEKS</span><span className="xs muted">Avg truck load factor</span></div>
          <div className="row gap-6" style={{ alignItems: 'flex-end', height: 110 }}>
            {o.loadFactor.series.map((w, i) => (
              <span key={i} title={`${w.label}: ${w.pct}%`} style={{ flex: 1, height: `${Math.max(4, w.pct)}%`, background: i === o.loadFactor.series.length - 1 ? 'var(--amber)' : 'var(--graphite-3)' }} />
            ))}
          </div>
          <div className="row between mono xs muted"><span>{o.loadFactor.series[0]?.pct ?? 0}%</span><span style={{ color: 'var(--amber)' }}>{o.loadFactor.currentPct}% this week</span></div>
        </section>
      </div>
    </main>
  );
}
