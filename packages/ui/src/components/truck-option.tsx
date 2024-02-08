import type { ReactNode } from 'react';
import { formatEtb, formatTime, formatWhen, type TruckOptionDto } from '@raha/contracts';
import { RahaMark } from './brand';
import { CapacityBar } from './signature';
import { Avatar } from './layout';

/**
 * One transport option for a shipment: who, which truck, how much of it is yours, when, how much.
 * The amber banner is only shown for trucks that are already going that way or running empty.
 */
export function TruckOptionCard({ option, action, now }: { option: TruckOptionDto; action?: ReactNode; now?: Date }) {
  const o = option;
  return (
    <div className={`option${o.highlighted ? ' highlight' : ''}`}>
      {o.highlighted && o.fitBanner ? (
        <div className="option-banner">
          <RahaMark size={14} tone="on-amber" />
          {o.fitBanner}
        </div>
      ) : null}
      <div className="option-body">
        <div className="col gap-10" style={{ minWidth: 0 }}>
          <div className="row gap-12">
            <Avatar name={o.driver.name} size={40} />
            <div style={{ minWidth: 0 }}>
              <div className="bold">
                {o.driver.name} {o.driver.verified ? <span className="small semi text-green" style={{ fontWeight: 500 }}>✓ verified</span> : null}
              </div>
              <div className="small muted">
                {o.viaBroker ? `via ${o.viaBroker}` : o.fleetName} · <span className="mono">{o.plate}</span>
              </div>
            </div>
          </div>
          <div className="col gap-4">
            <CapacityBar bar={o.bar} height={14} />
            <span className="xs soft">{o.capacityNote}</span>
          </div>
          <span className="small soft">
            Pickup {formatWhen(o.pickupAt, now).replace(/^Today /, '')} · departs {formatTime(o.departsAt)} · arrives ~{formatTime(o.etaAt)}
          </span>
        </div>
        <div className="col between" style={{ alignItems: 'flex-end', gap: 10 }}>
          <div className="right">
            <div className="mono-strong" style={{ fontSize: 19 }}>{formatEtb(o.priceEtb)}</div>
            <div className="xs muted">{o.priceNote}</div>
          </div>
          {action}
        </div>
      </div>
    </div>
  );
}
