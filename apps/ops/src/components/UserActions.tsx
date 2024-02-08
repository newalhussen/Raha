'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input, Modal, Select, useToast } from '@raha/ui';
import { ApiError, api } from '@raha/web-kit/client';
import { STAFF_ROLES } from '@raha/contracts';

export function UserRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const next = status === 'active' ? 'suspended' : 'active';
  return (
    <Button
      variant={status === 'active' ? 'ghost' : 'outline'}
      size="xs"
      onClick={async () => {
        if (next === 'suspended' && !window.confirm('Suspend this account? They are signed out immediately.')) return;
        try {
          await api(`ops/users/${id}`, { method: 'PATCH', body: { status: next } });
          toast.push(next === 'active' ? 'Account re-activated.' : 'Account suspended.');
          router.refresh();
        } catch (e) {
          toast.push(e instanceof ApiError ? e.message : 'Failed.', true);
        }
      }}
    >
      {status === 'active' ? 'Suspend' : 'Re-activate'}
    </Button>
  );
}

export function NewStaff() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ fullName: '', phone: '', email: '', password: '', staffRole: 'support' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button variant="amber" size="sm" onClick={() => setOpen(true)}>+ Staff account</Button>
      <Modal open={open} title="New staff account" onClose={() => setOpen(false)} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="amber" loading={busy} disabled={!f.fullName || !f.email || f.password.length < 10 || !f.phone} onClick={async () => {
        setBusy(true); setError(null);
        try { await api('ops/users', { body: f }); toast.push('Staff account created.'); setOpen(false); router.refresh(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Failed.'); } finally { setBusy(false); }
      }}>Create</Button></>}>
        <Field label="Full name"><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></Field>
        <Field label="Work email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone"><Input className="mono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Role"><Select value={f.staffRole} onChange={(e) => setF({ ...f, staffRole: e.target.value })}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</Select></Field>
        <Field label="Temporary password" hint="At least 10 characters."><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        {error ? <div className="notice error" role="alert">{error}</div> : null}
      </Modal>
    </>
  );
}
