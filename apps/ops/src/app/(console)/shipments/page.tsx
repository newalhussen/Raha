import { DataTable, PageHeader, StatusPill, TabLinks, type Column } from '@raha/ui';
import { ISSUE_FLAG_META, SHIPMENT_STATUS_META, type Paged, type ShipmentSummaryDto } from '@raha/contracts';
import { api } from '@/lib/raha';
import { formatKg, formatWhen } from '@/lib/format';

const columns: Column<ShipmentSummaryDto>[] = [
  { key: 'ref', header: 'ID', width: '130px', render: (s) => <span className="mono small">{s.ref}</span> },
  { key: 'route', header: 'Route', width: '1.5fr', render: (s) => <div><div className="bold">{s.pickup.name} → {s.dropoff.name}</div><div className="xs muted">{s.shipperName}{s.loggedByName ? ` · via ${s.loggedByName}` : ''}</div></div> },
  { key: 'cargo', header: 'Cargo', width: '1fr', render: (s) => `${s.cargoLabel.split(',')[0]} · ${formatKg(s.weightKg)}` },
  { key: 'carrier', header: 'Carrier', width: '1.1fr', render: (s) => s.carrier ? <div>{s.carrier.fleetName}<div className="mono xs muted">{s.carrier.plate}</div></div> : <span className="muted">—</span> },
  { key: 'src', header: 'Source', width: '90px', render: (s) => <span className="xs">{s.source}</span> },
  { key: 'when', header: 'Ready', width: '130px', render: (s) => <span className="small">{formatWhen(s.readyAt)}</span> },
  { key: 'st', header: 'Status', width: '130px', render: (s) => <StatusPill meta={s.hasOpenIssue ? ISSUE_FLAG_META : SHIPMENT_STATUS_META[s.status]} /> },
];

export default async function Shipments({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status = 'active', q } = await searchParams;
  const r = await api<Paged<ShipmentSummaryDto>>(`/ops/shipments?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}`, { org: null });
  const tabs: Array<[string, string]> = [['active', 'Active'], ['requested', 'Open'], ['in_transit', 'In transit'], ['delivered', 'Delivered'], ['all', 'All']];
  return (
    <main className="page-fluid">
      <PageHeader kicker={`${r.total} SHIPMENTS`} title="Shipments" aside={<><form className="row gap-8"><input type="hidden" name="status" value={status} /><input className="input" name="q" defaultValue={q ?? ''} placeholder="ID, company, town" style={{ width: 220, height: 38 }} /></form><TabLinks items={tabs.map(([k, l]) => ({ href: `/shipments?status=${k}`, label: l, on: k === status }))} /></>} />
      <DataTable columns={columns} rows={r.items} rowKey={(s) => s.id} href={(s) => `/shipments/${s.id}`} minWidth={960} empty="No shipments match." />
    </main>
  );
}
