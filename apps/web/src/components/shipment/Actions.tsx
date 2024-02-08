'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input, Modal, Select, Textarea, useToast } from '@raha/ui';
import { ApiError, api } from '@raha/web-kit/client';
import { PAYMENT_METHODS, type PaymentDto } from '@raha/contracts';

const METHOD_LABEL: Record<string, string> = { telebirr: 'Telebirr', cbe: 'CBE (Commercial Bank)', bank: 'Other bank transfer', cash: 'Cash', other: 'Other' };

export function CopyLink({ url, label = 'Share link' }: { url: string; label?: string }) {
  const toast = useToast();
  return (
    <Button
      variant="outline"
      size="sm"
      block
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          toast.push('Tracking link copied. Anyone with it can follow this delivery.');
        } catch {
          toast.push(url);
        }
      }}
    >
      {label}
    </Button>
  );
}

/** Cancel the shipment, or confirm delivery by hand when the receiver confirmed by phone. */
export function ShipmentActions({ shipmentId, ref_, canCancel, canConfirm }: { shipmentId: string; ref_: string; canCancel: boolean; canConfirm: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<'cancel' | 'confirm' | null>(null);
  const [reason, setReason] = useState('');
  const [condition, setCondition] = useState('all_good');
  const [busy, setBusy] = useState(false);

  async function run(path: string, body: unknown, ok: string) {
    setBusy(true);
    try {
      await api(`shipments/${shipmentId}/${path}`, { body });
      toast.push(ok);
      setDialog(null);
      router.refresh();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Something went wrong.', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row gap-8 wrap">
        {canConfirm ? <Button variant="outline" size="sm" onClick={() => setDialog('confirm')}>Confirm delivery by hand</Button> : null}
        {canCancel ? <Button variant="danger" size="sm" onClick={() => setDialog('cancel')}>Cancel shipment</Button> : null}
      </div>

      <Modal
        open={dialog === 'cancel'}
        title={`Cancel ${ref_}?`}
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>Keep shipment</Button>
            <Button variant="ink" loading={busy} onClick={() => run('cancel', { reason: reason || undefined }, `${ref_} cancelled.`)}>Cancel shipment</Button>
          </>
        }
      >
        <p className="small muted">If a truck was already booked, the carrier is told and the space goes back on the market.</p>
        <Textarea placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>

      <Modal
        open={dialog === 'confirm'}
        title="Confirm delivery by hand"
        onClose={() => setDialog(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>Not yet</Button>
            <Button variant="amber" loading={busy} onClick={() => run('confirm-delivery', { condition }, 'Delivery confirmed. Raha Operations will review it.')}>Confirm delivery</Button>
          </>
        }
      >
        <p className="small muted">Use this only if the receiver confirmed by phone or lost the PIN. Deliveries without a PIN are flagged for review.</p>
        <Field label="Condition on arrival">
          <Select value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="all_good">Everything arrived in good condition</option>
            <option value="short_count">Some pieces are missing</option>
            <option value="damaged">Cargo is damaged</option>
          </Select>
        </Field>
      </Modal>
    </>
  );
}

/** Record that a payment happened (the money itself moves outside Raha). */
export function MarkPaid({ payment, label = 'Mark as paid' }: { payment: PaymentDto; label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('telebirr');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api(`payments/${payment.id}/paid`, { body: { method, reference: reference || undefined } });
      toast.push('Payment recorded.');
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.push(e instanceof ApiError ? e.message : 'Could not record the payment.', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="ink" size="sm" onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} title="Record payment" onClose={() => setOpen(false)} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="amber" loading={busy} onClick={save}>Save payment</Button></>}>
        <p className="small muted">{payment.shipmentRef} · {payment.route} · <span className="mono">ETB {Math.round(payment.amountEtb).toLocaleString('en-US')}</span></p>
        <Field label="How was it paid?">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </Select>
        </Field>
        <Field label="Reference (optional)"><Input className="mono" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Telebirr / CBE transaction id" /></Field>
      </Modal>
    </>
  );
}
