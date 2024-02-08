import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn, Relation, UpdateDateColumn } from 'typeorm';
import type {
  CapacityKind,
  CapacityStatus,
  CheckinChannel,
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
} from '@raha/contracts';
import type { GeoPoint } from '../../common/geo';
import { numeric, numericRequired } from './transformers';
import { Organization, User } from './identity.entities';
import { Corridor, Place } from './geo.entities';
import { Vehicle } from './fleet.entities';

@Entity('capacity_posts')
export class CapacityPost {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) vehicleId: string;
  @Column({ type: 'uuid', nullable: true }) driverId: string | null;
  @Column({ type: 'uuid' }) fleetOrgId: string;
  @Column({ type: 'uuid', nullable: true }) brokerOrgId: string | null;
  @Column({ type: 'uuid', nullable: true }) postedBy: string | null;
  @Column({ type: 'text', default: 'app' }) postedVia: 'app' | 'fleet' | 'broker' | 'telegram' | 'ops';
  @Column({ type: 'text' }) kind: CapacityKind;
  @Column({ type: 'uuid', nullable: true }) corridorId: string | null;
  @Column({ type: 'uuid' }) originPlaceId: string;
  @Column({ type: 'uuid' }) destinationPlaceId: string;
  @Column({ type: 'timestamptz' }) departsAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) etaAt: Date | null;
  @Column({ type: 'int' }) totalCapacityKg: number;
  @Column({ type: 'int', default: 0 }) committedKg: number;
  @Column({ type: 'int', default: 0 }) matchedKg: number;
  @Column({ type: 'numeric', precision: 6, scale: 1, nullable: true, transformer: numeric }) freeVolumeM3: number | null;
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: numeric }) askingPerTonneEtb: number | null;
  @Column({ type: 'numeric', precision: 7, scale: 1, nullable: true, transformer: numeric }) routeKm: number | null;
  @Column({ type: 'text', default: 'open' }) status: CapacityStatus;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;

  @ManyToOne(() => Vehicle) @JoinColumn({ name: 'vehicle_id' }) vehicle: Relation<Vehicle>;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'driver_id' }) driver: Relation<User> | null;
  @ManyToOne(() => Organization) @JoinColumn({ name: 'fleet_org_id' }) fleetOrg: Relation<Organization>;
  @ManyToOne(() => Organization, { nullable: true }) @JoinColumn({ name: 'broker_org_id' }) brokerOrg: Relation<Organization> | null;
  @ManyToOne(() => Place) @JoinColumn({ name: 'origin_place_id' }) origin: Relation<Place>;
  @ManyToOne(() => Place) @JoinColumn({ name: 'destination_place_id' }) destination: Relation<Place>;
  @ManyToOne(() => Corridor, { nullable: true }) @JoinColumn({ name: 'corridor_id' }) corridor: Relation<Corridor> | null;

  get freeKg(): number {
    return this.totalCapacityKg - this.committedKg - this.matchedKg;
  }
}

@Entity('trips')
export class Trip {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text', unique: true }) ref: string;
  @Column({ type: 'uuid' }) vehicleId: string;
  @Column({ type: 'uuid' }) driverId: string;
  @Column({ type: 'uuid' }) fleetOrgId: string;
  @Column({ type: 'uuid', nullable: true }) capacityPostId: string | null;
  @Column({ type: 'uuid', nullable: true }) corridorId: string | null;
  @Column({ type: 'uuid' }) originPlaceId: string;
  @Column({ type: 'uuid' }) destinationPlaceId: string;
  @Column({ type: 'text', default: 'planned' }) status: TripStatus;
  @Column({ type: 'timestamptz', nullable: true }) plannedDepartureAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) departedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) completedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) etaAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) lastPlaceId: string | null;
  @Column({ type: 'timestamptz', nullable: true }) lastCheckinAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;

  @ManyToOne(() => Vehicle) @JoinColumn({ name: 'vehicle_id' }) vehicle: Relation<Vehicle>;
  @ManyToOne(() => User) @JoinColumn({ name: 'driver_id' }) driver: Relation<User>;
  @ManyToOne(() => Organization) @JoinColumn({ name: 'fleet_org_id' }) fleetOrg: Relation<Organization>;
  @ManyToOne(() => Place) @JoinColumn({ name: 'origin_place_id' }) origin: Relation<Place>;
  @ManyToOne(() => Place) @JoinColumn({ name: 'destination_place_id' }) destination: Relation<Place>;
  @ManyToOne(() => Corridor, { nullable: true }) @JoinColumn({ name: 'corridor_id' }) corridor: Relation<Corridor> | null;
  @ManyToOne(() => CapacityPost, { nullable: true }) @JoinColumn({ name: 'capacity_post_id' }) capacityPost: Relation<CapacityPost> | null;
  @OneToMany(() => TripLoad, (l) => l.trip) loads: Relation<TripLoad[]>;
}

