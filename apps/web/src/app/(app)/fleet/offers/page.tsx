import type { Metadata } from 'next';
import { Empty, PageHeader } from '@raha/ui';
import type { FleetOfferDto } from '@raha/contracts';
import { OfferAction } from '@/components/fleet/FleetActions';
import { apiAsOrg } from '@/lib/raha';
import { formatEtb } from '@/lib/format';

export const metadata: Metadata = { title: 'Load offers' };

export default async function Offers() {
  const offers = await apiAsOrg<FleetOfferDto[]>('/fleet/offers');
  return (
    <main className="page-fluid">
      <PageHeader kicker="MATCHED TO YOUR PUBLISHED SPACE" title="Load offers" sub="Assign a load to a truck and the shipper confirms. Offers booked by shippers wait here for you to accept." />
      {offers.length === 0 ? (
        <div className="panel"><Empty title="No loads fit right now">Publish space on a truck to see loads that fit it.</Empty></div>
      ) : (
        <div className="panel divide">
          {offers.map((o) => (
            <div key={o.key} className="row between wrap gap-12" style={{ padding: '14px 18px' }}>
              <div style={{ minWidth: 0 }}>
                <div className="bold">{o.title} <span className="muted" style={{ fontWeight: 400 }}>{o.forLabel}</span></div>
                <div className="small muted">{o.subtitle}</div>
              </div>
              <div className="row gap-12"><span className="mono-strong">{formatEtb(o.priceEtb)}</span><OfferAction offer={o} /></div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
