import type { Metadata } from 'next';
import { PageHeader } from '@raha/ui';
import type { PaymentDto } from '@raha/contracts';
import { PaymentsView } from '@/components/PaymentsView';
import { apiAsOrg, requireSession } from '@/lib/raha';

export const metadata: Metadata = { title: 'Payments' };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status = raw === 'paid' || raw === 'all' ? raw : 'pending';
  const [session, payments] = await Promise.all([requireSession(), apiAsOrg<PaymentDto[]>('/payments?status=all')]);
  return (
    <main className="page">
      <PageHeader kicker="RECORDS, NOT A WALLET" title="Payments" />
      <PaymentsView payments={payments} status={status} basePath="/shipper/payments" canRecord={session.active?.permissions.includes('payment:record') ?? false} perspective="payer" shipmentBase="/shipper/shipments" />
    </main>
  );
}
