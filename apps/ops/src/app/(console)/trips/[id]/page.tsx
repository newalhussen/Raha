import Link from 'next/link';
import { CorridorStrip, DataTable, Pill } from '@raha/ui';
import { formatPhone, formatWhen, type OpsTripDetailDto } from '@raha/contracts';
import { CheckinForm } from '@/components/CheckinForm';
import { api } from '@/lib/raha';
import { formatKg } from '@/lib/format';

export default async function TripOps({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await api<OpsTripDetailDto>(`/ops/trips/${id}`, { org: null });
  return (
    <main className="page-fluid">
      <div className="col gap-6">
        <Link href="/trips" className="small muted">← Trips</Link>
        <div className="row gap-10"><span className="mono muted">{t.ref}</span><Pill tone={t.tone} glyph={t.tone === 'red' ? 'diamond' : 'dot'}>{t.stateLabel}{t.lateHours ? ` · ${t.lateHours} h` : ''}</Pill></div>
        <h1 className="h1">{t.route}</h1>
        <div className="small muted">{t.driverName} · <a href={`tel:${t.driverPhone}`}>{formatPhone(t.driverPhone)}</a> · {t.plate} · {t.fleetName}</div>
      </div>
      <section className="panel p-24"><CorridorStrip strip={t.strip} /></section>
      <div className="grid-2">
        <section className="col gap-12">
          <span className="kicker">LOADS</span>
          <DataTable
            rows={t.loadRows}
            rowKey={(l) => l.shipmentId}
            href={(l) => `/shipments/${l.shipmentId}`}
            minWidth={560}
            columns={[
              { key: 'r', header: 'Shipment', width: '1.2fr', render: (l) => <div><span className="mono small">{l.ref}</span><div className="xs muted">{l.shipperName}{l.isRahaMatch ? '' : ' · own contract'}</div></div> },
              { key: 'w', header: 'Weight', width: '90px', render: (l) => <span className="mono">{formatKg(l.weightKg)}</span> },
              { key: 'to', header: 'Drop · receiver', width: '1.2fr', render: (l) => <div className="small">{l.dropoff}<div className="xs muted">{l.receiverName} · {formatPhone(l.receiverPhone)}</div></div> },
              { key: 's', header: 'Status', width: '100px', render: (l) => <span className="xs">{l.status.replace('_', ' ')}</span> },
            ]}
          />
        </section>
        <section className="panel panel-pad">
          <span className="kicker">CHECK-INS</span>
          {t.checkins.length === 0 ? <span className="small muted">None yet.</span> : null}
          {[...t.checkins].reverse().map((c, i) => <div key={i} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--surface-alt)' }}><span>{c.placeName}</span><span className="mono xs muted">{formatWhen(c.at)} · {c.channel}{c.offline ? ' · offline' : ''}</span></div>)}
          {t.status === 'in_transit' ? <CheckinForm tripId={t.tripId} places={t.places} /> : null}
        </section>
      </div>
    </main>
  );
}
