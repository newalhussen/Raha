import { DataTable, PageHeader, StatusPill, Tag, TabLinks, type Column } from '@raha/ui';
import { ISSUE_KIND_LABEL, ISSUE_STATUS_META, type IssueDto, type Paged } from '@raha/contracts';
import { api } from '@/lib/raha';

const columns: Column<IssueDto>[] = [
  { key: 'k', header: 'Kind', width: '100px', render: (i) => <Tag tone={i.kind === 'dispute' || i.kind === 'safety' ? 'red' : i.kind === 'match' ? 'amber' : 'neutral'}>{ISSUE_KIND_LABEL[i.kind]}</Tag> },
  { key: 't', header: 'Issue', width: '2fr', render: (i) => <div><div className="semi small">{i.title}</div><div className="xs muted">{i.ref}{i.shipment ? ` · ${i.shipment.ref}` : ''}{i.orgName ? ` · ${i.orgName}` : ''}{i.raisedBy ? ` · ${i.raisedBy}` : ''}</div></div> },
  { key: 'a', header: 'Assigned', width: '130px', render: (i) => <span className="small">{i.assignedTo?.name ?? <span className="muted">—</span>}</span> },
  { key: 'age', header: 'Age', width: '70px', render: (i) => <span className="mono small">{i.ageLabel}</span> },
  { key: 's', header: 'Status', width: '120px', render: (i) => <StatusPill meta={ISSUE_STATUS_META[i.status]} /> },
];

export async function IssueList({ base, kind, title, status }: { base: '/support' | '/disputes'; kind: 'support_all' | 'dispute'; title: string; status?: string }) {
  const st = status === 'closed' || status === 'all' ? status : 'open';
  const r = await api<Paged<IssueDto>>(`/ops/issues?kind=${kind}&status=${st}`, { org: null });
  return (
    <main className="page-fluid">
      <PageHeader kicker={`${r.total} ${st.toUpperCase()}`} title={title} aside={<TabLinks items={[['open', 'Open'], ['closed', 'Resolved'], ['all', 'All']].map(([k, l]) => ({ href: `${base}?status=${k}`, label: l, on: k === st }))} />} />
      <DataTable columns={columns} rows={r.items} rowKey={(i) => i.id} href={(i) => `${base}/${i.id}`} minWidth={800} empty="Nothing here." />
    </main>
  );
}
