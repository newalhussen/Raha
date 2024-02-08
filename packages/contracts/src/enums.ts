/**
 * Domain vocabulary. The database stores these as `text` + CHECK constraints
 * (see apps/api/src/database/migrations), so every list here must stay in sync with SQL.
 */

export const ORG_TYPES = ['shipper', 'fleet', 'brokerage'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const MEMBER_ROLES = ['owner', 'manager', 'staff', 'dispatcher', 'driver'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended', 'removed'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const STAFF_ROLES = ['support', 'verifier', 'finance', 'admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const LANGUAGES = ['en', 'am'] as const;
export type Language = (typeof LANGUAGES)[number];

export const CLIENT_APPS = ['web', 'driver', 'ops'] as const;
export type ClientApp = (typeof CLIENT_APPS)[number];

/** Verification state carried on drivers, vehicles and organizations. */
export const VERIFICATION_STATUSES = ['unverified', 'pending', 'verified', 'rejected', 'expired'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_SUBJECTS = ['driver', 'vehicle', 'organization'] as const;
export type VerificationSubject = (typeof VERIFICATION_SUBJECTS)[number];

export const VERIFICATION_CASE_STATUSES = ['pending', 'in_review', 'approved', 'rejected', 'needs_reupload'] as const;
export type VerificationCaseStatus = (typeof VERIFICATION_CASE_STATUSES)[number];

export const DOCUMENT_KINDS = [
  'driving_licence',
  'fayda_id',
  'selfie',
  'insurance',
  'libre',
  'vehicle_photo',
  'trade_licence',
  'tin_certificate',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const BODY_TYPES = ['dry_box', 'flatbed', 'tipper', 'refrigerated', 'tanker', 'container', 'pickup'] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export const VEHICLE_STATUSES = ['available', 'on_trip', 'loading', 'off_road'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const PLACE_KINDS = ['city', 'town', 'terminal', 'port'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

/** How a capacity post relates to the truck's journey. */
export const CAPACITY_KINDS = ['on_route', 'return_leg', 'dedicated'] as const;
export type CapacityKind = (typeof CAPACITY_KINDS)[number];

export const CAPACITY_STATUSES = ['open', 'full', 'departed', 'closed', 'expired', 'cancelled'] as const;
export type CapacityStatus = (typeof CAPACITY_STATUSES)[number];

export const SHIPMENT_STATUSES = ['requested', 'matched', 'in_transit', 'delivered', 'cancelled'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_SOURCES = ['app', 'phone', 'telegram', 'broker', 'fleet', 'ops'] as const;
export type ShipmentSource = (typeof SHIPMENT_SOURCES)[number];

export const MATCH_STATUSES = ['pending_carrier', 'pending_shipper', 'confirmed', 'declined', 'expired', 'cancelled'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_PROPOSERS = ['shipper', 'carrier', 'broker', 'fleet', 'system', 'ops'] as const;
export type MatchProposer = (typeof MATCH_PROPOSERS)[number];

/** Presentation tag for how a truck fits a load (drives labels like "SAME TRIP · 2 T SPARE"). */
export const FIT_KINDS = ['same_trip', 'empty_return', 'partial', 'dedicated'] as const;
export type FitKind = (typeof FIT_KINDS)[number];

export const TRIP_STATUSES = ['planned', 'to_pickup', 'loading', 'in_transit', 'completed', 'cancelled'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_LOAD_STATUSES = ['assigned', 'arrived_pickup', 'picked_up', 'in_transit', 'delivered', 'failed'] as const;
export type TripLoadStatus = (typeof TRIP_LOAD_STATUSES)[number];

export const CHECKIN_CHANNELS = ['app', 'sms', 'telegram', 'ops'] as const;
export type CheckinChannel = (typeof CHECKIN_CHANNELS)[number];

export const PROOF_KINDS = ['pickup_photo', 'waybill', 'delivery_photo', 'damage_photo'] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];

export const DELIVERY_CONFIRMATIONS = ['pin', 'receiver_link', 'shipper_manual', 'ops'] as const;
export type DeliveryConfirmation = (typeof DELIVERY_CONFIRMATIONS)[number];

export const DELIVERY_CONDITIONS = ['all_good', 'short_count', 'damaged'] as const;
export type DeliveryCondition = (typeof DELIVERY_CONDITIONS)[number];

export const PAYMENT_METHODS = ['telebirr', 'cbe', 'bank', 'cash', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'paid', 'disputed', 'cancelled'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ['in_app', 'push', 'sms', 'telegram', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ['queued', 'sent', 'failed', 'read', 'skipped'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const ISSUE_KINDS = ['dispute', 'late', 'match', 'support', 'safety', 'document'] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

export const ISSUE_STATUSES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const INBOUND_CHANNELS = ['telegram', 'sms', 'call', 'app'] as const;
export type InboundChannel = (typeof INBOUND_CHANNELS)[number];

/** Cargo categories offered in the shipment form. `requires` feeds matching (body type needs). */
export const CARGO_TYPES = [
  { key: 'coffee', label: 'Coffee, sacked', labelAm: 'ቡና', unit: 'sacks', requires: ['covered'] },
  { key: 'cereals', label: 'Cereals & grain', labelAm: 'እህል', unit: 'sacks', requires: ['covered'] },
  { key: 'cement', label: 'Cement, bagged', labelAm: 'ሲሚንቶ', unit: 'bags', requires: ['covered'] },
  { key: 'packaged_food', label: 'Packaged foods', labelAm: 'የታሸገ ምግብ', unit: 'cartons', requires: ['covered'] },
  { key: 'textiles', label: 'Textiles', labelAm: 'ጨርቃ ጨርቅ', unit: 'bales', requires: ['covered'] },
  { key: 'produce', label: 'Fresh produce', labelAm: 'ትኩስ ምርት', unit: 'crates', requires: ['covered', 'perishable'] },
  { key: 'medical', label: 'Medical supplies', labelAm: 'የህክምና እቃዎች', unit: 'boxes', requires: ['covered', 'fragile'] },
  { key: 'furniture', label: 'Furniture', labelAm: 'የቤት እቃ', unit: 'pieces', requires: ['covered', 'fragile'] },
  { key: 'building', label: 'Building materials', labelAm: 'የግንባታ እቃ', unit: 'pieces', requires: [] },
  { key: 'machinery', label: 'Machinery', labelAm: 'ማሽነሪ', unit: 'units', requires: ['flatbed'] },
  { key: 'containers', label: 'Container', labelAm: 'ኮንቴነር', unit: 'containers', requires: ['container'] },
  { key: 'other', label: 'Other', labelAm: 'ሌላ', unit: 'pieces', requires: [] },
] as const;
export type CargoTypeKey = (typeof CARGO_TYPES)[number]['key'];
