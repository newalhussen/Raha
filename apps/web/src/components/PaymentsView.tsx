import Link from 'next/link';
import { PAYMENT_STATUS_META, formatEtb, formatWhen, type PaymentDto } from '@raha/contracts';
import { DataTable, Stats, StatusPill, TabLinks, type Column } from '@raha/ui';
import { MarkPaid } from '@/components/shipment/Actions';

/**
 * Recorded payments (Raha records who owes whom; the money moves outside Raha).
 * `perspective` decides the wording: carriers "receive", shippers "pay".
 */
export function PaymentsView({ payments, status, basePath, canRecord, perspective, shipmentBase }: { payments: PaymentDto[]; status: string; basePath: string; canRecord: boolean; perspective: 'payer' | 'payee'; shipmentBase?: string }) {
  const pending = payments.filter((p) => p.status === 'pending');
  const paid = payments.filter((p) => p.status === 'paid');
  const sum = (xs: PaymentDto[]) => xs.reduce((n, p) => n + p.amountEtb, 0);
  const shown = status === 'pending' ? pending : status === 'paid' ? paid : payments;

  const columns: Column<PaymentDto>[] = [
    {
      key: 'ref',
      header: 'Shipment',
      width: '1.5fr',
      render: (p) => (
        <div>
          {shipmentBase ? <Link href={`${shipmentBase}/${p.shipmentId}`} className="mono small">{p.shipmentRef}</Link> : <span className="mono small">{p.shipmentRef}</span>}
          <div className="xs muted">{p.route}</div>
        </div>
      ),
    },
    { key: 'party', header: perspective === 'payee' ? 'Owed by' : 'Pay to', width: '1.2fr', render: (p) => <span>{perspective === 'payee' ? p.payerName : p.payeeName}</span> },
    { key: 'amount', header: 'Amount', width: '120px', render: (p) => <span className="mono-strong">{formatEtb(p.amountEtb)}</span> },
    { key: 'due', header: 'Due / paid', width: '140px', render: (p) => <span className="small">{p.status === 'paid' && p.paidAt ? `${formatWhen(p.paidAt)}` : p.dueAt ? `Due ${formatWhen(p.dueAt).replace(/ \d\d:\d\d$/, '')}` : '—'}</span> },
    { key: 'method', header: 'Method', width: '110px', render: (p) => <span className="small">{p.method ?? '—'}{p.reference ? <span className="xs muted mono"><br />{p.reference}</span> : null}</span> },
    { key: 'status', header: 'Status', width: '110px', render: (p) => <StatusPill meta={PAYMENT_STATUS_META[p.status as keyof typeof PAYMENT_STATUS_META] ?? PAYMENT_STATUS_META.pending} /> },
    { key: 'action', header: '', width: '130px', align: 'right', render: (p) => (p.status === 'pending' && canRecord ? <MarkPaid payment={p} label={perspective === 'payee' ? 'Mark received' : 'Mark paid'} /> : null) },
  ];

  return (
    <>
      <Stats
        items={[
          { label: perspective === 'payee' ? 'Waiting to be paid' : 'Waiting to pay', value: `ETB ${Math.round(sum(pending)).toLocaleString('en-US')}`, sub: `${pending.length} open` },
          { label: 'Recorded as paid', value: `ETB ${Math.round(sum(paid)).toLocaleString('en-US')}`, sub: `${paid.length}` },
        ]}
      />
      <div className="row between wrap gap-12">
        <TabLinks
          items={[
            { href: `${basePath}?status=pending`, label: `Open · ${pending.length}`, on: status === 'pending' },
            { href: `${basePath}?status=paid`, label: 'Paid', on: status === 'paid' },
            { href: `${basePath}?status=all`, label: 'All', on: status === 'all' },
          ]}
        />
        <span className="small muted">Raha records payments; money moves outside Raha (Telebirr, CBE, cash).</span>
      </div>
      <DataTable columns={columns} rows={shown} rowKey={(p) => p.id} minWidth={880} empty="No payments here." />
    </>
  );
}
