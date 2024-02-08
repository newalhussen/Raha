import Link from 'next/link';
import type { Metadata } from 'next';
import { Pill } from '@raha/ui';
import { formatAge, formatKg, type BoardTruckDto, type BrokerBoardDto } from '@raha/contracts';
import { AutoRefresh } from '@/components/AutoRefresh';
import { LogLoadButton } from '@/components/broker/LogLoad';
import { OfferButton } from '@/components/broker/OfferButton';
import { apiAsOrg } from '@/lib/raha';
import { route } from '@/lib/format';

export const metadata: Metadata = { title: 'Match board' };

export default async function MatchBoard({ searchParams }: { searchParams: Promise<{ load?: string }> }) {
  const { load } = await searchParams;
  const board = await apiAsOrg<BrokerBoardDto>('/broker/board');
  const sel = board.loads.find((l) => l.shipmentId === load) ?? board.loads[0];
  const trucks = sel ? await apiAsOrg<BoardTruckDto[]>(`/broker/loads/${sel.shipmentId}/trucks`) : [];

  return (
    <>
      <AutoRefresh seconds={30} />
      <header className="side-header">
        <div className="row gap-14 wrap" style={{ alignItems: 'baseline' }}>
          <h1 className="h1" style={{ fontSize: 24 }}>Match board</h1>
          <span className="small muted">{board.dateLabel} · {board.openLoads} open loads · {board.trucksWithSpace} trucks with space</span>
        </div>
        <LogLoadButton />
      </header>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', alignItems: 'stretch' }}>
        <section style={{ borderRight: '1px solid var(--border)' }}>
          <div className="panel-head"><span className="kicker">CARGO DEMAND · OPEN</span><span className="xs muted">Oldest first</span></div>
          {board.loads.length === 0 ? <p className="p-20 small muted">No open loads. Use “Log load from call” when a customer phones.</p> : null}
          {board.loads.map((l) => (
            <Link key={l.shipmentId} href={`/broker/match-board?load=${l.shipmentId}`} scroll={false} className="col gap-6" style={{ padding: '14px 18px', borderBottom: '1px solid var(--surface-alt)', borderLeft: `4px solid ${l.shipmentId === sel?.shipmentId ? 'var(--amber)' : 'transparent'}`, background: l.shipmentId === sel?.shipmentId ? 'var(--surface)' : 'transparent', textDecoration: 'none', color: 'inherit' }}>
              <div className="row between gap-8"><span className="bold">{route(l.pickup, l.dropoff)}</span><span className="mono-strong small">{formatKg(l.weightKg)}</span></div>
              <div className="row between gap-8 small soft"><span>{l.shipperName} · {l.cargoLabel.split(',')[0]}</span><span className="mono xs muted">{formatAge(new Date(Date.now() - l.ageMinutes * 60_000))}</span></div>
              <div className="row gap-6"><Pill tone={l.fitCount ? 'amber' : 'red'} glyph={null} mono>{l.fitsLabel}</Pill><Pill tone="neutral" glyph={null} mono>{l.source}</Pill></div>
            </Link>
          ))}
        </section>

        <section style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
          {sel ? (
            <>
              <div className="col gap-12" style={{ padding: 20, borderBottom: '1px solid var(--border)' }}>
                <div className="row between wrap gap-8"><span className="mono small muted">{sel.ref} · {sel.source}</span><Link href={`/broker/shipments/${sel.shipmentId}`} className="small">Open load →</Link></div>
                <div className="h1" style={{ fontSize: 26 }}>{route(sel.pickup, sel.dropoff)}</div>
                <div className="kv-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <div><div className="k">Weight</div><div className="mono-strong">{formatKg(sel.weightKg)}</div></div>
                  <div><div className="k">Cargo</div><div className="semi">{sel.cargoLabel.split(',')[0]}</div></div>
                  <div><div className="k">Shipper</div><div className="semi">{sel.shipperName}</div></div>
                </div>
              </div>
              <div className="panel-head"><span className="kicker">TRUCKS WITH SPACE ON THIS CORRIDOR</span><span className="xs muted">Ranked by fit</span></div>
              <div className="col gap-10" style={{ padding: '0 20px 20px' }}>
                {trucks.length === 0 ? <p className="small muted">No truck fits yet. Ask your network for space, or widen the pickup time.</p> : null}
                {trucks.map((t, i) => (
                  <OfferButton key={t.capacityPostId} shipmentId={sel.shipmentId} truck={t} best={i === 0} />
                ))}
              </div>
            </>
          ) : (
            <p className="p-24 muted">Select a load.</p>
          )}
        </section>

        <section className="col">
          <div className="panel-head"><span className="kicker">ACTIVE TRIPS · {board.trips.length}</span>{board.attentionCount ? <span className="xs semi text-red">{board.attentionCount} need attention</span> : null}</div>
          {board.trips.slice(0, 7).map((t) => (
            <div key={t.tripId} className="col gap-6" style={{ padding: '12px 18px', borderBottom: '1px solid var(--surface-alt)' }}>
              <div className="row between gap-8"><span className="bold small">{t.route}</span><span className="xs semi" style={{ color: t.tone === 'red' ? 'var(--red)' : t.tone === 'lapis' ? 'var(--lapis)' : 'var(--amber-ink)' }}>{t.stateLabel}</span></div>
              <div className="progress progress-thin"><i style={{ width: `${t.progressPct}%` }} /></div>
              <div className="row between xs muted"><span>{t.who}</span><span className="mono">{t.lastLabel}</span></div>
            </div>
          ))}
          <div className="mt-auto col gap-10" style={{ padding: '16px 18px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div className="row between"><span className="kicker">INBOX</span><Link href="/broker/inbox" className="xs">All →</Link></div>
            {board.inbox.length === 0 ? <span className="small muted">Nothing new.</span> : board.inbox.slice(0, 2).map((m) => (
              <div key={m.id} className="small" style={{ lineHeight: 1.45 }}><strong>{m.fromName ?? m.fromPhone}</strong> <span className="muted">via {m.channel} · {m.ageLabel}</span><br />{m.body}</div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
