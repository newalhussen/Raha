import type { Metadata } from 'next';
import { DataTable, PageHeader, Pill, type Column } from '@raha/ui';
import type { FleetTripRowDto } from '@raha/contracts';
import { AutoRefresh } from '@/components/AutoRefresh';
import { apiAsOrg } from '@/lib/raha';
import { formatKg } from '@/lib/format';

export const metadata: Metadata = { title: 'Trips' };

const columns: Column<FleetTripRowDto>[] = [
  { key: 'ref', header: 'Trip', width: '1.4fr', render: (t) => <div><div className="bold">{t.route}</div><div className="mono xs muted">{t.ref}</div></div> },
  { key: 'who', header: 'Driver · truck', width: '1.2fr', render: (t) => <div>{t.driverName}<div className="mono xs muted">{t.plate}</div></div> },
  { key: 'loads', header: 'Loads', width: '120px', render: (t) => <span className="small">{t.loads} · {formatKg(t.weightKg)}</span> },
  { key: 'prog', header: 'Progress', width: '1fr', render: (t) => <div className="col gap-4"><div className="progress"><i style={{ width: `${t.progressPct}%` }} /></div><span className="xs muted mono">{t.lastLabel}</span></div> },
  { key: 'st', header: 'Status', width: '130px', render: (t) => (t.late ? <Pill tone="red" glyph="diamond">Late check-in</Pill> : <Pill tone={t.status === 'in_transit' ? 'lapis' : 'amber'}>{t.status === 'in_transit' ? 'In transit' : t.status === 'loading' ? 'Loading' : 'Planned'}</Pill>) },
];

export default async function Trips() {
  const rows = await apiAsOrg<FleetTripRowDto[]>('/fleet/trips');
  return (
    <main className="page-fluid">
      <AutoRefresh seconds={30} />
      <PageHeader kicker="ON THE ROAD AND ABOUT TO LEAVE" title="Trips" />
      <DataTable columns={columns} rows={rows} rowKey={(t) => t.tripId} minWidth={860} empty="No trips right now." />
    </main>
  );
}
