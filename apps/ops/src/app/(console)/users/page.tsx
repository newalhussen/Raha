import { redirect } from 'next/navigation';
import { Avatar, DataTable, PageHeader, Pill, TabLinks, type Column } from '@raha/ui';
import type { OpsUserRowDto, Paged } from '@raha/contracts';
import { UserRowActions, NewStaff } from '@/components/UserActions';
import { api, requireSession } from '@/lib/raha';
import { formatPhone, formatWhen } from '@/lib/format';

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string; staff?: string }> }) {
  const s = await requireSession();
  if (!s.staffPermissions.includes('ops:users')) redirect('/');
  const { q, staff } = await searchParams;
  const r = await api<Paged<OpsUserRowDto>>(`/ops/users?pageSize=100${q ? `&q=${encodeURIComponent(q)}` : ''}${staff ? `&staff=${staff}` : ''}`, { org: null });
  const columns: Column<OpsUserRowDto>[] = [
    { key: 'n', header: 'Person', width: '1.5fr', render: (u) => <div className="row gap-10"><Avatar name={u.fullName} size={34} /><div><div className="bold">{u.fullName}</div><div className="mono xs muted">{formatPhone(u.phone)}{u.email ? ` · ${u.email}` : ''}</div></div></div> },
    { key: 'o', header: 'Organizations', width: '1.6fr', render: (u) => <span className="small">{u.isStaff ? <Pill tone="amber" glyph={null} mono>RAHA {u.staffRole?.toUpperCase()}</Pill> : u.memberships.map((m) => `${m.orgName} (${m.role})`).join(', ') || '—'}{u.isDriver ? ' · driver' : ''}</span> },
    { key: 's', header: 'Seen', width: '130px', render: (u) => <span className="small muted">{u.lastSeenAt ? formatWhen(u.lastSeenAt) : 'never'}</span> },
    { key: 'st', header: 'Status', width: '100px', render: (u) => <Pill tone={u.status === 'active' ? 'green' : 'red'} glyph={u.status === 'active' ? 'dot' : 'diamond'}>{u.status}</Pill> },
    { key: 'a', header: '', width: '110px', align: 'right', render: (u) => <UserRowActions id={u.id} status={u.status} /> },
  ];
  return (
    <main className="page-fluid">
      <PageHeader kicker={`${r.total} PEOPLE`} title="Users" aside={<><form className="row gap-8"><input className="input" name="q" defaultValue={q ?? ''} placeholder="Name, phone, email" style={{ width: 220, height: 38 }} /></form><TabLinks items={[['', 'Everyone'], ['false', 'Customers'], ['true', 'Raha staff']].map(([k, l]) => ({ href: `/users${k ? `?staff=${k}` : ''}`, label: l, on: (staff ?? '') === k }))} />{s.staffPermissions.includes('ops:admin') ? <NewStaff /> : null}</>} />
      <DataTable columns={columns} rows={r.items} rowKey={(u) => u.id} minWidth={900} empty="No users." />
    </main>
  );
}
