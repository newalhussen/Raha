import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, Relation, UpdateDateColumn } from 'typeorm';
import type { BodyType, DocumentKind, DocumentStatus, VehicleStatus, VerificationCaseStatus, VerificationStatus, VerificationSubject } from '@raha/contracts';
import { numeric } from './transformers';
import { Organization, User } from './identity.entities';
import { Place } from './geo.entities';

@Entity('driver_profiles')
export class DriverProfile {
  @PrimaryColumn({ type: 'uuid' }) userId: string;
  @Column({ type: 'text', nullable: true }) licenceNumber: string | null;
  @Column({ type: 'text', nullable: true }) licenceGrade: string | null;
  @Column({ type: 'date', nullable: true }) licenceExpiry: string | null;
  @Column({ type: 'text', nullable: true }) faydaIdLast4: string | null;
  @Column({ type: 'uuid', nullable: true }) homePlaceId: string | null;
  @Column({ type: 'boolean', default: true }) available: boolean;
  @Column({ type: 'boolean', default: true }) returnAlerts: boolean;
  @Column({ type: 'text', default: 'unverified' }) verificationStatus: VerificationStatus;
  @Column({ type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
  @Column({ type: 'int', default: 0 }) tripsCompleted: number;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user: Relation<User>;
}

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) ownerOrgId: string;
  @Column({ type: 'text', unique: true }) plate: string;
  @Column({ type: 'text' }) makeModel: string;
  @Column({ type: 'int', nullable: true }) year: number | null;
  @Column({ type: 'text', default: 'dry_box' }) bodyType: BodyType;
  @Column({ type: 'int' }) maxLoadKg: number;
  @Column({ type: 'numeric', precision: 6, scale: 1, nullable: true, transformer: numeric }) boxVolumeM3: number | null;
  @Column({ type: 'int', default: 0 }) currentLoadKg: number;
  @Column({ type: 'text', default: 'available' }) status: VehicleStatus;
  @Column({ type: 'text', nullable: true }) statusNote: string | null;
  @Column({ type: 'uuid', nullable: true }) currentDriverId: string | null;
  @Column({ type: 'uuid', nullable: true }) homePlaceId: string | null;
  @Column({ type: 'text', default: 'unverified' }) verificationStatus: VerificationStatus;
  @Column({ type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;

  @ManyToOne(() => Organization) @JoinColumn({ name: 'owner_org_id' }) owner: Relation<Organization>;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'current_driver_id' }) currentDriver: Relation<User> | null;
  @ManyToOne(() => Place, { nullable: true }) @JoinColumn({ name: 'home_place_id' }) homePlace: Relation<Place> | null;
}

@Entity('broker_network')
export class BrokerNetworkLink {
  @PrimaryColumn({ type: 'uuid' }) brokerOrgId: string;
  @PrimaryColumn({ type: 'uuid' }) vehicleId: string;
  @Column({ type: 'text', nullable: true }) note: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('verification_cases')
export class VerificationCase {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text' }) subjectType: VerificationSubject;
  @Column({ type: 'uuid' }) subjectId: string;
  @Column({ type: 'text', default: 'pending' }) status: VerificationCaseStatus;
  @Column({ type: 'uuid', nullable: true }) submittedBy: string | null;
  @Column({ type: 'uuid', nullable: true }) assignedTo: string | null;
  @Column({ type: 'uuid', nullable: true }) decidedBy: string | null;
  @Column({ type: 'timestamptz', nullable: true }) decidedAt: Date | null;
  @Column({ type: 'text', nullable: true }) decisionNote: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('verification_documents')
export class VerificationDocument {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) caseId: string;
  @Column({ type: 'text' }) subjectType: VerificationSubject;
  @Column({ type: 'uuid' }) subjectId: string;
  @Column({ type: 'text' }) kind: DocumentKind;
  @Column({ type: 'text', nullable: true }) fileKey: string | null;
  @Column({ type: 'text', nullable: true }) number: string | null;
  @Column({ type: 'date', nullable: true }) expiresOn: string | null;
  @Column({ type: 'text', default: 'pending' }) status: DocumentStatus;
  @Column({ type: 'text', nullable: true }) reviewNote: string | null;
  @Column({ type: 'uuid', nullable: true }) uploadedBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
