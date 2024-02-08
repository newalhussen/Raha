import Link from 'next/link';
import type { ShipmentDetailDto, TruckOptionDto } from '@raha/contracts';
import { AssignCard } from '@/components/AssignCard';
import { api } from '@/lib/raha';
import { formatKg } from '@/lib/format';

export default async function AssistMatch({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ km?: string }> }) {
  const { id } = await params;
  const { km } = await searchParams;
  const detour = Math.min(Number(km) || 40, 80);
  const [s, c] = await Promise.all([api<ShipmentDetailDto>(`/ops/shipments/${id}`, { org: null }), api<TruckOptionDto[]>(`/ops/matching/${id}/candidates?detourKm=${detour}`, { org: null })]);
  return (
    <main className="page-fluid">
      <div className="col gap-6">
        <Link href="/matching" className="small muted">← Matching</Link>
        <span className="mono muted">{s.ref} · {s.shipperName}</span>
        <h1 className="h1">{s.pickup.name} → {s.dropoff.name} · {formatKg(s.weightKg)}</h1>
        <div className="small muted">{s.pickupAddress} → {s.dropoffAddress}</div>
      </div>
      <div className="row between wrap gap-12">
        <span className="kicker">{c.length} TRUCKS WITHIN {detour} KM OF THE ROUTE</span>
        <div className="seg">{[15, 40, 80].map((d) => <Link key={d} href={`/matching/${id}?km=${d}`} className={d === detour ? 'on' : ''}>{d} km</Link>)}</div>
      </div>
      {c.length === 0 ? <div className="notice">Nothing fits even with a wider detour. Call drivers who are back on this route, or ask the shipper to move the pickup time.</div> : null}
      <div className="col gap-12" style={{ maxWidth: 820 }}>{c.map((o) => <AssignCard key={o.capacityPostId} shipmentId={id} option={o} />)}</div>
    </main>
  );
}
