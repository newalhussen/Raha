import type { Metadata } from 'next';
import { Empty, PageHeader, Pill } from '@raha/ui';
import type { InboxItemDto } from '@raha/contracts';
import { HandleButton } from '@/components/broker/HandleButton';
import { apiAsOrg } from '@/lib/raha';

export const metadata: Metadata = { title: 'Inbox' };

export default async function Inbox() {
  const items = await apiAsOrg<InboxItemDto[]>('/broker/inbox');
  return (
    <main className="page-fluid">
      <PageHeader kicker="TELEGRAM · SMS · CALLS" title="Inbox" sub="Truck owners and customers who message you. Turn them into space or loads." />
      {items.length === 0 ? (
        <div className="panel"><Empty title="Nothing here">Messages from drivers and customers land here.</Empty></div>
      ) : (
        <div className="panel divide">
          {items.map((m) => (
            <div key={m.id} className="row between wrap gap-12" style={{ padding: '14px 18px', opacity: m.handled ? 0.55 : 1 }}>
              <div className="col gap-4" style={{ minWidth: 0 }}>
                <div className="row gap-8"><strong>{m.fromName ?? m.fromPhone}</strong><Pill tone="neutral" glyph={null} mono>{m.channel.toUpperCase()}</Pill><span className="xs muted">{m.ageLabel}</span></div>
                <span>{m.body}</span>
              </div>
              {m.handled ? <span className="small muted">Handled</span> : <HandleButton id={m.id} />}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
