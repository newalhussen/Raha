'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, CapacityBar, Pill, useToast } from '@raha/ui';
import { ApiError, api } from '@raha/web-kit/client';
import { formatEtb, type BoardTruckDto } from '@raha/contracts';

/** One truck on the match board: who, how full, price + your fee, Call / Offer load. */
export function OfferButton({ shipmentId, truck: t, best }: { shipmentId: string; truck: BoardTruckDto; best?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const sent = !!t.existingMatch;

  async function offer() {
    setBusy(true);
    try {
      await api('broker/offers', { body: { shipmentId, capacityPostId: t.capacityPostId } });
      toast.push(`Offer sent to ${t.driver.name}.`);
      router.refresh();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not send the offer.', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ background: '#fff', borderWidth: best ? 2 : 1, borderColor: best ? 'var(--ink)' : undefined, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row between gap-10" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="row gap-8"><span className="mono-strong small">{t.plate}</span><Pill tone={t.highlighted ? 'amber' : 'neutral'} glyph={null} mono>{t.tag}</Pill></div>
          <div className="small soft mt-4">{t.ownerLabel}</div>
        </div>
        <div className="right"><div className="mono-strong">{formatEtb(t.priceEtb)}</div><div className="xs muted">your fee {formatEtb(t.brokerFeeEtb)}</div></div>
      </div>
      <CapacityBar bar={t.bar} height={12} />
      <div className="row between wrap gap-8">
        <span className="xs soft">{t.capacityNote}</span>
        <div className="row gap-6">
          {sent ? (
            <span className="small muted">Offer {t.existingMatch!.status === 'confirmed' ? 'confirmed' : 'sent'}</span>
          ) : (
            <Button variant={best ? 'amber' : 'ink'} size="xs" loading={busy} onClick={offer}>Offer load</Button>
          )}
        </div>
      </div>
    </div>
  );
}
