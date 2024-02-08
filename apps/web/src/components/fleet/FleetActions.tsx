'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Input, InputGroup, Modal, Select, useToast } from '@raha/ui';
import { ApiError, api, useApi } from '@raha/web-kit/client';
import { BODY_TYPES, type FleetOfferDto, type PlaceDto, type VehicleDto } from '@raha/contracts';

const BODY_LABEL: Record<string, string> = { dry_box: 'Covered dry box', flatbed: 'Flatbed', tipper: 'Tipper', refrigerated: 'Refrigerated', tanker: 'Tanker', container: 'Container carrier', pickup: 'Pickup' };

function useSave(onDone: () => void) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      toast.push(ok);
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

const localDefault = (h: number) => {
  const d = new Date(Date.now() + h * 3_600_000);
  d.setMinutes(0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
};

/** Publish free space on a truck: route, departure, and how much is already aboard. */
export function PublishSpace({ trucks, label = 'Publish free space', preselect }: { trucks: Array<Pick<VehicleDto, 'id' | 'plate' | 'maxLoadKg' | 'verification' | 'status'>>; label?: string; preselect?: string }) {
  const [open, setOpen] = useState(false);
  const places = useApi<PlaceDto[]>(open ? 'places?limit=100' : null);
  const eligible = trucks.filter((t) => t.status !== 'off_road');
  const [f, setF] = useState({ vehicleId: preselect ?? eligible[0]?.id ?? '', origin: '', dest: '', departsAt: localDefault(3), committedKg: '0', kind: 'on_route' });
  const { busy, error, run } = useSave(() => setOpen(false));
  const truck = eligible.find((t) => t.id === f.vehicleId);

  return (
    <>
      <Button variant="amber" size="sm" onClick={() => setOpen(true)} disabled={eligible.length === 0}>{label}</Button>
      <Modal open={open} title="Publish free space" onClose={() => setOpen(false)} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="amber" loading={busy} disabled={!f.vehicleId || !f.origin || !f.dest} onClick={() => run(() => api('capacity', { body: { vehicleId: f.vehicleId, originPlaceId: f.origin, destinationPlaceId: f.dest, departsAt: new Date(f.departsAt).toISOString(), committedKg: Number(f.committedKg) || 0, kind: f.kind } }), 'Space published. Matching loads will be offered to you.')}>Publish</Button></>}>
        <Field label="Truck"><Select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}>{eligible.map((t) => <option key={t.id} value={t.id}>{t.plate} · {(t.maxLoadKg / 1000).toFixed(0)} t{t.verification !== 'verified' ? ' (not verified)' : ''}</option>)}</Select></Field>
        <div className="grid-auto" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="From"><Select value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })}><option value="">Choose…</option>{places.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="To"><Select value={f.dest} onChange={(e) => setF({ ...f, dest: e.target.value })}><option value="">Choose…</option>{places.data?.filter((p) => p.id !== f.origin).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        </div>
        <div className="grid-auto" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Departs"><Input type="datetime-local" value={f.departsAt} onChange={(e) => setF({ ...f, departsAt: e.target.value })} /></Field>
          <Field label="Already aboard" hint={truck ? `of ${truck.maxLoadKg.toLocaleString('en-US')} kg` : undefined}><InputGroup after="kg"><Input className="mono" inputMode="numeric" value={f.committedKg} onChange={(e) => setF({ ...f, committedKg: e.target.value.replace(/\D/g, '') })} /></InputGroup></Field>
        </div>
        <Field label="This trip is…"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="on_route">Partly loaded — spare space on the way</option><option value="return_leg">A return leg — running back empty</option><option value="dedicated">A dedicated truck for one customer</option></Select></Field>
        {error ? <div className="notice error" role="alert">{error}</div> : null}
      </Modal>
    </>
  );
}

