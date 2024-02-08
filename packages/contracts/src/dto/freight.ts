import type {
  BodyType,
  CapacityKind,
  CapacityStatus,
  DeliveryCondition,
  DeliveryConfirmation,
  FitKind,
  MatchProposer,
  MatchStatus,
  ProofKind,
  ShipmentSource,
  ShipmentStatus,
  TripLoadStatus,
  TripStatus,
  VehicleStatus,
  VerificationStatus,
} from '../enums';
import type { CapacityBarDto, CorridorStripDto, PaymentDto, PlaceDto } from './common';

// ───────────────────────────── vehicles & drivers ─────────────────────────────

export interface VehicleDto {
  id: string;
  plate: string;
  makeModel: string;
  year: number | null;
  bodyType: BodyType;
  maxLoadKg: number;
  boxVolumeM3: number | null;
  currentLoadKg: number;
  status: VehicleStatus;
  statusNote: string | null;
  verification: VerificationStatus;
  ownerOrgId: string;
  ownerName: string;
  driver: { id: string; name: string; phone: string } | null;
  homePlace: PlaceDto | null;
  /** "Isuzu FSR · 10 t" */
  label: string;
}

export interface DriverSummaryDto {
  userId: string;
  fullName: string;
  phone: string;
  initials: string;
  verification: VerificationStatus;
  tripsCompleted: number;
  licenceGrade: string | null;
  licenceExpiry: string | null;
  channel: 'app' | 'telegram' | 'invited';
  /** Short status caption such as "Insurance 12 days" / "Awaiting licence". */
  note: string | null;
  warn: boolean;
  plate: string | null;
}

// ───────────────────────────── capacity ─────────────────────────────

export interface CapacityPostDto {
  id: string;
  kind: CapacityKind;
  status: CapacityStatus;
  vehicle: VehicleDto;
  driver: { id: string; name: string; phone: string } | null;
  fleetOrgId: string;
  fleetName: string;
  brokerName: string | null;
  origin: PlaceDto;
  destination: PlaceDto;
  corridorName: string | null;
  routeKm: number | null;
  departsAt: string;
  etaAt: string | null;
  bar: CapacityBarDto;
  committedKg: number;
  matchedKg: number;
  freeKg: number;
  freeVolumeM3: number | null;
  askingPerTonneEtb: number | null;
  postedVia: string;
  notes: string | null;
  pendingOffers: number;
  createdAt: string;
}

// ───────────────────────────── truck options (matching output) ─────────────────────────────

export interface ScoreDetailDto {
  total: number;
  fit: number;
  detour: number;
  timing: number;
  reliability: number;
  price: number;
  returnLegBonus: number;
}

export interface TruckOptionDto {
  capacityPostId: string;
  fit: FitKind;
  /** e.g. "ALREADY GOING TO HAWASSA · HAS 2 T SPARE". Null for ordinary options. */
  fitBanner: string | null;
  highlighted: boolean;
  driver: { id: string | null; name: string; initials: string; verified: boolean };
  fleetName: string;
  viaBroker: string | null;
  plate: string;
  vehicleLabel: string;
  /** Truck bar with this shipment added: ink = already aboard, amber = this load (+ other matches), hatched = still free. */
  bar: CapacityBarDto;
  /** "10 t truck · 8 t aboard · your 800 kg fits" */
  capacityNote: string;
  pickupAt: string;
  departsAt: string;
  etaAt: string;
  priceEtb: number;
  /** "38% below a dedicated truck" | "Broker-managed" | "Dedicated, fastest" */
  priceNote: string;
  savingsPct: number | null;
  brokerFeeEtb: number;
  offRouteKm: number;
  distanceKm: number;
  score: ScoreDetailDto;
  /** Set when a proposal already exists between this shipment and this truck. */
  existingMatch: { id: string; status: MatchStatus } | null;
}

// ───────────────────────────── shipments ─────────────────────────────

export interface CarrierSummaryDto {
  driverId: string;
  driverName: string;
  driverInitials: string;
  driverPhone: string;
  fleetName: string;
  viaBroker: string | null;
  plate: string;
  vehicleLabel: string;
  tripsOnRaha: number;
  verified: boolean;
}

