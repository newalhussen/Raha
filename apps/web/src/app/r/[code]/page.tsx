import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CorridorStrip, RahaMark, Wordmark } from '@raha/ui';
import { formatDay, formatPhone, formatTime, type ReceiverPageDto } from '@raha/contracts';
import { apiBase } from '@raha/web-kit';
import { AutoRefresh } from '@/components/AutoRefresh';
import { ReceiverConfirm } from './ReceiverConfirm';

export const metadata: Metadata = { title: 'Your delivery', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const AM = {
  for: 'ለ',
  pin: 'የመቀበያ ፒንዎ',
  pinNote: 'ጭነቱን ካረጋገጡ በኋላ ብቻ ለሾፌሩ ይስጡ',
  from: 'ከ',
  cargo: 'ጭነት',
  driver: 'ሾፌር',
  call: 'ይደውሉ',
  delivered: 'ደርሷል',
  lang: 'English',
} as const;

async function load(code: string): Promise<ReceiverPageDto | null> {
  const res = await fetch(`${apiBase()}/public/receiver/${encodeURIComponent(code.toUpperCase())}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Receiver page failed: ${res.status}`);
  return (await res.json()) as ReceiverPageDto;
}

export default async function ReceiverPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ code }, { lang }] = await Promise.all([params, searchParams]);
  const p = await load(code);
  if (!p) notFound();
  const am = lang === 'am';

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: 'var(--bone)', display: 'flex', flexDirection: 'column' }}>
      {p.status === 'in_transit' ? <AutoRefresh seconds={45} /> : null}
      <div style={{ padding: '14px 18px' }} className="row between">
        <span className="row gap-8"><RahaMark size={22} tone="primary" /><Wordmark size={17} /></span>
        <Link href={`/r/${p.code}${am ? '' : '?lang=am'}`} className="small amharic" style={{ textDecoration: 'none' }}>{am ? AM.lang : 'አማርኛ'}</Link>
      </div>

      <div className="col gap-16" style={{ padding: '10px 18px 24px', flex: 1 }}>
        <div>
          <div className="small muted">{am ? `${AM.for} ${p.receiverName}` : `For ${p.receiverName}`}</div>
          <h1 className="h1 mt-4" style={{ fontSize: 28, lineHeight: 1.05 }}>{p.headline}</h1>
        </div>

        {p.strip ? <CorridorStrip strip={p.strip} showNotes={false} /> : null}
        {p.strip ? (
          <div className="row between xs muted" style={{ marginTop: -6 }}>
            <span>{p.pickup.name}</span>
            {p.etaAt && p.status === 'in_transit' ? <span>ETA {formatTime(p.etaAt)}</span> : null}
            <span>{p.dropoff.name}</span>
          </div>
        ) : null}

        {p.pin ? (
          <div className="pin-box">
            <span className="small" style={{ color: 'var(--stone)' }}>{am ? AM.pin : 'Your delivery PIN'}</span>
            <span className="digits" aria-label={`PIN ${p.pin.split('').join(' ')}`}>{p.pin}</span>
            <span className="xs" style={{ color: 'var(--stone)', textAlign: 'center' }}>{am ? AM.pinNote : `Share only after checking all of the cargo`}</span>
          </div>
        ) : null}

        <div className="kv">
          <div><span>{am ? AM.from : 'From'}</span><span>{p.shipperName}</span></div>
          <div><span>{am ? AM.cargo : 'Cargo'}</span><span>{p.cargoSummary}</span></div>
          <div><span>Shipment</span><span className="mono">{p.ref}</span></div>
          {p.driverFirstName ? (
            <div>
              <span>{am ? AM.driver : 'Driver'}</span>
              <span>{p.driverFirstName}{p.plate ? ` · ${p.plate}` : ''}{p.driverPhone ? <> · <a href={`tel:${p.driverPhone}`}>{am ? AM.call : 'Call'}</a></> : null}</span>
            </div>
          ) : null}
          {p.driverPhone && !p.driverFirstName ? <div><span>Contact</span><span className="mono">{formatPhone(p.driverPhone)}</span></div> : null}
        </div>

        {p.status === 'delivered' ? (
          <div className="notice" style={{ background: 'var(--green-tint)', color: 'var(--green-ink)', borderLeftColor: 'var(--green)', fontWeight: 600 }}>
            ✓ {am ? AM.delivered : 'Delivered'} {p.deliveredAt ? `${formatDay(p.deliveredAt)} ${formatTime(p.deliveredAt)}` : ''}{p.confirmedBy === 'pin' ? ' · PIN confirmed' : p.confirmedBy === 'receiver_link' ? ' · confirmed by you' : ''}
          </div>
        ) : null}

        {p.canConfirm ? <ReceiverConfirm code={p.code} am={am} /> : null}
      </div>
    </main>
  );
}
