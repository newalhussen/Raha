import { DataTable, PageHeader, Pill, StatusPill, TabLinks, type Column } from '@raha/ui';
import { VERIFICATION_STATUS_META, type OpsOrgRowDto, type Paged } from '@raha/contracts';
import { api } from '@/lib/raha';

const columns: Column<OpsOrgRowDto>[] = [
  { key: 'n', header: 'Organization', width: '1.6fr', render: (o) => <div><div className="bold">{o.name}</div><div className="xs muted">{o.city ?? '—'}{o.managedBy ? ` · managed by ${o.managedBy}` : ''}</div></div> },
  { key: 't', header: 'Type', width: '110px', render: (o) => <Pill tone="neutral" glyph={null} mono>{o.type.toUpperCase()}</Pill> },
  { key: 'tin', header: 'TIN', width: '120px', render: (o) => <span className="mono small">{o.tin ?? '—'}</span> },
  { key: 'm', header: 'People', width: '80px', render: (o) => <span className="mono">{o.members}</span> },
  { key: 'v', header: 'Trucks', width: '80px', render: (o) => <span className="mono">{o.vehicles}</span> },
  { key: 's', header: 'Shipments', width: '100px', render: (o) => <span className="mono">{o.shipments}</span> },
  { key: 'ver', header: 'Verification', width: '130px', render: (o) => <StatusPill meta={VERIFICATION_STATUS_META[o.verification]} /> },
];

export default async function Orgs({ searchParams }: { searchParams: Promise<{ type?: string; q?: string }> }) {
  const { type, q } = await searchParams;
  const r = await api<Paged<OpsOrgRowDto>>(`/ops/organizations?pageSize=100${type ? `&type=${type}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`, { org: null });
  return (
    <main className="page-fluid">
      <PageHeader kicker={`${r.total} ORGANIZATIONS`} title="Organizations" aside={<><form className="row gap-8"><input className="input" name="q" defaultValue={q ?? ''} placeholder="Name or TIN" style={{ width: 200, height: 38 }} /></form><TabLinks items={[['', 'All'], ['shipper', 'Shippers'], ['fleet', 'Fleets'], ['brokerage', 'Brokers']].map(([k, l]) => ({ href: `/organizations${k ? `?type=${k}` : ''}`, label: l, on: (type ?? '') === k }))} /></>} />
      <DataTable columns={columns} rows={r.items} rowKey={(o) => o.id} minWidth={940} empty="No organizations." />
    </main>
  );
}
