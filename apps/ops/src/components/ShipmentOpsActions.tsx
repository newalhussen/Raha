'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Modal, Textarea, useToast } from '@raha/ui';
import { ApiError, api } from '@raha/web-kit/client';

export function ShipmentOpsActions({ id, status, hasPin, flagged }: { id: string; status: string; hasPin: boolean; flagged: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [dlg, setDlg] = useState<'cancel' | 'confirm' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(path: string, body: unknown, ok: string, method = 'POST') {
    setBusy(true);
    try {
      await api(`ops/${path}`, { method, body });
      toast.push(ok);
      setDlg(null);
      router.refresh();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Failed.', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row gap-8 wrap">
        {hasPin ? <Button variant="outline" size="sm" onClick={() => run(`shipments/${id}/resend-pin`, {}, 'PIN re-sent to the receiver by SMS.')}>Verify & resend PIN</Button> : null}
        {flagged ? <Button variant="outline" size="sm" onClick={() => run(`deliveries/${id}/review`, { outcome: 'ok' }, 'Marked reviewed.')}>Mark reviewed</Button> : null}
        {status === 'in_transit' ? <Button variant="outline" size="sm" onClick={() => setDlg('confirm')}>Confirm delivery</Button> : null}
        {status === 'requested' || status === 'matched' ? <Button variant="danger" size="sm" onClick={() => setDlg('cancel')}>Cancel shipment</Button> : null}
      </div>
      <Modal open={dlg === 'cancel'} title="Cancel shipment" onClose={() => setDlg(null)} footer={<><Button variant="ghost" onClick={() => setDlg(null)}>Back</Button><Button variant="ink" loading={busy} onClick={() => run(`shipments/${id}/cancel`, { reason: note || 'Cancelled by Raha Operations' }, 'Shipment cancelled.')}>Cancel shipment</Button></>}>
        <Textarea placeholder="Reason" value={note} onChange={(e) => setNote(e.target.value)} />
      </Modal>
      <Modal open={dlg === 'confirm'} title="Confirm delivery (ops)" onClose={() => setDlg(null)} footer={<><Button variant="ghost" onClick={() => setDlg(null)}>Back</Button><Button variant="amber" loading={busy} onClick={() => run(`shipments/${id}/confirm-delivery`, { note: note || undefined }, 'Delivery confirmed by ops.')}>Confirm</Button></>}>
        <p className="small muted">Use after speaking to the receiver. The delivery is recorded as ops-confirmed.</p>
        <Textarea placeholder="Note (who you spoke to)" value={note} onChange={(e) => setNote(e.target.value)} />
      </Modal>
    </>
  );
}