export interface ShipmentSummaryDto {
  id: string;
  ref: string;
  status: ShipmentStatus;
  hasOpenIssue: boolean;
  pickup: PlaceDto;
  dropoff: PlaceDto;
  cargoType: string;
  cargoLabel: string;
  pieces: number | null;
  weightKg: number;
  volumeM3: number | null;
  readyAt: string;
  shipperOrgId: string;
  shipperName: string;
  source: ShipmentSource;
  loggedByName: string | null;
  carrier: CarrierSummaryDto | null;
  priceEtb: number | null;
  /** 0–100 along the corridor. */
  progressPct: number;
  /** "Meki · 15:19", "Not yet booked", "Driver assigned", "PIN confirmed" */
  progressLabel: string;
  /** Live proposals waiting for an answer. */
  pendingOffers: number;
  /** For open shipments: how many trucks on the road could carry it right now (null when not computed). */
  matchingTrucks: number | null;
  createdAt: string;
}

export interface ShipmentListStatsDto {
  inTransit: number;
  awaitingChoice: number;
  offersTotal: number;
  deliveredMonth: number;
  spendMonthEtb: number;
  monthLabel: string;
}

export interface ShipmentListDto {
  items: ShipmentSummaryDto[];
  total: number;
  stats: ShipmentListStatsDto;
  /** First shipment that has offers waiting — drives the dark banner on the list page. */
  offerBanner: { shipmentId: string; ref: string; offers: number; sameTripCount: number; route: string; weightKg: number } | null;
}

export interface MatchDto {
  id: string;
  status: MatchStatus;
  proposedBy: MatchProposer;
  priceEtb: number;
  brokerFeeEtb: number;
  fit: FitKind;
  isRahaMatch: boolean;
  capacityPostId: string;
  plate: string;
  vehicleLabel: string;
  driverName: string | null;
  fleetName: string;
  departsAt: string;
  createdAt: string;
  expiresAt: string | null;
  declineReason: string | null;
  /** What the viewer can do next with this proposal. */
  canAccept: boolean;
  canDecline: boolean;
  canCancel: boolean;
}

export interface ProofDto {
  id: string;
  kind: ProofKind;
  label: string;
  url: string;
  takenAt: string;
}

export interface DeliveryDto {
  deliveredAt: string;
  confirmedBy: DeliveryConfirmation;
  pinVerified: boolean;
  condition: DeliveryCondition;
  receivedCount: number | null;
  expectedCount: number | null;
  notes: string | null;
  reviewFlag: string | null;
}

export interface TimelineEventDto {
  at: string;
  label: string;
  detail: string | null;
  tone: 'neutral' | 'amber' | 'lapis' | 'green' | 'red';
}

export interface ShipmentDetailDto extends ShipmentSummaryDto {
  pickupAddress: string;
  dropoffAddress: string;
  pickupContact: { name: string | null; phone: string | null };
  cargoDescription: string | null;
  requirements: string[];
  readyUntil: string | null;
  receiver: { name: string; phone: string };
  etaAt: string | null;
  strip: CorridorStripDto | null;
  /** The truck's bar with this load in amber. */
  bar: CapacityBarDto | null;
  /** "Your 800 kg is sharing a truck with another shipper's 8 t" */
  barNote: string | null;
  matches: MatchDto[];
  proofs: ProofDto[];
  delivery: DeliveryDto | null;
  payment: PaymentDto | null;
  messagesCount: number;
  timeline: TimelineEventDto[];
  tripId: string | null;
  tripRef: string | null;
  canCancel: boolean;
  canBook: boolean;
  canConfirmManually: boolean;
  receiverLink: string;
}

// ───────────────────────────── inputs ─────────────────────────────

export interface ShipmentInput {
  pickupPlaceId: string;
  pickupAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  pickupContactName?: string;
  pickupContactPhone?: string;
  dropoffPlaceId: string;
  dropoffAddress: string;
  dropoffLat?: number;
  dropoffLng?: number;
  receiverName: string;
  receiverPhone: string;
  cargoType: string;
  cargoDescription?: string;
  pieces?: number;
  weightKg: number;
  volumeM3?: number;
  requirements?: string[];
  readyAt: string;
  readyUntil?: string;
}

export interface TripStatusLabel {
  status: TripStatus;
  loadStatus?: TripLoadStatus;
}
