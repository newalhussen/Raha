import Link from 'next/link';
import type { Metadata } from 'next';
import { CapacityBar, PageHeader, RahaMark, Stats, StatusPill } from '@raha/ui';
import { VEHICLE_STATUS_META, formatEtbCompact, formatTonnes, type FleetBoardDto, type VehicleDto } from '@raha/contracts';
import { AutoRefresh } from '@/components/AutoRefresh';
import { AddTruck, OfferAction, PublishSpace } from '@/components/fleet/FleetActions';
import { apiAsOrg } from '@/lib/raha';

export const metadata: Metadata = { title: 'Fleet board' };

export default async function FleetBoard() {
  const [b, trucks] = await Promise.all([apiAsOrg<FleetBoardDto>('/fleet/board'), apiAsOrg<VehicleDto[]>('/fleet/trucks')]);
  return (
    <main className="page-fluid">
      <AutoRefresh seconds={30} />
      <PageHeader kicker={`${b.dateLabel.toUpperCase()} · ${b.counts.trucks} TRUCKS · ${b.counts.drivers} DRIVERS`} title="Fleet board" aside={<><AddTruck /><PublishSpace trucks={trucks} /></>} />
      <Stats
        items={[
          { label: 'On a trip', value: b.counts.onTrip },
          { label: 'Available now', value: b.counts.available },
          { label: 'Off road', value: b.counts.offRoad },
          { label: 'Open space on the road', value: formatTonnes(b.openSpaceKg), tone: 'amber' },
          { label: `Recorded · ${b.monthLabel}`, value: formatEtbCompact(b.recordedMonthEtb) },
        ]}
      />
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 560px), 1fr))' }}>
        <section className="dt">
          <div className="dt-inner" style={{ ['--cols' as string]: '120px 1.1fr 1.3fr 1.4fr 110px', minWidth: 700 }}>
            <div className="dt-head"><span>Truck</span><span>Driver</span><span>Now</span><span>Load</span><span>Status</span></div>
            {b.trucks.map((t) => (
              <div className="dt-row" key={t.vehicleId} style={{ fontSize: 13 }}>
                <div><div className="mono-strong small">{t.plate}</div><div className="xs muted">{t.model}</div></div>
                <span>{t.driverName ?? '—'}</span>
                <span className="soft">{t.nowLabel}</span>
                <div className="col gap-4"><CapacityBar bar={t.bar} height={10} /><span className="xs muted">{t.capacityLabel}</span></div>
                <StatusPill meta={VEHICLE_STATUS_META[t.status]} />
              </div>
            ))}
          </div>
        </section>

        <div className="col gap-20">
          <section className="panel panel-dark panel-pad">
            <div className="row gap-10"><RahaMark size={22} /><span className="kicker" style={{ color: 'var(--amber)' }}>LOADS THAT FIT YOUR TRUCKS · {b.offers.length}</span></div>
            <div className="col" style={{ gap: 1, background: 'var(--graphite-3)' }}>
              {b.offers.length === 0 ? <div style={{ background: 'var(--graphite)', padding: 14 }} className="small muted">Publish space on a truck and matching loads appear here.</div> : null}
              {b.offers.map((o) => (
                <div key={o.key} className="row between gap-10" style={{ background: 'var(--graphite)', padding: 14 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="bold">{o.title} <span style={{ fontWeight: 400, color: 'var(--stone)' }}>{o.forLabel}</span></div>
                    <div className="xs" style={{ color: '#c9c4b8' }}>{o.subtitle}</div>
                  </div>
                  <OfferAction offer={o} />
                </div>
              ))}
            </div>
            <Link href="/fleet/offers" className="small" style={{ color: 'var(--amber)' }}>All load offers →</Link>
          </section>

          <section className="panel panel-pad">
            <div className="row between"><span className="kicker">LOADED vs EMPTY KM · {b.monthLabel.toUpperCase()}</span><span className="xs muted">Fleet {b.fleetLoadedPct}% loaded</span></div>
            {b.perf.length === 0 ? <span className="small muted">Appears after your first published trips.</span> : null}
            {b.perf.map((p) => (
              <div key={p.vehicleId} className="row gap-10 xs">
                <span className="mono" style={{ width: 84 }}>{p.plate}</span>
                <div className="capbar grow" style={{ ['--h' as string]: '12px' }}>
                  <i className="ink" style={{ flex: `0 0 ${p.loadedPct}%` }} />
                  <i className="amber" style={{ flex: `0 0 ${p.matchedPct}%` }} />
                  <i className="free" style={{ flex: `1 1 ${p.emptyPct}%` }} />
                </div>
                <span className="mono" style={{ width: 40, textAlign: 'right' }}>{p.totalPct}%</span>
              </div>
            ))}
            <div className="legend"><span><i style={{ background: 'var(--capbar-ink)' }} />Own contracts</span><span><i style={{ background: 'var(--amber)' }} />Raha matches</span><span><i style={{ background: 'var(--border-strong)' }} />Empty</span></div>
          </section>

          <section className="panel panel-pad">
            <div className="row between"><span className="kicker">DRIVERS</span>{b.expiringDocs ? <span className="xs semi text-red">{b.expiringDocs} document{b.expiringDocs > 1 ? 's' : ''} expiring</span> : null}</div>
            <div className="col small">
              {b.drivers.map((d) => (
                <div key={d.userId} className="row between" style={{ padding: '9px 0', borderBottom: '1px solid var(--surface-alt)' }}>
                  <span><strong>{d.fullName}</strong> <span className="muted">· {d.channel === 'app' ? 'app' : d.channel === 'telegram' ? 'Telegram only' : 'invited'}</span></span>
                  <span className={d.warn ? 'semi text-amber' : d.verification === 'verified' ? 'text-green' : 'muted'}>{d.note}</span>
                </div>
              ))}
            </div>
            <Link href="/fleet/drivers" className="small">All drivers →</Link>
          </section>
        </div>
      </div>
    </main>
  );
}