export function AddTruck() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ plate: '', makeModel: '', bodyType: 'dry_box', maxLoadKg: '', year: '' });
  const { busy, error, run } = useSave(() => { setOpen(false); setF({ plate: '', makeModel: '', bodyType: 'dry_box', maxLoadKg: '', year: '' }); });
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>+ Add truck</Button>
      <Modal open={open} title="Add a truck" onClose={() => setOpen(false)} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="amber" loading={busy} disabled={!f.plate || !f.makeModel || !f.maxLoadKg} onClick={() => run(() => api('fleet/trucks', { body: { plate: f.plate, makeModel: f.makeModel, bodyType: f.bodyType, maxLoadKg: Number(f.maxLoadKg), year: f.year ? Number(f.year) : undefined } }), 'Truck added. Upload its documents for Raha to verify.')}>Add truck</Button></>}>
        <Field label="Plate"><Input className="mono" value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} placeholder="3-48213 AA" autoFocus /></Field>
        <div className="grid-auto" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
          <Field label="Make / model"><Input value={f.makeModel} onChange={(e) => setF({ ...f, makeModel: e.target.value })} placeholder="Isuzu FSR" /></Field>
          <Field label="Year"><Input className="mono" inputMode="numeric" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></Field>
        </div>
        <div className="grid-auto" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
          <Field label="Body"><Select value={f.bodyType} onChange={(e) => setF({ ...f, bodyType: e.target.value })}>{BODY_TYPES.map((b) => <option key={b} value={b}>{BODY_LABEL[b]}</option>)}</Select></Field>
          <Field label="Max load"><InputGroup after="kg"><Input className="mono" inputMode="numeric" value={f.maxLoadKg} onChange={(e) => setF({ ...f, maxLoadKg: e.target.value.replace(/\D/g, '') })} /></InputGroup></Field>
        </div>
        {error ? <div className="notice error" role="alert">{error}</div> : null}
      </Modal>
    </>
  );
}

/** Assign a load to one of the fleet's trucks (fleet offers it; the shipper confirms) or accept a booking addressed to us. */
export function OfferAction({ offer }: { offer: FleetOfferDto }) {
  const { busy, run } = useSave(() => undefined);
  if (offer.canAssign && offer.capacityPostId) {
    return <Button variant="amber" size="xs" loading={busy} onClick={() => run(() => api('fleet/offers/assign', { body: { shipmentId: offer.shipmentId, capacityPostId: offer.capacityPostId } }), 'Offer sent to the shipper.')}>Assign</Button>;
  }
  if (offer.canAccept && offer.matchId) {
    return <Button variant="amber" size="xs" loading={busy} onClick={() => run(() => api(`matches/${offer.matchId}/accept`, { body: {} }), 'Load accepted.')}>Accept</Button>;
  }
  return offer.stateLabel ? <span className="xs semi" style={{ background: 'var(--green-tint)', color: 'var(--green-ink)', padding: '4px 8px' }}>{offer.stateLabel}</span> : null;
}

export function InviteDriver() {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ fullName: '', phone: '' });
  const { busy, error, run } = useSave(() => { setOpen(false); setF({ fullName: '', phone: '' }); });
  return (
    <>
      <Button variant="amber" size="sm" onClick={() => setOpen(true)}>+ Invite driver</Button>
      <Modal open={open} title="Invite a driver" onClose={() => setOpen(false)} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="amber" loading={busy} disabled={!f.fullName || !f.phone} onClick={() => run(() => api('orgs/current/members', { body: { ...f, role: 'driver' } }), 'Invitation sent by SMS.')}>Send invitation</Button></>}>
        <p className="small muted">They install Raha Driver, sign in with this number, and send their licence and Fayda ID for Raha Operations to verify.</p>
        <Field label="Full name"><Input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} autoFocus /></Field>
        <Field label="Mobile number"><Input className="mono" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="091 120 4418" /></Field>
        {error ? <div className="notice error" role="alert">{error}</div> : null}
      </Modal>
    </>
  );
}
