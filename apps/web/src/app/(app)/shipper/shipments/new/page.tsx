import type { Metadata } from 'next';
import type { PlaceDto } from '@raha/contracts';
import { NewShipmentForm } from './NewShipmentForm';
import { api, requireSession } from '@/lib/raha';

export const metadata: Metadata = { title: 'New shipment' };

export default async function NewShipmentPage() {
  await requireSession();
  const places = await api<PlaceDto[]>('/places?limit=100', { org: null });
  return (
    <main className="page">
      <NewShipmentForm places={places} />
    </main>
  );
}
