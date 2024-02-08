import type { Metadata } from 'next';
import { DataTable, PageHeader, StatusPill, type Column } from '@raha/ui';
import { VEHICLE_STATUS_META, VERIFICATION_STATUS_META, type CapacityPostDto, type VehicleDto } from '@raha/contracts';
import { AddTruck, PublishSpace } from '@/components/fleet/FleetActions';
import { apiAsOrg } from '@/lib/raha';
import { formatKg, formatWhen } from '@/lib/format';

export const metadata: Metadata = { title: 'Trucks' };

export default async function Trucks() {
  const [trucks, posts] = await Promise.all([apiAsOrg<VehicleDto[]>('/fleet/trucks'), apiAsOrg<CapacityPostDto[]>('/capacity')]);
  const postBy = new Map(posts.map((p) => [p.vehicle.id, p]));
  const columns: Column<VehicleDto>[] = [
    { key: 'plate', header: 'Truck', width: '1.2fr', render: (t) => <div><div className="mono-strong">{t.plate}</div><div className="xs muted">{t.label}</div></div> },
    { key: 'driver', header: 'Driver', width: '1fr', render: (t) => t.driver?.name ?? <span className="muted">Unassigned</span> },
    { key: 'cap', header: 'Max load', width: '110px', render: (t) => <span className="mono">{formatKg(t.maxLoadKg)}</span> },
    { key: 'space', header: 'Published space', width: '1.5fr', render: (t) => { const p = postBy.get(t.id); return p ? <span className="small">{p.origin.name} → {p.destination.name} · {formatWhen(p.departsAt)} · <strong>{formatKg(p.freeKg)}</strong> free</span> : <span className="small muted">None</span>; } },
    { key: 'ver', header: 'Verification', width: '120px', render: (t) => <StatusPill meta={VERIFICATION_STATUS_META[t.verification]} /> },
    { key: 'st', header: 'Status', width: '110px', render: (t) => <StatusPill meta={VEHICLE_STATUS_META[t.status]} /> },
  ];
  return (
    <main className="page-fluid">
      <PageHeader kicker="YOUR FLEET" title="Trucks" aside={<><AddTruck /><PublishSpace trucks={trucks} /></>} />
      <DataTable columns={columns} rows={trucks} rowKey={(t) => t.id} minWidth={900} empty="Add your first truck." />
    </main>
  );
}
