'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Modal, Textarea, useToast } from '@raha/ui';
import { ApiError, api } from '@raha/web-kit/client';

type Decision = 'approve' | 'reject' | 'reupload';
const COPY: Record<Decision, { title: string; ok: string; hint: string }> = {
  approve: { title: 'Approve', ok: 'Approved. The subject was notified.', hint: 'Optional note for the log.' },
  reupload: { title: 'Request re-upload', ok: 'Re-upload requested.', hint: 'Tell them what to fix (e.g. “selfie must show your face clearly”).' },
  reject: { title: 'Reject', ok: 'Rejected. The subject was notified.', hint: 'Reason shown to the subject.' },
};

export function DecisionBar({ caseId }: { caseId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    if (!d) return;
    setBusy(true);
    try {
      await api(`ops/verification/${caseId}/decision`, { body: { decision: d, note: note || undefined } });
      toast.push(COPY[d].ok);
      setD(null);
      setNote('');
      router.replace('/verification');
      router.refresh();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not save the decision.', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row gap-8 wrap">
        <Button variant="outline" size="sm" onClick={() => setD('reupload')}>Request re-upload</Button>
        <Button variant="danger" size="sm" onClick={() => setD('reject')}>Reject</Button>
        <Button variant="amber" size="sm" onClick={() => setD('approve')}>Approve</Button>
      </div>
      <Modal open={!!d} title={d ? COPY[d].title : ''} onClose={() => setD(null)} footer={<><Button variant="ghost" onClick={() => setD(null)}>Cancel</Button><Button variant={d === 'approve' ? 'amber' : 'ink'} loading={busy} disabled={d !== 'approve' && !note.trim()} onClick={go}>Confirm</Button></>}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={d ? COPY[d].hint : ''} />
      </Modal>
    </>
  );
}
