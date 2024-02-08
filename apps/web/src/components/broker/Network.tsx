'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input, Modal, useToast } from '@raha/ui';
import { ApiError, api } from '@raha/web-kit/client';

export function AddNetworkTruck() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ plate: '', ownerName: '', ownerPhone: '', makeModel: '', maxLoadKg: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api('broker/network', { body: { plate: f.plate, ownerName: f.ownerName || undefined, ownerPhone: f.ownerPhone || undefined, makeModel: f.makeModel || undefined, maxLoadKg: f.maxLoadKg ? Number(f.maxLoadKg) : undefined } });
      toast.push(`${f.plate.toUpperCase()} added to your network.`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add the truck.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="ink" size="sm" onClick={() => setOpen(true)}>+ Add truck</Button>
      <Modal open={open} title="Add a truck to your network" onClose={() => setOpen(false)} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="amber" loading={busy} disabled={!f.plate} onClick={save}>Add truck</Button></>}>
        <p className="small muted">If the plate is already on Raha it is linked at once. A new truck needs the owner’s name and phone; Raha Operations then verifies it.</p>
        <Field label="Plate"><Input className="mono" value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} placeholder="3-48213 AA" autoFocus /></Field>
        <Field label="Owner name"><Input value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} /></Field>
        <Field label="Owner phone"><Input className="mono" value={f.ownerPhone} onChange={(e) => setF({ ...f, ownerPhone: e.target.value })} /></Field>
        <div className="grid-auto" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Make / model"><Input value={f.makeModel} onChange={(e) => setF({ ...f, makeModel: e.target.value })} placeholder="Isuzu FSR" /></Field>
          <Field label="Max load (kg)"><Input className="mono" inputMode="numeric" value={f.maxLoadKg} onChange={(e) => setF({ ...f, maxLoadKg: e.target.value.replace(/\D/g, '') })} /></Field>
        </div>
        {error ? <div className="notice error" role="alert">{error}</div> : null}
      </Modal>
    </>
  );
}

export function RemoveTruck({ vehicleId, plate }: { vehicleId: string; plate: string }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={async () => {
        if (!window.confirm(`Remove ${plate} from your network?`)) return;
        try {
          await api(`broker/network/${vehicleId}`, { method: 'DELETE' });
          toast.push(`${plate} removed.`);
          router.refresh();
        } catch (e) {
          toast.push(e instanceof ApiError ? e.message : 'Could not remove the truck.', true);
        }
      }}
    >
      Remove
    </Button>
  );
}
