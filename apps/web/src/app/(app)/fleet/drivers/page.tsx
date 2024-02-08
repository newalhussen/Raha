import type { Metadata } from 'next';
import { Avatar, DataTable, PageHeader, Pill, StatusPill, type Column } from '@raha/ui';
import { VERIFICATION_STATUS_META, formatPhone, type DriverSummaryDto } from '@raha/contracts';
import { InviteDriver } from '@/components/fleet/FleetActions';
import { apiAsOrg } from '@/lib/raha';

export const metadata: Metadata = { title: 'Drivers' };

const columns: Column<DriverSummaryDto>[] = [
  { key: 'n', header: 'Driver', width: '1.6fr', render: (d) => <div className="row gap-10"><Avatar name={d.fullName} size={34} /><div><div className="bold">{d.fullName}</div><div className="mono xs muted">{formatPhone(d.phone)}</div></div></div> },
  { key: 'truck', header: 'Truck', width: '120px', render: (d) => <span className="mono small">{d.plate ?? '—'}</span> },
  { key: 'ch', header: 'Reached by', width: '130px', render: (d) => <Pill tone={d.channel === 'app' ? 'green' : d.channel === 'telegram' ? 'neutral' : 'amber'} glyph={d.channel === 'invited' ? 'ring' : 'dot'}>{d.channel === 'app' ? 'App' : d.channel === 'telegram' ? 'Telegram only' : 'Invited'}</Pill> },
  { key: 'ver', header: 'Verification', width: '120px', render: (d) => <StatusPill meta={VERIFICATION_STATUS_META[d.verification]} /> },
  { key: 'note', header: 'Documents', width: '1fr', render: (d) => <span className={d.warn ? 'semi text-amber' : 'small muted'}>{d.note}</span> },
  { key: 'trips', header: 'Trips', width: '80px', render: (d) => <span className="mono">{d.tripsCompleted}</span> },
];

export default async function Drivers() {
  const rows = await apiAsOrg<DriverSummaryDto[]>('/fleet/drivers');
  return (
    <main className="page-fluid">
      <PageHeader kicker="YOUR DRIVERS" title="Drivers" aside={<InviteDriver />} sub="Raha Operations checks each driver’s licence and Fayda ID before they can take loads." />
      <DataTable columns={columns} rows={rows} rowKey={(d) => d.userId} minWidth={860} empty="Invite your first driver." />
    </main>
  );
}
