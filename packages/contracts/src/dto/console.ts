import type { ShipmentStatus, TripStatus, VehicleStatus } from '../enums';
import type { CapacityBarDto, CorridorStripDto, PlaceDto } from './common';
import type { DriverSummaryDto, TruckOptionDto } from './freight';

// ───────────────────────────── receiver (public, no account) ─────────────────────────────

export interface ReceiverPageDto {
  code: string;
  receiverName: string;
  shipperName: string;
  /** "16 sacks · 800 kg" */
  cargoSummary: string;
  status: ShipmentStatus;
  /** Big headline: "Your coffee is 15 minutes away". */
  headline: string;
  ref: string;
  driverFirstName: string | null;
  driverPhone: string | null;
  plate: string | null;
  /** Shown while the shipment is on the road so the receiver can read it to the driver. */
  pin: string | null;
  strip: CorridorStripDto | null;
  etaAt: string | null;
  deliveredAt: string | null;
  confirmedBy: string | null;
  canConfirm: boolean;
  pickup: PlaceDto;
  dropoff: PlaceDto;
}

// ───────────────────────────── fleet console ─────────────────────────────

export interface FleetTruckRowDto {
  vehicleId: string;
  plate: string;
  model: string;
  driverName: string | null;
  /** "Addis → Hawassa · Meki" */
  nowLabel: string;
  bar: CapacityBarDto;
  /** "8.8 / 10 t · 1.2 t free" */
  capacityLabel: string;
  status: VehicleStatus;
  capacityPostId: string | null;
}

export interface FleetOfferDto {
  key: string;
  kind: 'accepted' | 'assignable' | 'pending';
  shipmentId: string;
  matchId: string | null;
  capacityPostId: string | null;
  /** "800 kg → Hawassa" */
  title: string;
  /** "for 3-48213" */
  forLabel: string;
  /** "Sheba Agro · fills 2 t spare · ETB 6,400" */
  subtitle: string;
  priceEtb: number;
  stateLabel: string | null;
  canAssign: boolean;
  canAccept: boolean;
}

export interface FleetPerfRowDto {
  vehicleId: string;
  plate: string;
  loadedPct: number;
  matchedPct: number;
  emptyPct: number;
  totalPct: number;
}

export interface FleetBoardDto {
  dateLabel: string;
  counts: { onTrip: number; available: number; offRoad: number; loading: number; trucks: number; drivers: number };
  openSpaceKg: number;
  recordedMonthEtb: number;
  monthLabel: string;
  trucks: FleetTruckRowDto[];
  offers: FleetOfferDto[];
  perf: FleetPerfRowDto[];
  fleetLoadedPct: number;
  drivers: DriverSummaryDto[];
  expiringDocs: number;
  team: { owner: string | null; manager: string | null; drivers: number };
}

export interface FleetTripRowDto {
  tripId: string;
  ref: string;
  status: TripStatus;
  route: string;
  plate: string;
  driverName: string;
  loads: number;
  weightKg: number;
  progressPct: number;
  lastLabel: string;
  etaAt: string | null;
  late: boolean;
}

// ───────────────────────────── broker desk ─────────────────────────────

export interface BoardLoadDto {
  shipmentId: string;
  ref: string;
  pickup: PlaceDto;
  dropoff: PlaceDto;
  weightKg: number;
  shipperName: string;
  cargoLabel: string;
  ageMinutes: number;
  /** "4 trucks fit" / "3 return legs" / "0 fit · find truck" */
  fitsLabel: string;
  fitCount: number;
  source: string;
  readyAt: string;
  status: ShipmentStatus;
}

export interface BoardTruckDto extends TruckOptionDto {
  ownerLabel: string;
  tag: string;
}

export interface BrokerTripRowDto {
  tripId: string;
  route: string;
  stateLabel: string;
  tone: 'lapis' | 'amber' | 'red' | 'green';
  progressPct: number;
  who: string;
  lastLabel: string;
}

export interface InboxItemDto {
  id: string;
  channel: string;
  fromName: string | null;
  fromPhone: string | null;
  body: string;
  ageLabel: string;
  handled: boolean;
  createdAt: string;
}

export interface BrokerBoardDto {
  dateLabel: string;
  openLoads: number;
  trucksWithSpace: number;
  loads: BoardLoadDto[];
  trips: BrokerTripRowDto[];
  attentionCount: number;
  inbox: InboxItemDto[];
  dispatchers: Array<{ name: string; onShift: boolean; isMe: boolean }>;
  org: { name: string; area: string | null; dispatchers: number };
}

export interface NetworkTruckDto {
  vehicleId: string;
  plate: string;
  model: string;
  driverName: string | null;
  ownerName: string;
  status: VehicleStatus;
  nowLabel: string;
  bar: CapacityBarDto | null;
  note: string | null;
}

export interface BrokerShipperDto {
  orgId: string;
  name: string;
  phone: string | null;
  shipments: number;
  active: number;
  lastShipmentAt: string | null;
  managed: boolean;
}


/** Cheap numbers for the sidebar badges — no ranking, no joins beyond counts. */
export interface BrokerCountsDto {
  openLoads: number;
  activeTrips: number;
  inbox: number;
  area: string | null;
  dispatchers: Array<{ name: string; onShift: boolean; isMe: boolean }>;
}

export interface FleetCountsDto {
  activeTrips: number;
  offers: number;
  trucks: number;
  drivers: number;
}
