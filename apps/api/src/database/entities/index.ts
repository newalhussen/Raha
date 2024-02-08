import {
  DeviceToken,
  Membership,
  Organization,
  OtpCode,
  RefreshToken,
  User,
} from './identity.entities';
import { Corridor, CorridorStop, Place } from './geo.entities';
import {
  BrokerNetworkLink,
  DriverProfile,
  Vehicle,
  VerificationCase,
  VerificationDocument,
} from './fleet.entities';
import {
  CapacityPost,
  Delivery,
  Match,
  Proof,
  Shipment,
  Trip,
  TripCheckin,
  TripLoad,
} from './freight.entities';
import {
  AuditLog,
  InboundMessage,
  Issue,
  IssueComment,
  Notification,
  Payment,
  ShipmentMessage,
} from './ops.entities';

export * from './identity.entities';
export * from './geo.entities';
export * from './fleet.entities';
export * from './freight.entities';
export * from './ops.entities';

export const ALL_ENTITIES = [
  User,
  OtpCode,
  RefreshToken,
  DeviceToken,
  Organization,
  Membership,
  Place,
  Corridor,
  CorridorStop,
  DriverProfile,
  Vehicle,
  BrokerNetworkLink,
  VerificationCase,
  VerificationDocument,
  CapacityPost,
  Trip,
  Shipment,
  Match,
  TripLoad,
  TripCheckin,
  Proof,
  Delivery,
  Payment,
  Notification,
  ShipmentMessage,
  InboundMessage,
  Issue,
  IssueComment,
  AuditLog,
];
