import { ISSUE_FLAG_META, SHIPMENT_STATUS_META, type ShipmentSummaryDto } from '@raha/contracts';
import { StatusPill } from '@raha/ui';

/** Status chip for a shipment; an open issue overrides it with the red "Issue" chip, as in the design. */
export function ShipmentStatusPill({ s }: { s: Pick<ShipmentSummaryDto, 'status' | 'hasOpenIssue' | 'pendingOffers' | 'matchingTrucks'> }) {
  if (s.hasOpenIssue) return <StatusPill meta={ISSUE_FLAG_META} />;
  if (s.status === 'requested' && ((s.matchingTrucks ?? 0) > 0 || s.pendingOffers > 0)) {
    return <StatusPill meta={{ ...SHIPMENT_STATUS_META.requested, label: 'Choose offer' }} />;
  }
  return <StatusPill meta={SHIPMENT_STATUS_META[s.status]} />;
}
