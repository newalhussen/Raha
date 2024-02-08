import Link from 'next/link';
import {
  ISSUE_FLAG_META,
  PAYMENT_STATUS_META,
  SHIPMENT_STATUS_META,
  formatEtb,
  formatKg,
  formatPhone,
  formatTime,
  formatWhen,
  type ShipmentDetailDto,
} from '@raha/contracts';
import { Avatar, CapacityBar, CapacityLegend, CorridorStrip, Icon, KeyValue, Notice, Photo, Pill, StatusPill } from '@raha/ui';
import { Chat } from './Chat';
import { CopyLink, MarkPaid, ShipmentActions } from './Actions';
import { OptionsPanel } from './OptionsPanel';

/**
 * One shipment, end to end: where it is (corridor strip), who is carrying it, proof, messages, delivery PIN,
 * payment and the full timeline. Used by shippers and by brokers handling the load.
 */
export function ShipmentDetailView({ s, viewerName, canPost, canRecordPayment, backHref, backLabel }: { s: ShipmentDetailDto; viewerName: string; canPost: boolean; canRecordPayment: boolean; backHref: string; backLabel: string }) {
  const statusMeta = s.hasOpenIssue ? ISSUE_FLAG_META : SHIPMENT_STATUS_META[s.status];
  const pickupProof = s.proofs.filter((p) => p.kind === 'pickup_photo' || p.kind === 'waybill');
  const deliveryProof = s.proofs.filter((p) => p.kind === 'delivery_photo' || p.kind === 'damage_photo');

  return (
    <main className="page">
      <div className="row between wrap gap-16" style={{ alignItems: 'flex-end' }}>
        <div className="col gap-6">
          <Link href={backHref} className="small muted" style={{ textDecoration: 'none' }}>← {backLabel}</Link>
          <div className="row gap-10 wrap">
            <span className="mono muted">{s.ref}</span>
            <StatusPill meta={statusMeta} />
            {s.source !== 'app' ? <Pill tone="neutral" glyph={null}>logged by {s.loggedByName ?? s.source}</Pill> : null}
          </div>
          <h1 className="h1" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>{s.pickup.name} → {s.dropoff.name}</h1>
          <div className="small muted">{s.shipperName} · {s.cargoLabel}{s.pieces ? ` · ${s.pieces} pcs` : ''} · {formatKg(s.weightKg)}</div>
        </div>
        <div className="col" style={{ alignItems: 'flex-end', gap: 12 }}>
          {s.status === 'in_transit' && s.etaAt ? (
            <div className="right">
              <div className="small muted">Estimated arrival</div>
              <div className="mono-strong" style={{ fontSize: 22 }}>{formatWhen(s.etaAt)}</div>
            </div>
          ) : s.status === 'delivered' && s.delivery ? (
            <div className="right">
              <div className="small muted">Delivered</div>
              <div className="mono-strong" style={{ fontSize: 22 }}>{formatWhen(s.delivery.deliveredAt)}</div>
            </div>
          ) : (
            <div className="right">
              <div className="small muted">Ready for pickup</div>
              <div className="mono-strong" style={{ fontSize: 22 }}>{formatWhen(s.readyAt)}</div>
            </div>
          )}
          <ShipmentActions shipmentId={s.id} ref_={s.ref} canCancel={s.canCancel} canConfirm={s.canConfirmManually} />
        </div>
      </div>

      {s.hasOpenIssue ? <Notice tone="error">Raha Operations is looking into a problem with this delivery. We’ll message you here and by SMS.</Notice> : null}

      {s.status === 'requested' ? <OptionsPanel shipmentId={s.id} matches={s.matches} canBook={s.canBook} /> : null}

      {s.strip ? (
        <section className="panel p-24" aria-label="Progress">
          <div className="row between wrap gap-8" style={{ marginBottom: 14 }}>
            <span className="kicker">CORRIDOR · {s.strip.corridorName.toUpperCase()}</span>
            <span className="xs muted">Updated from driver check-ins · no live GPS</span>
          </div>
          <CorridorStrip strip={s.strip} />
        </section>
      ) : null}

      <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 330px), 1fr))' }}>
        <div className="col gap-20">
          {s.carrier ? (
            <section className="panel panel-pad">
              <span className="kicker">CARRIER</span>
              <div className="row gap-12">
                <Avatar name={s.carrier.driverName} size={48} />
                <div style={{ minWidth: 0 }}>
                  <div className="bold" style={{ fontSize: 16 }}>{s.carrier.driverName}</div>
                  <div className="small muted">{s.carrier.viaBroker ? `via ${s.carrier.viaBroker}` : s.carrier.fleetName} · {s.carrier.tripsOnRaha} trips on Raha</div>
                </div>
              </div>
              <div className="kv-grid">
                <div><div className="k">Plate</div><div className="mono-strong">{s.carrier.plate}</div></div>
                <div><div className="k">Truck</div><div className="semi">{s.carrier.vehicleLabel}</div></div>
              </div>
              {s.bar ? (
                <div className="col gap-6">
                  <CapacityBar bar={s.bar} height={12} />
                  <span className="xs soft">{s.barNote}</span>
                  <CapacityLegend ink="Other cargo" amber="Your cargo" />
                </div>
              ) : null}
              <div className="grid-auto" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <a className="btn btn-outline btn-sm" href={`tel:${s.carrier.driverPhone}`}><Icon name="phone" size={16} />Call driver</a>
                <CopyLink url={s.receiverLink} />
              </div>
            </section>
          ) : null}

          <section className="panel panel-pad">
            <span className="kicker">PROOF</span>
            {s.proofs.length === 0 ? (
              <p className="small muted">Pickup photos and the delivery photo appear here, time-stamped.</p>
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {pickupProof.slice(0, 2).map((p) => <Photo key={p.id} src={p.url} tag={p.label} alt={p.label} />)}
              {deliveryProof.length > 0 ? deliveryProof.slice(0, 1).map((p) => <Photo key={p.id} src={p.url} tag={p.label} alt={p.label} />) : <div className="photo" style={{ background: 'none', border: '1px dashed var(--border-strong)', display: 'grid', placeItems: 'center', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', padding: 6 }}>Delivery photo on arrival</div>}
            </div>
          </section>
        </div>

        <Chat shipmentId={s.id} canPost={canPost && !['delivered', 'cancelled'].includes(s.status)} who={viewerName} />

        <div className="col gap-20">
          <section className="panel panel-pad">
            <span className="kicker">DELIVERY</span>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>
              {s.receiver.name} (<span className="mono">{formatPhone(s.receiver.phone)}</span>) holds the PIN{' '}
              <span className="mono-strong" style={{ letterSpacing: '0.1em' }}>••••</span>. The driver enters it on hand-over.
            </p>
            <KeyValue
              rows={[
                ['Cargo', `${s.cargoLabel.split(',')[0]}${s.pieces ? ` · ${s.pieces} pcs` : ''} · ${formatKg(s.weightKg)}`],
                ['Pickup', <span key="p">{s.pickupAddress}</span>],
                ['Deliver to', <span key="d">{s.dropoffAddress}</span>],
                ['Agreed price', <span key="pr" className="mono">{s.priceEtb ? formatEtb(s.priceEtb) : '—'}</span>],
                [
                  'Payment',
                  s.payment ? (
                    <span key="pay" className={s.payment.status === 'paid' ? 'text-green semi' : 'text-amber semi'}>{PAYMENT_STATUS_META[s.payment.status as keyof typeof PAYMENT_STATUS_META]?.label ?? s.payment.status}{s.payment.method ? ` · ${s.payment.method}` : ''}</span>
                  ) : (
                    <span key="pay" className="text-amber semi">{s.status === 'delivered' ? '—' : 'To record on delivery'}</span>
                  ),
                ],
              ]}
            />
            {s.delivery ? (
              <div className="notice" style={{ background: 'var(--green-tint)', color: 'var(--green-ink)', borderLeftColor: 'var(--green)' }}>
                Received {formatTime(s.delivery.deliveredAt)} · {s.delivery.pinVerified ? 'PIN confirmed' : s.delivery.confirmedBy.replace('_', ' ')}
                {s.delivery.condition !== 'all_good' ? ` · ${s.delivery.condition.replace('_', ' ')}${s.delivery.receivedCount != null ? ` (${s.delivery.receivedCount}/${s.delivery.expectedCount ?? '?'})` : ''}` : ''}
              </div>
            ) : null}
            {s.payment && s.payment.status === 'pending' && canRecordPayment ? <MarkPaid payment={s.payment} label="Record payment" /> : null}
          </section>

          <section className="panel panel-pad">
            <span className="kicker">TIMELINE</span>
            <ol className="col gap-10" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {[...s.timeline].reverse().map((e, i) => (
                <li key={i} className="row-top gap-10">
                  <span aria-hidden style={{ width: 9, height: 9, marginTop: 6, flex: 'none', background: e.tone === 'green' ? 'var(--green)' : e.tone === 'lapis' ? 'var(--lapis)' : e.tone === 'amber' ? 'var(--amber)' : e.tone === 'red' ? 'var(--red)' : 'var(--stone)', borderRadius: e.tone === 'lapis' ? '50%' : 0 }} />
                  <div className="col" style={{ minWidth: 0 }}>
                    <span className="small semi">{e.label}</span>
                    <span className="xs muted">{formatWhen(e.at)}{e.detail ? ` · ${e.detail}` : ''}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </main>
  );
}
