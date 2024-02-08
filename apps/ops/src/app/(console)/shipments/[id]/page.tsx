import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CorridorStrip, KeyValue, Photo, StatusPill } from '@raha/ui';
import { ISSUE_FLAG_META, MATCH_STATUS_META, SHIPMENT_STATUS_META, formatEtb, formatPhone, formatWhen, type ShipmentDetailDto } from '@raha/contracts';
import { ApiError } from '@raha/web-kit';
import { ShipmentOpsActions } from '@/components/ShipmentOpsActions';
import { api } from '@/lib/raha';
import { formatKg } from '@/lib/format';

export default async function ShipmentOps({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let s: ShipmentDetailDto;
  try {
    s = await api<ShipmentDetailDto>(`/ops/shipments/${id}`, { org: null });
  } catch (e) {
    if (e instanceof ApiError && [400, 404].includes(e.status)) notFound();
    throw e;
  }
  return (
    <main className="page-fluid">
      <div className="row between wrap gap-16" style={{ alignItems: 'flex-end' }}>
        <div className="col gap-6">
          <Link href="/shipments" className="small muted">← Shipments</Link>
          <div className="row gap-10"><span className="mono muted">{s.ref}</span><StatusPill meta={s.hasOpenIssue ? ISSUE_FLAG_META : SHIPMENT_STATUS_META[s.status]} /></div>
          <h1 className="h1">{s.pickup.name} → {s.dropoff.name}</h1>
          <div className="small muted">{s.shipperName}{s.loggedByName ? ` · logged by ${s.loggedByName}` : ''} · {s.cargoLabel} · {formatKg(s.weightKg)}</div>
        </div>
        <ShipmentOpsActions id={s.id} status={s.status} hasPin={['matched', 'in_transit'].includes(s.status)} flagged={s.delivery?.reviewFlag ?? null} />
      </div>
      {s.strip ? <section className="panel p-24"><CorridorStrip strip={s.strip} /></section> : null}
      <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
        <section className="panel panel-pad">
          <span className="kicker">SHIPMENT</span>
          <KeyValue rows={[['Pickup', s.pickupAddress], ['Deliver to', s.dropoffAddress], ['Receiver', `${s.receiver.name} · ${formatPhone(s.receiver.phone)}`], ['Ready', formatWhen(s.readyAt)], ['Price', s.priceEtb ? formatEtb(s.priceEtb) : '—'], ['Carrier', s.carrier ? `${s.carrier.driverName} · ${s.carrier.fleetName} · ${s.carrier.plate}` : '—'], ['Trip', s.tripRef ? <Link key="t" href={`/trips/${s.tripId}`}>{s.tripRef}</Link> : '—']]} />
          {s.delivery ? <div className="notice">Delivered {formatWhen(s.delivery.deliveredAt)} · {s.delivery.pinVerified ? 'PIN ✓' : s.delivery.confirmedBy}{s.delivery.reviewFlag ? ` · flag: ${s.delivery.reviewFlag}` : ''}{s.delivery.condition !== 'all_good' ? ` · ${s.delivery.condition}` : ''}</div> : null}
        </section>
        <section className="panel panel-pad">
          <span className="kicker">PROPOSALS</span>
          {s.matches.length === 0 ? <span className="small muted">None.</span> : s.matches.map((m) => (
            <div key={m.id} className="row between gap-8 small" style={{ padding: '8px 0', borderBottom: '1px solid var(--surface-alt)' }}>
              <span><strong className="mono">{m.plate}</strong> {m.fleetName} · {m.proposedBy}</span><span className="row gap-8"><span className="mono">{formatEtb(m.priceEtb)}</span><StatusPill meta={MATCH_STATUS_META[m.status]} /></span>
            </div>
          ))}
          {s.status === 'requested' ? <Link href={`/matching/${s.id}`} className="btn btn-amber btn-sm">Assist match →</Link> : null}
          <span className="kicker mt-8">PROOF</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>{s.proofs.map((p) => <Photo key={p.id} src={p.url} tag={p.label} />)}</div>
        </section>
        <section className="panel panel-pad">
          <span className="kicker">TIMELINE</span>
          <ol className="col gap-10" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {[...s.timeline].reverse().map((e, i) => <li key={i}><div className="small semi">{e.label}</div><div className="xs muted">{formatWhen(e.at)}{e.detail ? ` · ${e.detail}` : ''}</div></li>)}
          </ol>
        </section>
      </div>
    </main>
  );
}
