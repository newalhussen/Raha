'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Field, Input, InputGroup, Select, Skeleton, TruckOptionCard, useToast } from '@raha/ui';
import { ApiError, api } from '@raha/web-kit/client';
import { CARGO_TYPES, formatEtb, normalizeEthiopianPhone, type PlaceDto, type ShipmentDetailDto, type TruckOptionDto } from '@raha/contracts';

interface Preview { options: TruckOptionDto[]; distanceKm: number | null; totalTrucks: number }

const SPECIAL = [
  { key: 'fragile', label: 'Fragile' },
  { key: 'perishable', label: 'Perishable (needs a cold box)' },
  { key: 'flatbed', label: 'Open flatbed' },
] as const;

/** Next half hour, as the value of a datetime-local input (browser-local time). */
function defaultReady(): string {
  const d = new Date(Date.now() + 2 * 3_600_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewShipmentForm({ places }: { places: PlaceDto[] }) {
  const router = useRouter();
  const toast = useToast();
  const byName = useMemo(() => [...places].sort((a, b) => a.name.localeCompare(b.name)), [places]);
  const addis = places.find((p) => p.code === 'ADD')?.id ?? '';

  const [f, setF] = useState({
    pickupPlaceId: addis,
    pickupAddress: '',
    dropoffPlaceId: '',
    dropoffAddress: '',
    cargoType: 'coffee',
    pieces: '',
    weightKg: '',
    volumeM3: '',
    readyAt: defaultReady(),
    receiverName: '',
    receiverPhone: '',
    pickupContactName: '',
    pickupContactPhone: '',
    special: [] as string[],
    note: '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((cur) => ({ ...cur, [k]: v }));

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState<string | 'draft' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const seq = useRef(0);

  const weight = Number(f.weightKg);
  const readyIso = f.readyAt ? new Date(f.readyAt).toISOString() : '';
  const ready = !!f.pickupPlaceId && !!f.dropoffPlaceId && f.pickupPlaceId !== f.dropoffPlaceId && weight > 0 && !!readyIso;

  // Live "transport options" while the form is being filled in (debounced; nothing is saved).
  const previewKey = ready ? JSON.stringify([f.pickupPlaceId, f.dropoffPlaceId, f.cargoType, weight, f.volumeM3, readyIso, f.special]) : null;
  useEffect(() => {
    if (!previewKey) {
      setPreview(null);
      return;
    }
    const mine = ++seq.current;
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<Preview>('shipments/preview-options', {
          body: { pickupPlaceId: f.pickupPlaceId, dropoffPlaceId: f.dropoffPlaceId, cargoType: f.cargoType, weightKg: weight, volumeM3: f.volumeM3 ? Number(f.volumeM3) : undefined, readyAt: readyIso, requirements: f.special },
        });
        if (mine === seq.current) setPreview(r);
      } catch {
        if (mine === seq.current) setPreview(null);
      } finally {
        if (mine === seq.current) setPreviewing(false);
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!f.pickupPlaceId) e.pickupPlaceId = 'Choose the pickup town.';
    if (f.pickupAddress.trim().length < 3) e.pickupAddress = 'Say where exactly: warehouse, area, landmark.';
    if (!f.dropoffPlaceId) e.dropoffPlaceId = 'Choose the drop-off town.';
    else if (f.dropoffPlaceId === f.pickupPlaceId) e.dropoffPlaceId = 'Pickup and drop-off must be different towns.';
    if (f.dropoffAddress.trim().length < 3) e.dropoffAddress = 'Say where exactly to deliver.';
    if (!(weight > 0)) e.weightKg = 'Enter the weight in kilograms.';
    if (!f.readyAt || new Date(f.readyAt).getTime() < Date.now() - 3_600_000) e.readyAt = 'Pick a pickup time that is not in the past.';
    if (f.receiverName.trim().length < 2) e.receiverName = 'Who receives the cargo?';
    if (!normalizeEthiopianPhone(f.receiverPhone)) e.receiverPhone = 'A valid mobile number, e.g. 091 655 2090.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(capacityPostId?: string) {
    if (!validate()) {
      toast.push('Check the highlighted fields.', true);
      return;
    }
    setBusy(capacityPostId ?? 'draft');
    try {
      const detail = await api<ShipmentDetailDto>('shipments', {
        body: {
          pickupPlaceId: f.pickupPlaceId,
          pickupAddress: f.pickupAddress.trim(),
          pickupContactName: f.pickupContactName.trim() || undefined,
          pickupContactPhone: f.pickupContactPhone.trim() || undefined,
          dropoffPlaceId: f.dropoffPlaceId,
          dropoffAddress: f.dropoffAddress.trim(),
          receiverName: f.receiverName.trim(),
          receiverPhone: f.receiverPhone.trim(),
          cargoType: f.cargoType,
          cargoDescription: f.note.trim() || undefined,
          pieces: f.pieces ? Number(f.pieces) : undefined,
          weightKg: weight,
          volumeM3: f.volumeM3 ? Number(f.volumeM3) : undefined,
          requirements: f.special,
          readyAt: readyIso,
          bookCapacityPostId: capacityPostId,
        },
      });
      toast.push(capacityPostId ? `${detail.ref} booked. The carrier has been asked to confirm.` : `${detail.ref} posted. Truck owners can now see it.`);
      router.push(`/shipper/shipments/${detail.id}`);
    } catch (err) {
      const e = err instanceof ApiError ? err : null;
      const savedId = (e?.details as { shipmentId?: string } | undefined)?.shipmentId;
      toast.push(e?.message ?? 'Could not save the shipment.', true);
      if (savedId) router.push(`/shipper/shipments/${savedId}`);
      setBusy(null);
    }
  }

  const err = (k: string) => errors[k] ?? null;

  return (
    <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 28 }}>
      <form className="col gap-20" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <div className="kicker">NEW SHIPMENT</div>
          <h1 className="h1 mt-4">What are you sending?</h1>
        </div>

        <div className="panel">
          <div className="p-20 col gap-14" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="row gap-14" style={{ alignItems: 'stretch' }}>
              <div className="col" style={{ alignItems: 'center', paddingTop: 24 }} aria-hidden>
                <span style={{ width: 12, height: 12, background: 'var(--ink)' }} />
                <span style={{ width: 2, flex: 1, background: 'var(--ink)', minHeight: 90 }} />
                <span style={{ width: 12, height: 12, border: '2px solid var(--ink)' }} />
              </div>
              <div className="col gap-14 grow">
                <div className="grid-auto" style={{ gridTemplateColumns: '1fr 1.6fr', gap: 10 }}>
                  <Field label="Pickup town" error={err('pickupPlaceId')}>
                    <Select value={f.pickupPlaceId} onChange={(e) => set('pickupPlaceId', e.target.value)} aria-label="Pickup town">
                      <option value="">Choose…</option>
                      {byName.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Pickup address" error={err('pickupAddress')}>
                    <Input value={f.pickupAddress} onChange={(e) => set('pickupAddress', e.target.value)} placeholder="Warehouse, Bole Bulbula" invalid={!!err('pickupAddress')} />
                  </Field>
                </div>
                <div className="grid-auto" style={{ gridTemplateColumns: '1fr 1.6fr', gap: 10 }}>
                  <Field label="Deliver to (town)" error={err('dropoffPlaceId')}>
                    <Select value={f.dropoffPlaceId} onChange={(e) => set('dropoffPlaceId', e.target.value)} aria-label="Drop-off town">
                      <option value="">Choose…</option>
                      {byName.filter((p) => p.id !== f.pickupPlaceId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="Delivery address" error={err('dropoffAddress')}>
                    <Input value={f.dropoffAddress} onChange={(e) => set('dropoffAddress', e.target.value)} placeholder="Piassa Coffee Traders, Hawassa" invalid={!!err('dropoffAddress')} />
                  </Field>
                </div>
              </div>
            </div>
          </div>

          <div className="p-20 grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14, borderBottom: '1px solid var(--border)' }}>
            <Field label="Cargo type">
              <Select value={f.cargoType} onChange={(e) => set('cargoType', e.target.value)}>
                {CARGO_TYPES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Pieces">
              <Input className="mono" inputMode="numeric" value={f.pieces} onChange={(e) => set('pieces', e.target.value.replace(/\D/g, ''))} placeholder="16" />
            </Field>
            <Field label="Weight" error={err('weightKg')}>
              <InputGroup after="kg">
                <Input className="mono" inputMode="numeric" value={f.weightKg} onChange={(e) => set('weightKg', e.target.value.replace(/\D/g, ''))} placeholder="800" aria-label="Weight in kilograms" style={{ fontWeight: 600 }} />
              </InputGroup>
            </Field>
            <Field label="Volume">
              <InputGroup after="m³">
                <Input className="mono" inputMode="decimal" value={f.volumeM3} onChange={(e) => set('volumeM3', e.target.value.replace(/[^\d.]/g, ''))} placeholder="2.4" aria-label="Volume in cubic metres" />
              </InputGroup>
            </Field>
          </div>

          <div className="p-20 col gap-14" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
              <Field label="Ready for pickup" error={err('readyAt')}>
                <Input type="datetime-local" value={f.readyAt} onChange={(e) => set('readyAt', e.target.value)} invalid={!!err('readyAt')} />
              </Field>
              <Field label="Pickup contact (optional)">
                <Input value={f.pickupContactName} onChange={(e) => set('pickupContactName', e.target.value)} placeholder="Hanna, loading bay 2" />
              </Field>
            </div>
            <div className="chips" role="group" aria-label="Special handling">
              {SPECIAL.map((s) => {
                const on = f.special.includes(s.key);
                return (
                  <button key={s.key} type="button" aria-pressed={on} className={`chip${on ? '' : ' chip-off'}`} onClick={() => set('special', on ? f.special.filter((x) => x !== s.key) : [...f.special, s.key])} style={{ cursor: 'pointer' }}>
                    {on ? '✓ ' : ''}{s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-20 grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
            <Field label="Receiver name" error={err('receiverName')}>
              <Input value={f.receiverName} onChange={(e) => set('receiverName', e.target.value)} placeholder="Dawit Alemu" invalid={!!err('receiverName')} />
            </Field>
            <Field label="Receiver phone" error={err('receiverPhone')}>
              <Input className="mono" inputMode="tel" value={f.receiverPhone} onChange={(e) => set('receiverPhone', e.target.value)} placeholder="+251 916 552 090" invalid={!!err('receiverPhone')} />
            </Field>
          </div>
        </div>
        <p className="small muted" style={{ lineHeight: 1.5 }}>The receiver gets an SMS with a delivery PIN when the truck departs. No app or account needed.</p>
        <div className="row gap-10 wrap">
          <Button type="submit" variant="outline" loading={busy === 'draft'} disabled={!!busy && busy !== 'draft'}>Post without choosing a truck</Button>
        </div>
      </form>

      <aside className="col gap-14" aria-live="polite">
        <div className="row between wrap gap-12" style={{ alignItems: 'flex-end' }}>
          <h2 className="h2">Transport options</h2>
          <span className="small muted">
            {preview ? `Sorted by fit · ${preview.options.length} of ${preview.totalTrucks} trucks on this corridor${preview.distanceKm ? ` · ${preview.distanceKm} km` : ''}` : ready ? 'Looking for trucks…' : 'Fill in route, weight and time'}
          </span>
        </div>

        {!ready ? (
          <div className="panel"><Empty title="Trucks will appear here">Choose where the cargo is going and how heavy it is. Raha shows trucks already heading that way, with the price.</Empty></div>
        ) : previewing && !preview ? (
          <div className="col gap-12">{[0, 1, 2].map((i) => <Skeleton key={i} height={132} />)}</div>
        ) : preview && preview.options.length === 0 ? (
          <div className="panel"><Empty title="No truck is going your way right now">Post the shipment anyway: drivers and brokers are alerted, and new space is matched as it is published.</Empty></div>
        ) : (
          <div className="col gap-12" style={{ opacity: previewing ? 0.6 : 1, transition: 'opacity .15s' }}>
            {preview?.options.map((o) => (
              <TruckOptionCard
                key={o.capacityPostId}
                option={o}
                action={
                  <Button variant={o.highlighted ? 'amber' : 'ink'} size="sm" loading={busy === o.capacityPostId} disabled={!!busy && busy !== o.capacityPostId} onClick={() => void submit(o.capacityPostId)}>
                    Book · {formatEtb(o.priceEtb, { prefix: false })}
                  </Button>
                }
              />
            ))}
          </div>
        )}
        <p className="small muted" style={{ lineHeight: 1.5 }}>Prices are set by carriers or their broker. Payment is recorded in Raha; you pay the carrier directly (Telebirr, CBE, cash).</p>
      </aside>
    </div>
  );
}
