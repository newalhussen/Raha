import type { Metadata } from 'next';
import { DataTable, PageHeader, Pill, type Column } from '@raha/ui';
import type { BrokerTripRowDto } from '@raha/contracts';
import { AutoRefresh } from '@/components/AutoRefresh';
import { apiAsOrg } from '@/lib/raha';

export const metadata: Metadata = { title: 'Active trips' };

const columns: Column<BrokerTripRowDto>[] = [
  { key: 'route', header: 'Route', width: '1.5fr', render: (t) => <span className="bold">{t.route}</span> },
  { key: 'who', header: 'Driver · truck', width: '1.2fr', render: (t) => t.who },
  { key: 'state', header: 'State', width: '150px', render: (t) => <Pill tone={t.tone} glyph={t.tone === 'red' ? 'diamond' : 'dot'}>{t.stateLabel}</Pill> },
  { key: 'progress', header: 'Progress', width: '1fr', render: (t) => <div className="progress"><i style={{ width: `${t.progressPct}%` }} /></div> },
  { key: 'last', header: 'Last check-in', width: '160px', render: (t) => <span className="mono small">{t.lastLabel}</span> },
];

export default async function Trips() {
  const rows = await apiAsOrg<BrokerTripRowDto[]>('/broker/trips');
  return (
    <main className="page-fluid">
      <AutoRefresh seconds={30} />
      <PageHeader kicker="YOUR LOADS AND TRUCKS" title="Active trips" />
      <DataTable columns={columns} rows={rows} rowKey={(t) => t.tripId} minWidth={820} empty="No trips on the road." />
    </main>
  );
}