@Entity('shipments')
export class Shipment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text', unique: true }) ref: string;
  @Column({ type: 'uuid' }) shipperOrgId: string;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @Column({ type: 'uuid', nullable: true }) loggedByOrgId: string | null;
  @Column({ type: 'text', default: 'app' }) source: ShipmentSource;
  @Column({ type: 'uuid' }) pickupPlaceId: string;
  @Column({ type: 'text' }) pickupAddress: string;
  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326, nullable: true }) pickupPoint: GeoPoint | null;
  @Column({ type: 'text', nullable: true }) pickupContactName: string | null;
  @Column({ type: 'text', nullable: true }) pickupContactPhone: string | null;
  @Column({ type: 'uuid' }) dropoffPlaceId: string;
  @Column({ type: 'text' }) dropoffAddress: string;
  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326, nullable: true }) dropoffPoint: GeoPoint | null;
  @Column({ type: 'text' }) receiverName: string;
  @Column({ type: 'text' }) receiverPhone: string;
  @Column({ type: 'text' }) cargoType: string;
  @Column({ type: 'text', nullable: true }) cargoDescription: string | null;
  @Column({ type: 'int', nullable: true }) pieces: number | null;
  @Column({ type: 'int' }) weightKg: number;
  @Column({ type: 'numeric', precision: 7, scale: 2, nullable: true, transformer: numeric }) volumeM3: number | null;
  @Column({ type: 'text', array: true, default: '{}' }) requirements: string[];
  @Column({ type: 'timestamptz' }) readyAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) readyUntil: Date | null;
  @Column({ type: 'text', default: 'requested' }) status: ShipmentStatus;
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: numeric }) agreedPriceEtb: number | null;
  @Column({ type: 'uuid', nullable: true }) matchId: string | null;
  @Column({ type: 'uuid', nullable: true }) tripId: string | null;
  @Column({ type: 'text', unique: true }) receiverCode: string;
  @Column({ type: 'text', nullable: true, select: false }) pinHash: string | null;
  @Column({ type: 'text', nullable: true, select: false }) pinSalt: string | null;
  @Column({ type: 'text', nullable: true, select: false }) pinEnc: string | null;
  @Column({ type: 'int', default: 0 }) pinAttempts: number;
  @Column({ type: 'timestamptz', nullable: true }) pinVerifiedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) deliveredAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) cancelledAt: Date | null;
  @Column({ type: 'text', nullable: true }) cancelReason: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;

  @ManyToOne(() => Organization) @JoinColumn({ name: 'shipper_org_id' }) shipperOrg: Relation<Organization>;
  @ManyToOne(() => Organization, { nullable: true }) @JoinColumn({ name: 'logged_by_org_id' }) loggedByOrg: Relation<Organization> | null;
  @ManyToOne(() => Place) @JoinColumn({ name: 'pickup_place_id' }) pickupPlace: Relation<Place>;
  @ManyToOne(() => Place) @JoinColumn({ name: 'dropoff_place_id' }) dropoffPlace: Relation<Place>;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'created_by' }) creator: Relation<User> | null;
}

