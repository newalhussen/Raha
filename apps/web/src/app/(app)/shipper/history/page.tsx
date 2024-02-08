import type { Metadata } from 'next';
import { PageHeader, Stats } from '@raha/ui';
import type { ShipmentListDto } from '@raha/contracts';
import { ShipmentsTable } from '@/components/ShipmentsTable';
import { apiAsOrg } from '@/lib/raha';
import { formatEtbCompact } from '@/lib/format';

export const metadata: Metadata = { title: 'History' };

export default async function HistoryPage() {
  const data = await apiAsOrg<ShipmentListDto>('/shipments?tab=completed&pageSize=60');
  const delivered = data.items.filter((s) => s.status === 'delivered');
  const total = delivered.reduce((n, s) => n + (s.priceEtb ?? 0), 0);
  return (
    <main className="page">
      <PageHeader kicker="DELIVERED & CLOSED" title="History" />
      <Stats
        items={[
          { label: `Delivered · ${data.stats.monthLabel}`, value: data.stats.deliveredMonth },
          { label: `Spend · ${data.stats.monthLabel}`, value: formatEtbCompact(data.stats.spendMonthEtb) },
          { label: 'Shown below', value: delivered.length, sub: delivered.length ? formatEtbCompact(total) : undefined },
        ]}
      />
      <ShipmentsTable rows={data.items} basePath="/shipper/shipments" emptyTitle="No completed shipments yet" />
    </main>
  );
}
