import { DataTable, PageHeader, Pill, TabLinks, type Column } from '@raha/ui';
import type { OpsTripRowDto } from '@raha/contracts';
import { AutoRefresh } from '@/components/AutoRefresh';
import { api } from '@/lib/raha';
import { formatKg, formatPhone } from '@/lib/format';

const columns: Column<OpsTripRowDto>[] = [
  { key: 'r', header: 'Trip', width: '1.4fr', render: (t) => <div><div className="bold">{t.route}</div><div className="mono xs muted">{t.ref} · {t.fleetName}</div></div> },
  { key: 'd', header: 'Driver · truck', width: '1.2fr', render: (t) => <div>{t.driverName}<div className="mono xs muted">{t.plate} · {formatPhone(t.driverPhone)}</div></div> },
  { key: 'l', header: 'Loads', width: '110px', render: (t) => <span className="small">{t.loads} · {formatKg(t.weightKg)}{t.shared ? ' · shared' : ''}</span> },
  { key: 'p', header: 'Progress', width: '1fr', render: (t) => <div className="col gap-4"><div className="progress"><i style={{ width: `${t.progressPct}%` }} /></div><span className="xs muted mono">{t.lastLabel}</span></div> },
  { key: 's', header: 'State', width: '150px', render: (t) => <Pill tone={t.tone} glyph={t.tone === 'red' ? 'diamond' : 'dot'}>{t.stateLabel}{t.lateHours ? ` · ${t.lateHours} h` : ''}</Pill> },
];

export default async function Trips({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = 'active' } = await searchParams;
  const rows = await api<OpsTripRowDto[]>(`/ops/trips?status=${status}`, { org: null });
  return (
    <main className="page-fluid">
      <AutoRefresh seconds={20} />
      <PageHeader kicker={`${rows.length} TRIPS`} title="Trips" aside={<TabLinks items={[['active', 'Active'], ['late', 'Late'], ['completed', 'Completed']].map(([k, l]) => ({ href: `/trips?status=${k}`, label: l, on: k === status }))} />} />
      <DataTable columns={columns} rows={rows} rowKey={(t) => t.tripId} href={(t) => `/trips/${t.tripId}`} minWidth={900} empty="No trips." />
    </main>
  );
}
