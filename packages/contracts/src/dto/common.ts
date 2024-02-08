import type {
  CheckinChannel,
  Language,
  MemberRole,
  MembershipStatus,
  OrgType,
  StaffRole,
  VerificationStatus,
} from '../enums';
import type { OrgPermission, StaffPermission } from '../permissions';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  /** Machine-readable code, e.g. `capacity_exceeded`. */
  code?: string;
  details?: unknown;
}

export interface PlaceDto {
  id: string;
  code: string;
  name: string;
  nameAm: string | null;
  lat: number;
  lng: number;
}

export interface CorridorDto {
  id: string;
  code: string;
  name: string;
  distanceKm: number;
  via: string | null;
  origin: PlaceDto;
  destination: PlaceDto;
  stops: { place: PlaceDto; kmFromOrigin: number }[];
}

/** Presentational bar used everywhere a truck's load is drawn: ink = aboard, amber = Raha match, hatched = free. */
export interface CapacityBarDto {
  totalKg: number;
  inkKg: number;
  amberKg: number;
  freeKg: number;
}

export interface StripStopDto {
  placeId: string;
  code: string;
  name: string;
  nameAm: string | null;
  kind: 'origin' | 'town' | 'destination';
  state: 'done' | 'current' | 'upcoming';
  /** Time of the check-in / pickup for done+current stops. */
  at: string | null;
  /** Short caption such as "Picked up 06:40", "Driver check-in 10:12" or "ETA 13:30". */
  label: string | null;
  channel: CheckinChannel | null;
  /** Check-in recorded on the phone but not yet delivered to the server. */
  pendingSync?: boolean;
}

/** Milestone-based progress of a trip along its corridor (no live GPS). */
export interface CorridorStripDto {
  corridorName: string;
  direction: 'forward' | 'reverse';
  stops: StripStopDto[];
  etaAt: string | null;
  progressPct: number;
}

export interface UserDto {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  language: Language;
  isStaff: boolean;
  staffRole: StaffRole | null;
  telegramLinked: boolean;
  notifyTelegram: boolean;
  notifySms: boolean;
  notifyCall: boolean;
  dataSaver: boolean;
}

export interface MembershipDto {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationType: OrgType;
  organizationVerification: VerificationStatus;
  role: MemberRole;
  status: MembershipStatus;
  permissions: OrgPermission[];
}

export interface SessionDto {
  user: UserDto;
  memberships: MembershipDto[];
  staffPermissions: StaffPermission[];
}

export interface TokensDto {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

export interface AuthResultDto extends SessionDto {
  tokens: TokensDto;
  /** True for a brand-new driver account that still has to complete onboarding. */
  needsProfile: boolean;
}

export interface OtpRequestResultDto {
  sent: true;
  expiresInSeconds: number;
  resendInSeconds: number;
  /** Only present when the server runs with OTP_DEV_ECHO=true. */
  devCode?: string;
}

export interface OrganizationDto {
  id: string;
  type: OrgType;
  name: string;
  nameAm: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  tin: string | null;
  tradeLicenceNo: string | null;
  verification: VerificationStatus;
  memberCount: number;
  createdAt: string;
}

export interface MemberDto {
  membershipId: string;
  userId: string;
  fullName: string;
  phone: string;
  role: MemberRole;
  status: MembershipStatus;
  /** How this person is reached today. */
  channel: 'app' | 'telegram' | 'sms' | 'invited';
  lastSeenAt: string | null;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  tone: 'amber' | 'lapis' | 'green' | 'neutral';
  /** e.g. "also sent by Telegram". */
  footnote: string | null;
  createdAt: string;
  read: boolean;
  data: Record<string, unknown>;
}

export interface MessageDto {
  id: string;
  senderName: string;
  senderLabel: string | null;
  mine: boolean;
  channel: 'app' | 'sms' | 'telegram' | 'system';
  body: string;
  createdAt: string;
}

export interface PaymentDto {
  id: string;
  shipmentId: string;
  shipmentRef: string;
  route: string;
  payerName: string;
  payeeName: string;
  amountEtb: number;
  method: string | null;
  reference: string | null;
  status: string;
  dueAt: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
}
