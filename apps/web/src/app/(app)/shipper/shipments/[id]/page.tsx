import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { ShipmentDetailDto } from '@raha/contracts';
import { ApiError } from '@raha/web-kit';
import { ShipmentDetailView } from '@/components/shipment/ShipmentDetailView';
import { apiAsOrg, requireSession } from '@/lib/raha';

export const metadata: Metadata = { title: 'Shipment' };

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  let s: ShipmentDetailDto;
  try {
    s = await apiAsOrg<ShipmentDetailDto>(`/shipments/${id}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403 || e.status === 400)) notFound();
    throw e;
  }
  const perms = session.active?.permissions ?? [];
  return (
    <ShipmentDetailView
      s={s}
      viewerName={session.user.fullName}
      canPost={perms.includes('message:post')}
      canRecordPayment={perms.includes('payment:record')}
      backHref="/shipper/shipments"
      backLabel="All shipments"
    />
  );
}
