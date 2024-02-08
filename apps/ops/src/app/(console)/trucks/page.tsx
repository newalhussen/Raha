import { DataTable, PageHeader, StatusPill, TabLinks, type Column } from '@raha/ui';
import { VEHICLE_STATUS_META, VERIFICATION_STATUS_META, type Paged, type VehicleDto } from '@raha/contracts';
import { api } from '@/lib/raha';
import { formatKg } from '@/lib/format';

const columns: Column<VehicleDto>[] = [
  { key: 'p', header: 'Truck', width: '1.2fr', render: (v) => <div><div className="mono-strong">{v.plate}</div><div className="xs muted">{v.label}</div></div> },
  { key: 'o', header: 'Owner', width: '1.2fr', render: (v) => v.ownerName },
  { key: 'd', header: 'Driver', width: '1fr', render: (v) => v.driver?.name ?? <span className="muted">—</span> },
  { key: 'c', header: 'Max load', width: '110px', render: (v) => <span className="mono">{formatKg(v.maxLoadKg)}</span> },
  { key: 'v', header: 'Verification', width: '130px', render: (v) => <StatusPill meta={VERIFICATION_STATUS_META[v.verification]} /> },
  { key: 's', header: 'Status', width: '110px', render: (v) => <StatusPill meta={VEHICLE_STATUS_META[v.status]} /> },
];

export default async function Trucks({ searchParams }: { searchParams: Promise<{ verification?: string; q?: string }> }) {
  const { verification, q } = await searchParams;
  const r = await api<Paged<VehicleDto>>(`/ops/vehicles?pageSize=100${verification ? `&verification=${verification}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`, { org: null });
  return (
    <main className="page-fluid">
      <PageHeader kicker={`${r.total} TRUCKS`} title="Trucks" aside={<><form className="row gap-8"><input className="input" name="q" defaultValue={q ?? ''} placeholder="Plate, owner, driver" style={{ width: 220, height: 38 }} /></form><TabLinks items={[['', 'All'], ['pending', 'In review'], ['verified', 'Verified']].map(([k, l]) => ({ href: `/trucks${k ? `?verification=${k}` : ''}`, label: l, on: (verification ?? '') === k }))} /></>} />
      <DataTable columns={columns} rows={r.items} rowKey={(v) => v.id} minWidth={900} empty="No trucks." />
    </main>
  );
}
