import type { Metadata } from 'next';
import { CapacityBar, DataTable, PageHeader, StatusPill, type Column } from '@raha/ui';
import { VEHICLE_STATUS_META, type NetworkTruckDto } from '@raha/contracts';
import { AddNetworkTruck, RemoveTruck } from '@/components/broker/Network';
import { apiAsOrg } from '@/lib/raha';

export const metadata: Metadata = { title: 'Truck network' };

const columns: Column<NetworkTruckDto>[] = [
  { key: 'plate', header: 'Truck', width: '1.2fr', render: (t) => <div><div className="mono-strong">{t.plate}</div><div className="xs muted">{t.model}</div></div> },
  { key: 'driver', header: 'Driver · owner', width: '1.2fr', render: (t) => <div><div>{t.driverName ?? '—'}</div><div className="xs muted">{t.ownerName}</div></div> },
  { key: 'now', header: 'Now', width: '1.6fr', render: (t) => <span className="small">{t.nowLabel}</span> },
  { key: 'load', header: 'Load', width: '1fr', render: (t) => (t.bar ? <CapacityBar bar={t.bar} height={10} /> : <span className="xs muted">No space published</span>) },
  { key: 'status', header: 'Status', width: '110px', render: (t) => <StatusPill meta={VEHICLE_STATUS_META[t.status]} /> },
  { key: 'x', header: '', width: '80px', align: 'right', render: (t) => <RemoveTruck vehicleId={t.vehicleId} plate={t.plate} /> },
];

export default async function Network() {
  const rows = await apiAsOrg<NetworkTruckDto[]>('/broker/network');
  return (
    <main className="page-fluid">
      <PageHeader kicker="TRUCKS YOU WORK WITH" title="Truck network" aside={<AddNetworkTruck />} />
      <DataTable columns={columns} rows={rows} rowKey={(t) => t.vehicleId} minWidth={860} empty="Add the trucks you place loads on. Their free space shows on your match board." />
    </main>
  );
}
