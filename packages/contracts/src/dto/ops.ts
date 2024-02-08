import type {
  DocumentKind,
  DocumentStatus,
  IssueKind,
  IssueStatus,
  MemberRole,
  OrgType,
  StaffRole,
  TripStatus,
  UserStatus,
  VerificationCaseStatus,
  VerificationStatus,
  VerificationSubject,
} from '../enums';
import type { CorridorStripDto, PlaceDto } from './common';

// ───────────────────────────── control room ─────────────────────────────

export interface OpsStatsDto {
  tripsOnRoad: number;
  openLoads: number;
  trucksWithSpace: number;
  matchesToday: number;
  /** % of trips on the road carrying cargo for more than one shipper. */
  sharedLoadSharePct: number;
  lateCheckins: number;
}

export interface CorridorDotDto {
  /** 0–100 along the corridor from its origin. */
  x: number;
  kind: 'ok' | 'shared' | 'late';
  tripId: string;
}

export interface CorridorBoardRowDto {
  corridorId: string;
  name: string;
  /** "275 km · via Mojo" */
  detail: string;
  trips: number;
  dots: CorridorDotDto[];
}

export interface NeedsHumanDto {
  key: string;
  kind: 'DISPUTE' | 'LATE' | 'MATCH' | 'SUPPORT' | 'SAFETY' | 'DOCUMENT';
  title: string;
  body: string;
  action: string;
  primary: boolean;
  /** Where the action leads inside the ops app. */
  href: string;
  createdAt: string;
}

export interface DeliveryReviewDto {
  shipmentId: string;
  ref: string;
  caption: string;
  tone: 'ok' | 'warn';
  photoUrl: string | null;
}

export interface OpsOverviewDto {
  stats: OpsStatsDto;
  corridors: CorridorBoardRowDto[];
  needsHuman: NeedsHumanDto[];
  deliveryReview: { items: DeliveryReviewDto[]; flaggedToday: number; deliveriesToday: number };
  loadFactor: { series: Array<{ label: string; pct: number }>; currentPct: number };
  generatedAt: string;
  counts: { verification: number; support: number; disputes: number };
}

// ───────────────────────────── verification ─────────────────────────────

export interface VerificationQueueItemDto {
  caseId: string;
  type: VerificationSubject;
  subjectId: string;
  name: string;
  subtitle: string;
  ageLabel: string;
  status: VerificationCaseStatus;
  assignedTo: string | null;
}

export interface VerificationQueueDto {
  items: VerificationQueueItemDto[];
  counts: { driver: number; vehicle: number; organization: number; total: number };
}

export interface VerificationDocumentDto {
  id: string;
  kind: DocumentKind;
  label: string;
  status: DocumentStatus;
  number: string | null;
  expiresOn: string | null;
  url: string | null;
  /** What the reviewer is told to look at, e.g. "Grade 5 (Heavy truck) · readable" or "Face partly covered". */
  hint: string;
  hintState: 'ok' | 'check';
  note: string | null;
}

export interface VerificationCaseDto {
  caseId: string;
  type: VerificationSubject;
  status: VerificationCaseStatus;
  subject: { id: string; name: string; subtitle: string; phone: string | null; initials: string; verification: VerificationStatus };
  documents: VerificationDocumentDto[];
  facts: Array<{ label: string; value: string; ok?: boolean }>;
  missing: string[];
  history: Array<{ at: string; by: string | null; action: string; note: string | null }>;
  submittedAt: string;
  decisionNote: string | null;
}

// ───────────────────────────── trips ─────────────────────────────

export interface OpsTripRowDto {
  tripId: string;
  ref: string;
  status: TripStatus;
  route: string;
  driverName: string;
  driverPhone: string;
  plate: string;
  fleetName: string;
  loads: number;
  weightKg: number;
  shared: boolean;
  progressPct: number;
  lastLabel: string;
  lateHours: number | null;
  etaAt: string | null;
  tone: 'lapis' | 'amber' | 'red' | 'green' | 'neutral';
  stateLabel: string;
}

export interface OpsTripDetailDto extends OpsTripRowDto {
  strip: CorridorStripDto;
  loadRows: Array<{ shipmentId: string; ref: string; shipperName: string; weightKg: number; status: string; receiverName: string; receiverPhone: string; dropoff: string; isRahaMatch: boolean }>;
  checkins: Array<{ placeName: string; at: string; channel: string; offline: boolean }>;
  places: PlaceDto[];
}

// ───────────────────────────── matching assist ─────────────────────────────

export interface OpsMatchRowDto {
  shipmentId: string;
  ref: string;
  route: string;
  weightKg: number;
  shipperName: string;
  ageMinutes: number;
  candidates: number;
  source: string;
  readyAt: string;
  pendingProposals: number;
}

// ───────────────────────────── directory ─────────────────────────────

export interface OpsUserRowDto {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: UserStatus;
  isStaff: boolean;
  staffRole: StaffRole | null;
  memberships: Array<{ orgId: string; orgName: string; orgType: OrgType; role: MemberRole; status: string }>;
  isDriver: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface OpsOrgRowDto {
  id: string;
  type: OrgType;
  name: string;
  city: string | null;
  phone: string | null;
  tin: string | null;
  verification: VerificationStatus;
  members: number;
  vehicles: number;
  shipments: number;
  managedBy: string | null;
  createdAt: string;
}

// ───────────────────────────── support ─────────────────────────────

export interface IssueDto {
  id: string;
  ref: string;
  kind: IssueKind;
  status: IssueStatus;
  priority: number;
  title: string;
  body: string | null;
  shipment: { id: string; ref: string } | null;
  trip: { id: string; ref: string } | null;
  raisedBy: string | null;
  orgName: string | null;
  assignedTo: { id: string; name: string } | null;
  actionHint: string | null;
  resolution: string | null;
  createdAt: string;
  ageLabel: string;
  resolvedAt: string | null;
}

export interface IssueDetailDto extends IssueDto {
  comments: Array<{ id: string; author: string; body: string; internal: boolean; createdAt: string }>;
}

export interface AuditEntryDto {
  id: string;
  at: string;
  actor: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  data: Record<string, unknown>;
}
