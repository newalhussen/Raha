'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, TruckOptionCard, useToast } from '@raha/ui';
import { ApiError, api } from '@raha/web-kit/client';
import type { TruckOptionDto } from '@raha/contracts';

/** A candidate truck with two ways to assign: propose to the carrier, or confirm now (agreed by phone). */
export function AssignCard({ shipmentId, option }: { shipmentId: string; option: TruckOptionDto }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<'ask' | 'now' | null>(null);

  async function assign(confirmNow: boolean) {
    setBusy(confirmNow ? 'now' : 'ask');
    try {
      await api(`ops/matching/${shipmentId}/assign`, { body: { capacityPostId: option.capacityPostId, confirmNow } });
      toast.push(confirmNow ? 'Match confirmed on both sides.' : 'Proposal sent to the carrier.');
      router.push(`/shipments/${shipmentId}`);
      router.refresh();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not assign.', true);
      setBusy(null);
    }
  }

  return (
    <TruckOptionCard
      option={option}
      action={
        <div className="col gap-6" style={{ alignItems: 'flex-end' }}>
          <Button variant="amber" size="sm" loading={busy === 'now'} disabled={!!busy} onClick={() => assign(true)}>Confirm now</Button>
          <Button variant="outline" size="xs" loading={busy === 'ask'} disabled={!!busy} onClick={() => assign(false)}>Ask carrier</Button>
          <span className="xs muted">{option.offRouteKm} km off route</span>
        </div>
      }
    />
  );
}
