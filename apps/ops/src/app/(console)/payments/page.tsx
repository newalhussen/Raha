import { redirect } from 'next/navigation';
import { DataTable, PageHeader, StatusPill, TabLinks, type Column } from '@raha/ui';
import { PAYMENT_STATUS_META, formatEtb, type PaymentDto } from '@raha/contracts';
import { PayAction } from '@/components/PayAction';
import { api, requireSession } from '@/lib/raha';
import { formatWhen } from '@/lib/format';

const columns: Column<PaymentDto>[] = [
  { key: 'r', header: 'Shipment', width: '1.4fr', render: (p) => <div><span className="mono small">{p.shipmentRef}</span><div className="xs muted">{p.route}</div></div> },
  { key: 'f', header: 'From → to', width: '1.4fr', render: (p) => <span className="small">{p.payerName} → {p.payeeName}</span> },
  { key: 'a', header: 'Amount', width: '120px', render: (p) => <span className="mono-strong">{formatEtb(p.amountEtb)}</span> },
  { key: 'd', header: 'Due / paid', width: '130px', render: (p) => <span className="small">{formatWhen(p.paidAt ?? p.dueAt ?? p.createdAt)}</span> },
  { key: 'm', header: 'Method', width: '100px', render: (p) => <span className="small">{p.method ?? '—'}</span> },
  { key: 's', header: 'Status', width: '110px', render: (p) => <StatusPill meta={PAYMENT_STATUS_META[p.status as keyof typeof PAYMENT_STATUS_META]} /> },
  { key: 'x', header: '', width: '110px', align: 'right', render: (p) => (p.status === 'pending' ? <PayAction id={p.id} /> : null) },
];

export default async function Payments({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const s = await requireSession();
  if (!s.staffPermissions.includes('ops:finance')) redirect('/');
  const { status = 'pending' } = await searchParams;
  const rows = await api<PaymentDto[]>(`/ops/payments?status=${status}`, { org: null });
  return (
    <main className="page-fluid">
      <PageHeader kicker="RECORDS, NOT A WALLET" title="Payments" aside={<TabLinks items={[['pending', 'Open'], ['paid', 'Paid'], ['all', 'All']].map(([k, l]) => ({ href: `/payments?status=${k}`, label: l, on: k === status }))} />} />
      <DataTable columns={columns} rows={rows} rowKey={(p) => p.id} minWidth={900} empty="No payments." />
    </main>
  );
}
