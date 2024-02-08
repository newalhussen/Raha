'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Select, useToast } from '@raha/ui';
import { ApiError, api } from '@raha/web-kit/client';
import type { PlaceDto } from '@raha/contracts';

/** Record a town the driver reported by phone. */
export function CheckinForm({ tripId, places }: { tripId: string; places: PlaceDto[] }) {
  const router = useRouter();
  const toast = useToast();
  const [placeId, setPlaceId] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="row gap-8 mt-8">
      <Select value={placeId} onChange={(e) => setPlaceId(e.target.value)} aria-label="Town reported by driver" style={{ height: 36 }}>
        <option value="">Driver is in…</option>
        {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </Select>
      <Button variant="amber" size="sm" loading={busy} disabled={!placeId} onClick={async () => {
        setBusy(true);
        try {
          await api(`ops/trips/${tripId}/checkin`, { body: { placeId, note: 'Reported by phone' } });
          toast.push('Check-in recorded.');
          router.refresh();
        } catch (e) {
          toast.push(e instanceof ApiError ? e.message : 'Failed.', true);
        } finally {
          setBusy(false);
        }
      }}>Record</Button>
    </div>
  );
}
