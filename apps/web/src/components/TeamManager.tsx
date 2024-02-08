'use client';

import { useState } from 'react';
import { Avatar, Button, DataTable, Field, Input, Modal, Pill, Select, useToast, type Column } from '@raha/ui';
import { ApiError, api, refreshApi, useApi } from '@raha/web-kit/client';
import { ASSIGNABLE_ROLES, formatPhone, formatWhen, type MemberDto, type MemberRole, type OrgType } from '@raha/contracts';

const ROLE_LABEL: Record<MemberRole, string> = { owner: 'Owner', manager: 'Manager', staff: 'Logistics staff', dispatcher: 'Dispatcher', driver: 'Driver' };
const CHANNEL: Record<MemberDto['channel'], string> = { app: 'App', telegram: 'Telegram only', sms: 'SMS', invited: 'Invited' };

/** Invite people by phone number, change roles, remove access. Roles decide what each person can do. */
export function TeamManager({ orgType, canManage, meUserId }: { orgType: OrgType; canManage: boolean; meUserId: string }) {
  const toast = useToast();
  const { data, mutate } = useApi<MemberDto[]>('orgs/current/members');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ fullName: string; phone: string; role: MemberRole }>({ fullName: '', phone: '', role: ASSIGNABLE_ROLES[orgType].find((r) => r !== 'owner') ?? 'staff' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    setBusy(true);
    setError(null);
    try {
      await api('orgs/current/members', { body: form });
      toast.push(`${form.fullName} was added. They sign in with their phone number.`);
      setOpen(false);
      setForm({ ...form, fullName: '', phone: '' });
      await mutate();
      await refreshApi('orgs');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add this person.');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(m: MemberDto, role: MemberRole) {
    try {
      await api(`orgs/current/members/${m.membershipId}`, { method: 'PATCH', body: { role } });
      toast.push(`${m.fullName} is now ${ROLE_LABEL[role].toLowerCase()}.`);
      await mutate();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not change the role.', true);
    }
  }

  async function remove(m: MemberDto) {
    if (!window.confirm(`Remove ${m.fullName} from your team?`)) return;
    try {
      await api(`orgs/current/members/${m.membershipId}`, { method: 'DELETE' });
      toast.push(`${m.fullName} was removed.`);
      await mutate();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not remove this person.', true);
    }
  }

  const columns: Column<MemberDto>[] = [
    { key: 'name', header: 'Name', width: '1.6fr', render: (m) => <div className="row gap-10"><Avatar name={m.fullName} size={34} /><div><div className="bold">{m.fullName}{m.userId === meUserId ? <span className="muted"> (you)</span> : null}</div><div className="mono xs muted">{formatPhone(m.phone)}</div></div></div> },
    {
      key: 'role',
      header: 'Role',
      width: '1fr',
      render: (m) =>
        canManage && m.userId !== meUserId ? (
          <Select value={m.role} onChange={(e) => void changeRole(m, e.target.value as MemberRole)} aria-label={`Role for ${m.fullName}`} style={{ height: 36, fontSize: 14 }}>
            {ASSIGNABLE_ROLES[orgType].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        ) : (
          <span>{ROLE_LABEL[m.role]}</span>
        ),
    },
    { key: 'channel', header: 'Reached by', width: '120px', render: (m) => <Pill tone={m.channel === 'invited' ? 'amber' : m.channel === 'app' ? 'green' : 'neutral'} glyph={m.channel === 'invited' ? 'ring' : 'dot'}>{CHANNEL[m.channel]}</Pill> },
    { key: 'seen', header: 'Last seen', width: '130px', render: (m) => <span className="small muted">{m.lastSeenAt ? formatWhen(m.lastSeenAt) : '—'}</span> },
    { key: 'act', header: '', width: '90px', align: 'right', render: (m) => (canManage && m.userId !== meUserId ? <Button variant="ghost" size="xs" onClick={() => void remove(m)}>Remove</Button> : null) },
  ];

  return (
    <div className="col gap-16">
      <div className="row between wrap gap-12">
        <span className="small muted">{data ? `${data.length} people` : 'Loading…'} · People sign in with their phone number. Roles decide who can book, cancel, publish space or record payments.</span>
        {canManage ? <Button variant="amber" size="sm" onClick={() => setOpen(true)}>+ Add person</Button> : null}
      </div>
      <DataTable columns={columns} rows={data ?? []} rowKey={(m) => m.membershipId} minWidth={760} empty={data ? 'No one here yet.' : 'Loading…'} />
      <Modal
        open={open}
        title="Add a person"
        onClose={() => setOpen(false)}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="amber" loading={busy} disabled={!form.fullName || !form.phone} onClick={invite}>Add to team</Button></>}
      >
        <Field label="Full name"><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Hanna Girma" autoFocus /></Field>
        <Field label="Mobile number" hint="They sign in with this number and a text-message code."><Input className="mono" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="091 133 0207" /></Field>
        <Field label="Role">
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as MemberRole })}>
            {ASSIGNABLE_ROLES[orgType].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </Select>
        </Field>
        {error ? <div className="notice error" role="alert">{error}</div> : null}
      </Modal>
    </div>
  );
}
