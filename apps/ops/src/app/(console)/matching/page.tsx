import { DataTable, PageHeader, Pill, type Column } from '@raha/ui';
import { formatAge, type OpsMatchRowDto } from '@raha/contracts';
import { AutoRefresh } from '@/components/AutoRefresh';
import { api } from '@/lib/raha';
import { formatKg, formatWhen } from '@/lib/format';

const columns: Column<OpsMatchRowDto>[] = [
  { key: 'ref', header: 'Load', width: '1.5fr', render: (r) => <div><div className="bold">{r.route}</div><div className="mono xs muted">{r.ref} · {r.shipperName}</div></div> },
  { key: 'kg', header: 'Weight', width: '100px', render: (r) => <span className="mono">{formatKg(r.weightKg)}</span> },
  { key: 'age', header: 'Open', width: '90px', render: (r) => <span className="mono small">{formatAge(new Date(Date.now() - r.ageMinutes * 60_000))}</span> },
  { key: 'ready', header: 'Ready', width: '130px', render: (r) => <span className="small">{formatWhen(r.readyAt)}</span> },
  { key: 'c', header: 'Trucks fit', width: '130px', render: (r) => <Pill tone={r.candidates ? 'amber' : 'red'} glyph={r.candidates ? 'dot' : 'diamond'}>{r.candidates ? `${r.candidates} fit` : 'No fit'}</Pill> },
  { key: 'p', header: 'Proposals', width: '100px', render: (r) => <span className="mono">{r.pendingProposals}</span> },
  { key: 'src', header: 'Source', width: '90px', render: (r) => <span className="xs">{r.source}</span> },
];

export default async function Matching() {
  const rows = await api<OpsMatchRowDto[]>('/ops/matching', { org: null });
  return (
    <main className="page-fluid">
      <AutoRefresh seconds={30} />
      <PageHeader kicker="OPEN LOADS · LEAST-SERVED FIRST" title="Matching" sub="Stretch a match by phone: open a load, see trucks within a wider detour, and assign." />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.shipmentId} href={(r) => `/matching/${r.shipmentId}`} minWidth={900} empty="No open loads." />
    </main>
  );
}