@Entity('matches')
export class Match {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) shipmentId: string;
  @Column({ type: 'uuid' }) capacityPostId: string;
  @Column({ type: 'uuid', nullable: true }) tripId: string | null;
  @Column({ type: 'text' }) status: MatchStatus;
  @Column({ type: 'text' }) proposedBy: MatchProposer;
  @Column({ type: 'uuid', nullable: true }) proposedByUser: string | null;
  @Column({ type: 'uuid', nullable: true }) proposedByOrg: string | null;
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericRequired }) priceEtb: number;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericRequired }) brokerFeeEtb: number;
  @Column({ type: 'text' }) fitKind: FitKind;
  @Column({ type: 'boolean', default: true }) isRahaMatch: boolean;
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true, transformer: numeric }) score: number | null;
  @Column({ type: 'jsonb', nullable: true }) scoreDetail: Record<string, unknown> | null;
  @Column({ type: 'numeric', precision: 6, scale: 1, nullable: true, transformer: numeric }) offRouteKm: number | null;
  @Column({ type: 'timestamptz', nullable: true }) expiresAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) respondedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) respondedAt: Date | null;
  @Column({ type: 'text', nullable: true }) declineReason: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;

  @ManyToOne(() => Shipment, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'shipment_id' }) shipment: Relation<Shipment>;
  @ManyToOne(() => CapacityPost) @JoinColumn({ name: 'capacity_post_id' }) capacityPost: Relation<CapacityPost>;
}

@Entity('trip_loads')
export class TripLoad {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) tripId: string;
  @Column({ type: 'uuid', unique: true }) shipmentId: string;
  @Column({ type: 'uuid', nullable: true }) matchId: string | null;
  @Column({ type: 'boolean', default: true }) isRahaMatch: boolean;
  @Column({ type: 'int' }) weightKg: number;
  @Column({ type: 'int', default: 1 }) dropOrder: number;
  @Column({ type: 'text', default: 'assigned' }) status: TripLoadStatus;
  @Column({ type: 'jsonb', nullable: true }) pickupChecklist: { counted?: boolean; noDamage?: boolean; waybill?: boolean } | null;
  @Column({ type: 'timestamptz', nullable: true }) arrivedPickupAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) pickedUpAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) deliveredAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;

  @ManyToOne(() => Trip, (t) => t.loads, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'trip_id' }) trip: Relation<Trip>;
  @ManyToOne(() => Shipment) @JoinColumn({ name: 'shipment_id' }) shipment: Relation<Shipment>;
}

@Entity('trip_checkins')
export class TripCheckin {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) tripId: string;
  @Column({ type: 'uuid' }) placeId: string;
  @Column({ type: 'uuid' }) clientId: string;
  @Column({ type: 'text', default: 'app' }) channel: CheckinChannel;
  @Column({ type: 'timestamptz' }) checkedInAt: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) receivedAt: Date;
  @Column({ type: 'boolean', default: false }) offline: boolean;
  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326, nullable: true }) location: GeoPoint | null;
  @Column({ type: 'text', nullable: true }) note: string | null;

  @ManyToOne(() => Place) @JoinColumn({ name: 'place_id' }) place: Relation<Place>;
}

@Entity('proofs')
export class Proof {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) shipmentId: string;
  @Column({ type: 'uuid', nullable: true }) tripLoadId: string | null;
  @Column({ type: 'text' }) kind: ProofKind;
  @Column({ type: 'text' }) fileKey: string;
  @Column({ type: 'uuid', nullable: true }) clientId: string | null;
  @Column({ type: 'int', nullable: true }) bytes: number | null;
  @Column({ type: 'timestamptz' }) takenAt: Date;
  @Column({ type: 'geography', spatialFeatureType: 'Point', srid: 4326, nullable: true }) location: GeoPoint | null;
  @Column({ type: 'uuid', nullable: true }) uploadedBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('deliveries')
export class Delivery {
  @PrimaryColumn({ type: 'uuid' }) shipmentId: string;
  @Column({ type: 'uuid', nullable: true }) tripLoadId: string | null;
  @Column({ type: 'timestamptz' }) deliveredAt: Date;
  @Column({ type: 'text' }) confirmedBy: DeliveryConfirmation;
  @Column({ type: 'boolean', default: false }) pinVerified: boolean;
  @Column({ type: 'text', default: 'all_good' }) condition: DeliveryCondition;
  @Column({ type: 'int', nullable: true }) receivedCount: number | null;
  @Column({ type: 'int', nullable: true }) expectedCount: number | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @Column({ type: 'boolean', default: false }) offlineSynced: boolean;
  @Column({ type: 'text', nullable: true }) reviewFlag: string | null;
  @Column({ type: 'timestamptz', nullable: true }) reviewedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) reviewedBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
