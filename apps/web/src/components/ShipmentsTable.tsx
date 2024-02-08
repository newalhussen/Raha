import Link from 'next/link';
import { DataTable, Empty, buttonClass, type Column } from '@raha/ui';
import type { ShipmentSummaryDto } from '@raha/contracts';
import { ShipmentStatusPill } from '@/components/ShipmentBits';
import { formatKg, formatWhen, route } from '@/lib/format';

export const shipmentColumns: Column<ShipmentSummaryDto>[] = [
  { key: 'id', header: 'ID', width: '132px', render: (s) => <span className="mono small">{s.ref}</span> },
  {
    key: 'route',
    header: 'Route',
    width: '1.6fr',
    render: (s) => (
      <div>
        <div className="bold">{route(s.pickup, s.dropoff)}</div>
        <div className="xs muted">{s.shipperName} · ready {formatWhen(s.readyAt).toLowerCase()}</div>
      </div>
    ),
  },
  { key: 'cargo', header: 'Cargo', width: '1fr', render: (s) => <span>{s.cargoLabel.split(',')[0]} · {formatKg(s.weightKg)}</span> },
  {
    key: 'carrier',
    header: 'Carrier',
    width: '1fr',
    render: (s) =>
      s.carrier ? <span>{s.carrier.fleetName}</span> : s.status === 'requested' ? <span className="semi">{(s.matchingTrucks ?? 0) + s.pendingOffers > 0 ? `${(s.matchingTrucks ?? 0) + s.pendingOffers} offers` : '—'}</span> : <span className="muted">—</span>,
  },
  {
    key: 'progress',
    header: 'Progress',
    width: '1.2fr',
    render: (s) => (
      <div className="col gap-4">
        <div className="progress"><i style={{ width: `${s.progressPct}%` }} /></div>
        <span className="xs muted">{s.progressLabel}</span>
      </div>
    ),
  },
  { key: 'status', header: 'Status', width: '132px', render: (s) => <ShipmentStatusPill s={s} /> },
];

/** The shipments grid used by the shipper and broker consoles. */
export function ShipmentsTable({ rows, basePath, emptyTitle, canCreate }: { rows: ShipmentSummaryDto[]; basePath: string; emptyTitle: string; canCreate?: boolean }) {
  return (
    <DataTable
      columns={shipmentColumns}
      rows={rows}
      rowKey={(s) => s.id}
      href={(s) => `${basePath}/${s.id}`}
      minWidth={820}
      empty={
        <Empty title={emptyTitle} action={canCreate ? <Link href="/shipper/shipments/new" className={buttonClass({ variant: 'amber', size: 'sm' })}>+ New shipment</Link> : undefined}>
          Post what you’re sending and Raha shows trucks already heading that way.
        </Empty>
      }
    />
  );
}
