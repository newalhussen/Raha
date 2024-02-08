import Link from 'next/link';
import { StatusPill, Tag } from '@raha/ui';
import { ISSUE_KIND_LABEL, ISSUE_STATUS_META, formatWhen, type IssueDetailDto } from '@raha/contracts';
import { IssueControls } from '@/components/IssueControls';
import { api } from '@/lib/raha';

export async function IssueDetail({ id, back }: { id: string; back: string }) {
  const i = await api<IssueDetailDto>(`/ops/issues/${id}`, { org: null });
  return (
    <main className="page-fluid">
      <div className="col gap-6">
        <Link href={back} className="small muted">← Back</Link>
        <div className="row gap-10"><span className="mono muted">{i.ref}</span><Tag tone={i.kind === 'dispute' ? 'red' : 'neutral'}>{ISSUE_KIND_LABEL[i.kind]}</Tag><StatusPill meta={ISSUE_STATUS_META[i.status]} /></div>
        <h1 className="h1">{i.title}</h1>
        <div className="small muted">
          Opened {formatWhen(i.createdAt)}{i.raisedBy ? ` by ${i.raisedBy}` : ''}{i.orgName ? ` · ${i.orgName}` : ''}
          {i.shipment ? <> · <Link href={`/shipments/${i.shipment.id}`}>{i.shipment.ref}</Link></> : null}
          {i.trip ? <> · <Link href={`/trips/${i.trip.id}`}>{i.trip.ref}</Link></> : null}
        </div>
      </div>
      {i.body ? <section className="panel p-20"><p style={{ lineHeight: 1.5 }}>{i.body}</p></section> : null}
      <div className="grid-2">
        <section className="panel panel-pad">
          <span className="kicker">DISCUSSION</span>
          {i.comments.length === 0 ? <span className="small muted">No notes yet.</span> : null}
          {i.comments.map((c) => <div key={c.id} className="col gap-4" style={{ padding: '8px 0', borderBottom: '1px solid var(--surface-alt)' }}><span className="xs muted">{c.author} · {formatWhen(c.createdAt)}{c.internal ? ' · internal' : ''}</span><span className="small">{c.body}</span></div>)}
        </section>
        <IssueControls id={i.id} status={i.status} resolution={i.resolution} />
      </div>
    </main>
  );
}
