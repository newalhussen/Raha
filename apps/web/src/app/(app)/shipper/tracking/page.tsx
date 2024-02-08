import Link from 'next/link';
import type { Metadata } from 'next';
import { Avatar, CorridorStrip, Empty, PageHeader, StatusPill } from '@raha/ui';
import { SHIPMENT_STATUS_META, type ShipmentDetailDto, type ShipmentListDto } from '@raha/contracts';
import { AutoRefresh } from '@/components/AutoRefresh';
import { apiAsOrg } from '@/lib/raha';
import { formatKg, formatWhen, route } from '@/lib/format';

export const metadata: Metadata = { title: 'Tracking' };

/** Every shipment on the road right now, each with its corridor strip. Refreshes itself. */
export default async function TrackingPage() {
  const list = await apiAsOrg<ShipmentListDto>('/shipments?tab=active&pageSize=40');
  const moving = list.items.filter((s) => s.status === 'in_transit');
  const details = await Promise.all(moving.map((s) => apiAsOrg<ShipmentDetailDto>(`/shipments/${s.id}`)));

  return (
    <main className="page">
      <AutoRefresh seconds={30} />
      <PageHeader kicker="LIVE · CHECK-INS, NOT GPS" title="Tracking" sub="Position updates when the driver checks in at a town (one tap or an SMS reply)." />
      {details.length === 0 ? (
        <div className="panel"><Empty title="Nothing on the road right now">When a truck departs with your cargo it appears here, with the towns it has passed.</Empty></div>
      ) : (
        <div className="col gap-16">
          {details.map((s) => (
            <Link key={s.id} href={`/shipper/shipments/${s.id}`} className="panel" style={{ padding: 22, textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div className="row between wrap gap-12">
                <div className="col gap-4">
                  <div className="row gap-10"><span className="mono small muted">{s.ref}</span><StatusPill meta={SHIPMENT_STATUS_META.in_transit} /></div>
                  <div className="h2">{route(s.pickup, s.dropoff)}</div>
                  <div className="small muted">{s.cargoLabel.split(',')[0]} · {formatKg(s.weightKg)}</div>
                </div>
                <div className="row gap-16">
                  {s.carrier ? <div className="row gap-10"><Avatar name={s.carrier.driverName} size={36} /><div><div className="semi small">{s.carrier.driverName}</div><div className="xs muted mono">{s.carrier.plate}</div></div></div> : null}
                  {s.etaAt ? <div className="right"><div className="xs muted">Arrives</div><div className="mono-strong">{formatWhen(s.etaAt)}</div></div> : null}
                </div>
              </div>
              {s.strip ? <CorridorStrip strip={s.strip} /> : null}
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
