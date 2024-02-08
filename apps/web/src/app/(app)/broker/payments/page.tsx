import type { Metadata } from 'next';
import { PageHeader } from '@raha/ui';
import type { PaymentDto } from '@raha/contracts';
import { PaymentsView } from '@/components/PaymentsView';
import { apiAsOrg, requireSession } from '@/lib/raha';

export const metadata: Metadata = { title: 'Payments log' };

export default async function Payments({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status = raw === 'paid' || raw === 'all' ? raw : 'pending';
  const [s, payments] = await Promise.all([requireSession(), apiAsOrg<PaymentDto[]>('/payments?status=all')]);
  return (
    <main className="page-fluid">
      <PageHeader kicker="LOADS YOU PLACED" title="Payments log" />
      <PaymentsView payments={payments} status={status} basePath="/broker/payments" canRecord={s.active?.permissions.includes('payment:record') ?? false} perspective="payee" shipmentBase="/broker/shipments" />
    </main>
  );
}
