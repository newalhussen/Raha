'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input, Modal, Select, useToast } from '@raha/ui';
import { ApiError, api, useApi } from '@raha/web-kit/client';
import { CARGO_TYPES, type BrokerShipperDto, type PlaceDto, type ShipmentDetailDto } from '@raha/contracts';

const blank = { shipperKey: 'new', shipperName: '', shipperPhone: '', source: 'phone', pickupPlaceId: '', pickupAddress: '', dropoffPlaceId: '', dropoffAddress: '', cargoType: 'coffee', pieces: '', weightKg: '', readyAt: '', receiverName: '', receiverPhone: '' };

function readyDefault() {
  const d = new Date(Date.now() + 2 * 3_600_000);
  d.setMinutes(0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}

/** "+ Log load from call": a phone/Telegram customer becomes a load on the board in under a minute. */
export function LogLoadButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...blank, readyAt: readyDefault() });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const places = useApi<PlaceDto[]>(open ? 'places?limit=100' : null);
  const shippers = useApi<BrokerShipperDto[]>(open ? 'broker/shippers' : null);
  const set = (k: keyof typeof blank, v: string) => setF((c) => ({ ...c, [k]: v }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const existing = f.shipperKey !== 'new';
      const d = await api<ShipmentDetailDto>('broker/loads', {
        body: {
          ...(existing ? { shipperOrgId: f.shipperKey } : { shipperName: f.shipperName, shipperPhone: f.shipperPhone || undefined }),
          source: f.source,
          pickupPlaceId: f.pickupPlaceId,
          pickupAddress: f.pickupAddress,
          dropoffPlaceId: f.dropoffPlaceId,
          dropoffAddress: f.dropoffAddress,
          cargoType: f.cargoType,
          pieces: f.pieces ? Number(f.pieces) : undefined,
          weightKg: Number(f.weightKg),
          readyAt: new Date(f.readyAt).toISOString(),
          receiverName: f.receiverName,
          receiverPhone: f.receiverPhone,
        },
      });
      toast.push(`${d.ref} logged. Matching trucks are on the board.`);
      setOpen(false);
      setF({ ...blank, readyAt: readyDefault() });
      router.push(`/broker/match-board?load=${d.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not log the load.');
    } finally {
      setBusy(false);
    }
  }

  const ok = f.pickupPlaceId && f.dropoffPlaceId && f.pickupAddress && f.dropoffAddress && Number(f.weightKg) > 0 && f.receiverName && f.receiverPhone && (f.shipperKey !== 'new' || f.shipperName);

  return (
    <>
      <Button variant="ink" size="sm" onClick={() => setOpen(true)}>+ Log load from call</Button>
      <Modal open={open} wide title="Log load from call" onClose={() => setOpen(false)} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="amber" loading={busy} disabled={!ok} onClick={save}>Put on board</Button></>}>
        <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Field label="Business">
            <Select value={f.shipperKey} onChange={(e) => set('shipperKey', e.target.value)}>
              <option value="new">New business…</option>
              {shippers.data?.map((s) => <option key={s.orgId} value={s.orgId}>{s.name}</option>)}
            </Select>
          </Field>
          {f.shipperKey === 'new' ? <Field label="Business name"><Input value={f.shipperName} onChange={(e) => set('shipperName', e.target.value)} /></Field> : null}
          {f.shipperKey === 'new' ? <Field label="Their phone"><Input className="mono" value={f.shipperPhone} onChange={(e) => set('shipperPhone', e.target.value)} /></Field> : null}
          <Field label="Came in by"><Select value={f.source} onChange={(e) => set('source', e.target.value)}><option value="phone">Phone call</option><option value="telegram">Telegram</option><option value="broker">In person</option></Select></Field>
          <Field label="Pickup town"><Select value={f.pickupPlaceId} onChange={(e) => set('pickupPlaceId', e.target.value)}><option value="">Choose…</option>{places.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Pickup address"><Input value={f.pickupAddress} onChange={(e) => set('pickupAddress', e.target.value)} /></Field>
          <Field label="Drop-off town"><Select value={f.dropoffPlaceId} onChange={(e) => set('dropoffPlaceId', e.target.value)}><option value="">Choose…</option>{places.data?.filter((p) => p.id !== f.pickupPlaceId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Delivery address"><Input value={f.dropoffAddress} onChange={(e) => set('dropoffAddress', e.target.value)} /></Field>
          <Field label="Cargo"><Select value={f.cargoType} onChange={(e) => set('cargoType', e.target.value)}>{CARGO_TYPES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select></Field>
          <Field label="Pieces"><Input className="mono" inputMode="numeric" value={f.pieces} onChange={(e) => set('pieces', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Weight (kg)"><Input className="mono" inputMode="numeric" value={f.weightKg} onChange={(e) => set('weightKg', e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Ready for pickup"><Input type="datetime-local" value={f.readyAt} onChange={(e) => set('readyAt', e.target.value)} /></Field>
          <Field label="Receiver name"><Input value={f.receiverName} onChange={(e) => set('receiverName', e.target.value)} /></Field>
          <Field label="Receiver phone"><Input className="mono" value={f.receiverPhone} onChange={(e) => set('receiverPhone', e.target.value)} /></Field>
        </div>
        {error ? <div className="notice error" role="alert">{error}</div> : null}
      </Modal>
    </>
  );
}
