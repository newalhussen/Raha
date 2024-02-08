import { notFound } from 'next/navigation';
import type { ShipmentDetailDto } from '@raha/contracts';
import { ApiError } from '@raha/web-kit';
import { ShipmentDetailView } from '@/components/shipment/ShipmentDetailView';
import { apiAsOrg, requireSession } from '@/lib/raha';

export default async function BrokerShipment({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  let s: ShipmentDetailDto;
  try {
    s = await apiAsOrg<ShipmentDetailDto>(`/shipments/${id}`);
  } catch (e) {
    if (e instanceof ApiError && [400, 403, 404].includes(e.status)) notFound();
    throw e;
  }
  const perms = session.active?.permissions ?? [];
  return <ShipmentDetailView s={s} viewerName={session.user.fullName} canPost={perms.includes('message:post')} canRecordPayment={perms.includes('payment:record')} backHref="/broker/match-board" backLabel="Match board" />;
}
