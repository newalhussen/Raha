import type {
  CapacityKind,
  FitKind,
  IssueKind,
  IssueStatus,
  MatchStatus,
  PaymentStatus,
  ShipmentStatus,
  TripStatus,
  VehicleStatus,
  VerificationStatus,
} from './enums';

/**
 * Visual tone of a status. Tones map to the identity colours:
 *   neutral = bone/grey (waiting), amber = Raha match / needs action,
 *   lapis = in transit, green = delivered / verified, red = issue, ink = solid dark.
 * Colour never carries meaning alone — every status also has a label and a distinct glyph.
 */
export type Tone = 'neutral' | 'amber' | 'lapis' | 'green' | 'red' | 'ink';

/** Glyph shapes keep statuses distinguishable without colour (colour-blind safe). */
export type Glyph = 'ring' | 'dot' | 'square' | 'diamond' | 'bar';

export interface StatusMeta {
  label: string;
  tone: Tone;
  glyph: Glyph;
}

export const SHIPMENT_STATUS_META: Record<ShipmentStatus, StatusMeta> = {
  requested: { label: 'Requested', tone: 'neutral', glyph: 'ring' },
  matched: { label: 'Matched', tone: 'amber', glyph: 'dot' },
  in_transit: { label: 'In transit', tone: 'lapis', glyph: 'dot' },
  delivered: { label: 'Delivered', tone: 'green', glyph: 'square' },
  cancelled: { label: 'Cancelled', tone: 'neutral', glyph: 'bar' },
};

export const ISSUE_FLAG_META: StatusMeta = { label: 'Issue', tone: 'red', glyph: 'diamond' };

export const TRIP_STATUS_META: Record<TripStatus, StatusMeta> = {
  planned: { label: 'Planned', tone: 'neutral', glyph: 'ring' },
  to_pickup: { label: 'To pickup', tone: 'amber', glyph: 'dot' },
  loading: { label: 'Loading', tone: 'amber', glyph: 'dot' },
  in_transit: { label: 'In transit', tone: 'lapis', glyph: 'dot' },
  completed: { label: 'Completed', tone: 'green', glyph: 'square' },
  cancelled: { label: 'Cancelled', tone: 'neutral', glyph: 'bar' },
};

export const VEHICLE_STATUS_META: Record<VehicleStatus, StatusMeta> = {
  on_trip: { label: 'On trip', tone: 'lapis', glyph: 'dot' },
  available: { label: 'Available', tone: 'amber', glyph: 'ring' },
  loading: { label: 'Loading', tone: 'neutral', glyph: 'dot' },
  off_road: { label: 'Off road', tone: 'red', glyph: 'diamond' },
};

export const VERIFICATION_STATUS_META: Record<VerificationStatus, StatusMeta> = {
  unverified: { label: 'Not submitted', tone: 'neutral', glyph: 'ring' },
  pending: { label: 'In review', tone: 'amber', glyph: 'dot' },
  verified: { label: 'Verified', tone: 'green', glyph: 'square' },
  rejected: { label: 'Rejected', tone: 'red', glyph: 'diamond' },
  expired: { label: 'Expired', tone: 'red', glyph: 'diamond' },
};

export const MATCH_STATUS_META: Record<MatchStatus, StatusMeta> = {
  pending_carrier: { label: 'Awaiting carrier', tone: 'amber', glyph: 'ring' },
  pending_shipper: { label: 'Awaiting shipper', tone: 'amber', glyph: 'ring' },
  confirmed: { label: 'Confirmed', tone: 'green', glyph: 'square' },
  declined: { label: 'Declined', tone: 'neutral', glyph: 'bar' },
  expired: { label: 'Expired', tone: 'neutral', glyph: 'bar' },
  cancelled: { label: 'Cancelled', tone: 'neutral', glyph: 'bar' },
};

export const PAYMENT_STATUS_META: Record<PaymentStatus, StatusMeta> = {
  pending: { label: 'Pending', tone: 'amber', glyph: 'ring' },
  paid: { label: 'Paid', tone: 'green', glyph: 'square' },
  disputed: { label: 'Disputed', tone: 'red', glyph: 'diamond' },
  cancelled: { label: 'Cancelled', tone: 'neutral', glyph: 'bar' },
};

export const ISSUE_STATUS_META: Record<IssueStatus, StatusMeta> = {
  open: { label: 'Open', tone: 'red', glyph: 'diamond' },
  in_progress: { label: 'In progress', tone: 'amber', glyph: 'dot' },
  waiting: { label: 'Waiting', tone: 'neutral', glyph: 'ring' },
  resolved: { label: 'Resolved', tone: 'green', glyph: 'square' },
  closed: { label: 'Closed', tone: 'neutral', glyph: 'bar' },
};

export const ISSUE_KIND_LABEL: Record<IssueKind, string> = {
  dispute: 'DISPUTE',
  late: 'LATE',
  match: 'MATCH',
  support: 'SUPPORT',
  safety: 'SAFETY',
  document: 'DOCUMENT',
};

/** Tag shown on a truck option, e.g. "SAME TRIP · 2 T SPARE". */
export const FIT_KIND_TAG: Record<FitKind, string> = {
  same_trip: 'SAME TRIP',
  empty_return: 'EMPTY RETURN',
  partial: 'PARTIAL',
  dedicated: 'DEDICATED',
};

export const CAPACITY_KIND_LABEL: Record<CapacityKind, string> = {
  on_route: 'On route',
  return_leg: 'Return leg',
  dedicated: 'Dedicated',
};
