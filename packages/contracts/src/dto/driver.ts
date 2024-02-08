import type { DeliveryCondition, TripLoadStatus, TripStatus } from '../enums';
import type { CapacityBarDto, CorridorStripDto, PlaceDto } from './common';

/** Everything the Raha Driver app shows. Kept small on purpose: the app runs on 2 GB Android phones over 3G. */

export interface DriverHomeDto {
  driver: { id: string; name: string; initials: string; plate: string | null; available: boolean };
  /** Today's route (the driver's open or departing capacity post), if any. */
  route: {
    capacityPostId: string;
    origin: PlaceDto;
    destination: PlaceDto;
    departsAt: string;
    bar: CapacityBarDto;
    loadedKg: number;
    freeKg: number;
  } | null;
  /** "3 loads fit your space" card. */
  suggestion: { count: number; freeKg: number; bestWeightKg: number; bestPriceEtb: number; destinationName: string } | null;
  weekEarningsEtb: number;
  tripsDoneWeek: number;
  unreadCount: number;
  activeTripId: string | null;
}

export type DriverLoadFit = 'best' | 'fits' | 'too_heavy' | 'off_route';

export interface DriverLoadDto {
  shipmentId: string;
  ref: string;
  pickup: PlaceDto;
  dropoff: PlaceDto;
  priceEtb: number;
  weightKg: number;
  cargoLabel: string;
  /** "Coffee, 16 sacks" */
  piecesLabel: string;
  readyAt: string;
  pickupAddress: string;
  pickupDistanceKm: number | null;
  fit: DriverLoadFit;
  /** "BEST FIT · uses 40% of your empty 2 t" / "Drop on your way" / "Pickup on your way" / "Too heavy for your open space" */
  fitLabel: string;
  usesPct: number | null;
  /** A proposal that already exists between this driver's truck and the load. */
  myMatch: { id: string; status: 'pending_carrier' | 'pending_shipper' | 'confirmed' } | null;
}

export interface DriverLoadDetailDto extends DriverLoadDto {
  distanceKm: number;
  sameDirection: boolean;
  dropoffAddress: string;
  shipperName: string;
  shipperVerified: boolean;
  paidBy: string;
  contact: { name: string | null; phone: string | null } | null;
  /** The truck's bar after taking this load. */
  afterBar: CapacityBarDto;
  afterNote: string;
}

export interface DriverPinCheck {
  salt: string;
  /** sha256(`${salt}:${pin}`) — lets the phone verify the receiver's PIN with no signal. */
  digest: string;
}

export interface DriverTripLoadDto {
  loadId: string;
  shipmentId: string;
  ref: string;
  status: TripLoadStatus;
  dropOrder: number;
  shipperName: string;
  weightKg: number;
  cargoLabel: string;
  piecesLabel: string;
  pieces: number | null;
  isRahaMatch: boolean;
  priceEtb: number;
  pickup: {
    place: PlaceDto;
    address: string;
    contactName: string | null;
    contactPhone: string | null;
    readyAt: string;
    lat: number | null;
    lng: number | null;
  };
  dropoff: { place: PlaceDto; address: string; lat: number | null; lng: number | null };
  receiver: { name: string; phone: string };
  /** Only present once the load is picked up (the phone needs it to verify offline). */
  pinCheck: DriverPinCheck | null;
  pickupChecklist: { counted: boolean; noDamage: boolean; waybill: boolean } | null;
  deliveredAt: string | null;
}

export type DriverNextAction =
  | { type: 'go_to_pickup'; loadId: string }
  | { type: 'confirm_pickup'; loadId: string }
  | { type: 'start_trip' }
  | { type: 'check_in'; nextPlaceId: string | null }
  | { type: 'deliver'; loadId: string }
  | { type: 'complete' };

export interface DriverTripSummaryDto {
  id: string;
  ref: string;
  status: TripStatus;
  origin: PlaceDto;
  destination: PlaceDto;
  /** Two loads, one truck — one line per load. */
  loadLines: Array<{ ref: string; shipperName: string; weightKg: number; isRahaMatch: boolean; status: TripLoadStatus; label: string }>;
  statusLabel: string;
  tone: 'amber' | 'lapis' | 'green' | 'neutral';
  pickupAt: string | null;
  departedAt: string | null;
  completedAt: string | null;
  totalEtb: number;
}

export interface DriverTripDetailDto extends DriverTripSummaryDto {
  /** Which of the five on-screen steps the driver is on (1 pickup … 5 deliver). */
  step: 1 | 2 | 3 | 4 | 5;
  stepLabel: string;
  next: DriverNextAction;
  loads: DriverTripLoadDto[];
  strip: CorridorStripDto;
  bar: CapacityBarDto;
  etaAt: string | null;
  plannedDepartureAt: string | null;
  checkins: Array<{ placeId: string; placeName: string; at: string; channel: string; offline: boolean }>;
  fleetName: string;
  /** For the "Trip complete" screen. */
  summary: {
    durationMinutes: number | null;
    lines: Array<{ label: string; amountEtb: number; isRahaMatch: boolean }>;
    totalEtb: number;
    paymentNote: string;
  } | null;
}

export interface DriverEarningsDto {
  period: 'week' | 'month' | 'year';
  label: string;
  totalEtb: number;
  trips: number;
  matchTrips: number;
  matchEtb: number;
  series: Array<{ label: string; etb: number; matchEtb: number }>;
  items: Array<{
    tripId: string;
    route: string;
    whenLabel: string;
    drops: number;
    amountEtb: number;
    status: 'pending' | 'paid';
    methodLabel: string | null;
  }>;
}

export interface DriverVerificationRow {
  key: string;
  label: string;
  state: 'verified' | 'pending' | 'expiring' | 'missing' | 'rejected' | 'expired';
  note: string | null;
}

export interface DriverProfileDto {
  userId: string;
  fullName: string;
  initials: string;
  phone: string;
  sinceYear: number;
  fleetName: string | null;
  verification: DriverVerificationRow[];
  language: 'en' | 'am';
  dataSaver: boolean;
  supportNumber: string;
  notifyTelegram: boolean;
  notifySms: boolean;
  notifyCall: boolean;
}

export interface DriverVehicleDto {
  vehicleId: string;
  plate: string;
  label: string;
  maxLoadKg: number;
  boxVolumeM3: number | null;
  bodyLabel: string;
  verified: boolean;
  currentLoadKg: number;
  bar: CapacityBarDto;
  ownerName: string;
}

export interface ReturnLoadsDto {
  freeKg: number;
  from: PlaceDto;
  to: PlaceDto;
  capacityPostId: string | null;
  loads: DriverLoadDto[];
  alertsOn: boolean;
}

/** One queued action from the phone; the server applies it idempotently. */
export interface SyncAction {
  /** Device-generated UUID — the idempotency key. */
  id: string;
  type: 'begin' | 'arrive' | 'pickup' | 'start' | 'checkin' | 'deliver';
  tripId: string;
  loadId?: string;
  /** When it happened on the phone (ISO). */
  at: string;
  payload: Record<string, unknown>;
}

export interface SyncResult {
  id: string;
  ok: boolean;
  /** Already applied earlier — safe to drop from the queue. */
  duplicate?: boolean;
  error?: { code: string; message: string };
}

export interface DeliverInput {
  pin: string;
  condition: DeliveryCondition;
  receivedCount?: number;
  photoKey?: string;
  verifiedOffline?: boolean;
}
