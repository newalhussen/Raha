import type { Metadata } from 'next';
import { DataTable, PageHeader, Pill, type Column } from '@raha/ui';
import type { BrokerShipperDto } from '@raha/contracts';
import { apiAsOrg } from '@/lib/raha';
import { formatPhone, formatWhen } from '@/lib/format';

export const metadata: Metadata = { title: 'Shippers' };

const columns: Column<BrokerShipperDto>[] = [
  { key: 'name', header: 'Business', width: '1.6fr', render: (s) => <span className="bold">{s.name}</span> },
  { key: 'phone', header: 'Phone', width: '1fr', render: (s) => <span className="mono small">{s.phone ? formatPhone(s.phone) : '—'}</span> },
  { key: 'rel', header: 'Account', width: '140px', render: (s) => <Pill tone={s.managed ? 'amber' : 'neutral'} glyph={null}>{s.managed ? 'You manage it' : 'Customer'}</Pill> },
  { key: 'active', header: 'Active', width: '90px', render: (s) => <span className="mono">{s.active}</span> },
  { key: 'total', header: 'All loads', width: '90px', render: (s) => <span className="mono">{s.shipments}</span> },
  { key: 'last', header: 'Last load', width: '150px', render: (s) => <span className="small muted">{s.lastShipmentAt ? formatWhen(s.lastShipmentAt) : '—'}</span> },
];

export default async function Shippers() {
  const rows = await apiAsOrg<BrokerShipperDto[]>('/broker/shippers');
  return (
    <main className="page-fluid">
      <PageHeader kicker="YOUR CUSTOMERS" title="Shippers" />
      <DataTable columns={columns} rows={rows} rowKey={(s) => s.orgId} minWidth={800} empty="Businesses appear here when you log their first load." />
    </main>
  );
}
