'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, Input, useToast } from '@raha/ui';
import { ApiError, api, useApi } from '@raha/web-kit/client';
import { formatTime, type MessageDto } from '@raha/contracts';

/** The thread on a shipment: shipper staff, the driver (app or SMS) and Raha Ops. Polls every 15 s. */
export function Chat({ shipmentId, canPost, who }: { shipmentId: string; canPost: boolean; who: string }) {
  const toast = useToast();
  const { data, mutate } = useApi<MessageDto[]>(`shipments/${shipmentId}/messages`, { refreshInterval: 15_000 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [data?.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const m = await api<MessageDto>(`shipments/${shipmentId}/messages`, { body: { body } });
      setText('');
      await mutate((cur) => [...(cur ?? []), m], { revalidate: false });
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not send the message.', true);
    } finally {
      setBusy(false);
    }
  }

  const people = Array.from(new Set((data ?? []).map((m) => m.senderName.split(' ')[0]))).join(', ');

  return (
    <section className="panel col" style={{ minHeight: 420 }}>
      <div className="panel-head">
        <span className="bold">Messages</span>
        <span className="xs muted">{people || who}</span>
      </div>
      <div className="col gap-12 grow" style={{ padding: 18, overflowY: 'auto', maxHeight: 460 }}>
        {!data ? <span className="small muted">Loading…</span> : null}
        {data && data.length === 0 ? <span className="small muted">No messages yet. Messages here also reach the driver by SMS or Telegram.</span> : null}
        {data?.map((m) =>
          m.channel === 'system' ? (
            <div key={m.id} className="msg-sys">— {formatTime(m.createdAt)} · {m.body} —</div>
          ) : (
            <div key={m.id} className={`msg${m.mine ? ' mine' : ''}`} style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start' }}>
              {!m.mine ? <div className="who">{m.senderName.split(' ')[0]}{m.channel === 'sms' ? ' · via SMS' : m.channel === 'telegram' ? ' · via Telegram' : ''}{m.senderLabel ? ` · ${m.senderLabel}` : ''}</div> : null}
              {m.body}
              <div className="mono" style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>{formatTime(m.createdAt)}</div>
            </div>
          ),
        )}
        <div ref={end} />
      </div>
      {canPost ? (
        <form onSubmit={send} className="row gap-8" style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" maxLength={1000} aria-label="Message" />
          <Button type="submit" variant="ink" loading={busy} disabled={!text.trim()}>Send</Button>
        </form>
      ) : null}
    </section>
  );
}
