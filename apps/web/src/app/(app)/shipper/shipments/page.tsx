import Link from 'next/link';
import type { Metadata } from 'next';
import { PageHeader, RahaMark, Stats, TabLinks, buttonClass } from '@raha/ui';
import type { OrganizationDto, ShipmentListDto } from '@raha/contracts';
import { AutoRefresh } from '@/components/AutoRefresh';
import { ShipmentsTable } from '@/components/ShipmentsTable';
import { apiAsOrg } from '@/lib/raha';
import { formatEtbCompact, formatKg } from '@/lib/format';

export const metadata: Metadata = { title: 'Shipments' };

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tab: rawTab, q } = await searchParams;
  const tab = rawTab === 'completed' || rawTab === 'all' ? rawTab : 'active';
  const [data, org] = await Promise.all([
    apiAsOrg<ShipmentListDto>(`/shipments?tab=${tab}&pageSize=40${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    apiAsOrg<OrganizationDto>('/orgs/current'),
  ]);
  const { stats, offerBanner } = data;

  return (
    <main className="page">
      <AutoRefresh seconds={30} />
      <PageHeader
        kicker={`${org.name.toUpperCase()} · ${org.memberCount} MEMBER${org.memberCount === 1 ? '' : 'S'}`}
        title="Shipments"
        aside={
          <>
            <form action="/shipper/shipments" className="row gap-8">
              <input type="hidden" name="tab" value={tab} />
              <input className="input" name="q" defaultValue={q ?? ''} placeholder="Search ID, town, cargo" style={{ width: 220, height: 38 }} aria-label="Search shipments" />
            </form>
            <TabLinks
              items={[
                { href: '/shipper/shipments?tab=active', label: `Active${tab === 'active' ? ` · ${data.total}` : ''}`, on: tab === 'active' },
                { href: '/shipper/shipments?tab=completed', label: 'Completed', on: tab === 'completed' },
                { href: '/shipper/shipments?tab=all', label: 'All', on: tab === 'all' },
              ]}
            />
          </>
        }
      />

      <Stats
        items={[
          { label: 'In transit', value: stats.inTransit },
          { label: 'Awaiting your choice', value: stats.awaitingChoice, sub: stats.offersTotal ? `${stats.offersTotal} offers` : undefined },
          { label: `Delivered · ${stats.monthLabel}`, value: stats.deliveredMonth },
          { label: `Spend · ${stats.monthLabel}`, value: formatEtbCompact(stats.spendMonthEtb) },
        ]}
      />

      {offerBanner ? (
        <section className="panel panel-dark" style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 20, alignItems: 'center' }}>
          <div className="row gap-14">
            <RahaMark size={40} />
            <div>
              <div className="bold" style={{ fontSize: 16 }}>{offerBanner.ref} has {offerBanner.offers} transport offer{offerBanner.offers === 1 ? '' : 's'}</div>
              <div className="small" style={{ color: '#c9c4b8' }}>
                {offerBanner.route} · {formatKg(offerBanner.weightKg)} ·{' '}
                {offerBanner.sameTripCount > 0 ? `${offerBanner.sameTripCount} ${offerBanner.sameTripCount === 1 ? 'is a truck' : 'are trucks'} already going there with space.` : 'Trucks are available on this corridor.'}
              </div>
            </div>
          </div>
          <div className="row end">
            <Link href={`/shipper/shipments/${offerBanner.shipmentId}`} className={buttonClass({ variant: 'amber' })}>Compare offers →</Link>
          </div>
        </section>
      ) : null}

      <ShipmentsTable rows={data.items} basePath="/shipper/shipments" emptyTitle={q ? `No shipments match “${q}”` : 'No shipments yet'} canCreate />
    </main>
  );
}
