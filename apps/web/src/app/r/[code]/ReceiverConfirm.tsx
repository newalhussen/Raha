'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@raha/ui';
import { ApiError } from '@raha/web-kit';

type Condition = 'all_good' | 'short_count' | 'damaged';

const OPTIONS: Array<{ value: Condition; en: string; am: string }> = [
  { value: 'all_good', en: 'Yes, everything is here and in good condition', am: 'አዎ፣ ሁሉም ጭነት ደርሷል በጥሩ ሁኔታም' },
  { value: 'short_count', en: 'Some is missing', am: 'የጎደለ አለ' },
  { value: 'damaged', en: 'Damaged', am: 'ተጎድቷል' },
];

/** "I’ve received it — confirm here": the receiver closes the delivery without a PIN, with an honest condition. */
export function ReceiverConfirm({ code, am }: { code: string; am: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [condition, setCondition] = useState<Condition>('all_good');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/public/receiver/${code}/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ condition }) });
      if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not confirm. Check your connection and try again.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-auto">
        <Button variant="outline" size="lg" block onClick={() => setOpen(true)}>{am ? 'ተቀብያለሁ — እዚህ ያረጋግጡ' : 'I’ve received it — confirm here'}</Button>
      </div>
    );
  }

  return (
    <div className="col gap-12 mt-auto">
      <h2 className="h2" style={{ fontSize: 24 }}>{am ? 'ሁሉም ደርሷል?' : 'Is everything there?'}</h2>
      <div className="col gap-8" role="radiogroup">
        {OPTIONS.map((o) => {
          const on = condition === o.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => setCondition(o.value)} className="row gap-12" style={{ minHeight: 60, padding: '0 16px', textAlign: 'left', cursor: 'pointer', fontSize: 16, fontWeight: on ? 600 : 400, border: on ? 'none' : '1px solid var(--border-strong)', background: on ? 'var(--basalt)' : 'transparent', color: on ? 'var(--bone)' : 'var(--ink)' }}>
              <span style={{ width: 24, height: 24, flex: 'none', display: 'grid', placeItems: 'center', background: on ? 'var(--amber)' : 'transparent', color: 'var(--basalt)', border: on ? 'none' : '2px solid var(--ink)', fontSize: 14, boxSizing: 'border-box' }}>{on ? '✓' : ''}</span>
              <span className={am ? 'amharic' : ''}>{am ? o.am : o.en}</span>
            </button>
          );
        })}
      </div>
      <p className="xs muted" style={{ lineHeight: 1.5 }}>{am ? 'ማረጋገጥ ጭነቱን ይዘጋል፣ ላኪውን ያሳውቃል። ችግሮች በቀጥታ ወደ ራሃ ድጋፍ ይሄዳሉ።' : 'Confirming closes the shipment and tells the sender. Problems go straight to Raha support.'}</p>
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      <Button variant="amber" size="lg" block spread loading={busy} onClick={confirm}>{am ? 'ደርሷል ብለው ያረጋግጡ' : 'Confirm receipt'} <span>→</span></Button>
    </div>
  );
}
