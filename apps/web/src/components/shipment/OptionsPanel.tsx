'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Empty, Modal, Skeleton, StatusPill, Textarea, TruckOptionCard, useToast } from '@raha/ui';
import { ApiError, api, refreshApi, useApi } from '@raha/web-kit/client';
import { MATCH_STATUS_META, formatEtb, formatTime, type MatchDto, type TruckOptionDto } from '@raha/contracts';

/**
 * For a shipment that still needs a truck: proposals already in flight (from either side) and ranked
 * transport options with a Book button. All actions go through the same match API the driver app uses.
 */
export function OptionsPanel({ shipmentId, matches, canBook }: { shipmentId: string; matches: MatchDto[]; canBook: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const options = useApi<TruckOptionDto[]>(`shipments/${shipmentId}/options`, { refreshInterval: 30_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [decline, setDecline] = useState<MatchDto | null>(null);
  const [reason, setReason] = useState('');

  const live = matches.filter((m) => m.status === 'pending_carrier' || m.status === 'pending_shipper');
  const blocked = new Set(live.map((m) => m.capacityPostId));

  async function act<T>(key: string, fn: () => Promise<T>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.push(ok);
      await refreshApi(`shipments/${shipmentId}`);
      router.refresh();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Something went wrong. Try again.', true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="col gap-14" aria-label="Transport options">
      {live.length > 0 ? (
        <div className="panel">
          <div className="panel-head"><span className="h3">Proposals</span><span className="small muted">{live.length} waiting</span></div>
          <div className="divide">
            {live.map((m) => (
              <div key={m.id} className="row between wrap gap-12" style={{ padding: '14px 18px' }}>
                <div className="col gap-4">
                  <div className="row gap-8"><span className="bold">{m.driverName ?? 'Driver'}</span><span className="mono small muted">{m.plate}</span></div>
                  <span className="small muted">{m.fleetName} · departs {formatTime(m.departsAt)} · {m.status === 'pending_carrier' ? 'you asked this carrier' : 'carrier offered'}</span>
                </div>
                <div className="row gap-10 wrap">
                  <StatusPill meta={MATCH_STATUS_META[m.status]} />
                  <span className="mono-strong">{formatEtb(m.priceEtb)}</span>
                  {m.canAccept ? <Button variant="amber" size="sm" loading={busy === `a${m.id}`} onClick={() => act(`a${m.id}`, () => api(`matches/${m.id}/accept`, { method: 'POST', body: {} }), 'Truck confirmed.')}>Accept</Button> : null}
                  {m.canDecline ? <Button variant="outline" size="sm" onClick={() => setDecline(m)}>Decline</Button> : null}
                  {m.canCancel && !m.canAccept ? <Button variant="outline" size="sm" loading={busy === `c${m.id}`} onClick={() => act(`c${m.id}`, () => api(`matches/${m.id}/cancel`, { method: 'POST', body: {} }), 'Request withdrawn.')}>Withdraw</Button> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="row between wrap gap-12" style={{ alignItems: 'flex-end' }}>
        <h2 className="h2">Transport options</h2>
        <span className="small muted">{options.data ? `Sorted by fit · ${options.data.length} truck${options.data.length === 1 ? '' : 's'} on this corridor` : 'Looking for trucks…'}</span>
      </div>
      {options.isLoading && !options.data ? (
        <div className="col gap-12">{[0, 1].map((i) => <Skeleton key={i} height={132} />)}</div>
      ) : options.data && options.data.length === 0 ? (
        <div className="panel"><Empty title="No truck is going your way yet">Drivers and brokers have been alerted. New space is matched as soon as it is published, and offers appear here.</Empty></div>
      ) : (
        <div className="col gap-12">
          {options.data?.map((o) => (
            <TruckOptionCard
              key={o.capacityPostId}
              option={o}
              action={
                canBook ? (
                  blocked.has(o.capacityPostId) ? (
                    <span className="small muted">Requested</span>
                  ) : (
                    <Button variant={o.highlighted ? 'amber' : 'ink'} size="sm" loading={busy === o.capacityPostId} onClick={() => act(o.capacityPostId, () => api(`shipments/${shipmentId}/book`, { body: { capacityPostId: o.capacityPostId } }), `Booking sent to ${o.driver.name}.`)}>Book</Button>
                  )
                ) : null
              }
            />
          ))}
        </div>
      )}
      <p className="small muted" style={{ lineHeight: 1.5 }}>Prices are set by carriers or their broker. Payment is recorded in Raha; you pay the carrier directly (Telebirr, CBE, cash).</p>

      <Modal
        open={!!decline}
        title="Decline this offer"
        onClose={() => setDecline(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDecline(null)}>Keep it</Button>
            <Button variant="ink" loading={busy === 'decline'} onClick={() => decline && act('decline', async () => { await api(`matches/${decline.id}/decline`, { body: { reason: reason || undefined } }); setDecline(null); setReason(''); }, 'Offer declined.')}>Decline offer</Button>
          </>
        }
      >
        <p className="small muted">{decline?.fleetName} · {decline?.plate}</p>
        <Textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </section>
  );
}
