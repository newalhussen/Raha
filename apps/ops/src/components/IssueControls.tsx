'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Select, Textarea, useToast } from '@raha/ui';
import { ApiError, api } from '@raha/web-kit/client';
import { ISSUE_STATUSES } from '@raha/contracts';

export function IssueControls({ id, status, resolution }: { id: string; status: string; resolution: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [st, setSt] = useState(status);
  const [res, setRes] = useState(resolution ?? '');
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.push(ok);
      setNote('');
      router.refresh();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed.', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel panel-pad">
      <span className="kicker">ACTIONS</span>
      <Field label="Add a note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you did or learned" /></Field>
      <Button variant="outline" size="sm" disabled={!note.trim()} loading={busy} onClick={() => run(() => api(`ops/issues/${id}/comments`, { body: { body: note, internal: true } }), 'Note added.')}>Add note</Button>
      <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
      <Field label="Status"><Select value={st} onChange={(e) => setSt(e.target.value)}>{ISSUE_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Select></Field>
      <Field label="Resolution (shown when resolved)"><Textarea value={res} onChange={(e) => setRes(e.target.value)} /></Field>
      <Button variant="amber" size="sm" loading={busy} onClick={() => run(() => api(`ops/issues/${id}`, { method: 'PATCH', body: { status: st, resolution: res || undefined } }), 'Case updated.')}>Save</Button>
    </section>
  );
}
