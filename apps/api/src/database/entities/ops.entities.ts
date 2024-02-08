import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Relation, UpdateDateColumn } from 'typeorm';
import type {
  InboundChannel,
  IssueKind,
  IssueStatus,
  NotificationChannel,
  NotificationStatus,
  PaymentMethod,
  PaymentStatus,
} from '@raha/contracts';
import { numericRequired } from './transformers';
import { Organization, User } from './identity.entities';
import { Shipment } from './freight.entities';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) shipmentId: string;
  @Column({ type: 'uuid', nullable: true }) tripId: string | null;
  @Column({ type: 'uuid' }) payerOrgId: string;
  @Column({ type: 'uuid' }) payeeOrgId: string;
  @Column({ type: 'uuid', nullable: true }) recordedBy: string | null;
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericRequired }) amountEtb: number;
  @Column({ type: 'text', nullable: true }) method: PaymentMethod | null;
  @Column({ type: 'text', nullable: true }) reference: string | null;
  @Column({ type: 'text', default: 'pending' }) status: PaymentStatus;
  @Column({ type: 'timestamptz', nullable: true }) dueAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) paidAt: Date | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;

  @ManyToOne(() => Shipment) @JoinColumn({ name: 'shipment_id' }) shipment: Relation<Shipment>;
  @ManyToOne(() => Organization) @JoinColumn({ name: 'payer_org_id' }) payerOrg: Relation<Organization>;
  @ManyToOne(() => Organization) @JoinColumn({ name: 'payee_org_id' }) payeeOrg: Relation<Organization>;
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', nullable: true }) userId: string | null;
  @Column({ type: 'text', nullable: true }) recipientPhone: string | null;
  @Column({ type: 'text' }) channel: NotificationChannel;
  @Column({ type: 'text' }) type: string;
  @Column({ type: 'text' }) title: string;
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'jsonb', default: {} }) data: Record<string, unknown>;
  @Column({ type: 'text', default: 'queued' }) status: NotificationStatus;
  @Column({ type: 'int', default: 0 }) attempts: number;
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'timestamptz', default: () => 'now()' }) sendAfter: Date;
  @Column({ type: 'timestamptz', nullable: true }) sentAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) readAt: Date | null;
  @Column({ type: 'text', nullable: true, unique: true }) dedupeKey: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('shipment_messages')
export class ShipmentMessage {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) shipmentId: string;
  @Column({ type: 'uuid', nullable: true }) senderUserId: string | null;
  @Column({ type: 'text' }) senderName: string;
  @Column({ type: 'text', nullable: true }) senderLabel: string | null;
  @Column({ type: 'text', default: 'app' }) channel: 'app' | 'sms' | 'telegram' | 'system';
  @Column({ type: 'text' }) body: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('inbound_messages')
export class InboundMessage {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', nullable: true }) orgId: string | null;
  @Column({ type: 'text' }) channel: InboundChannel;
  @Column({ type: 'text', nullable: true }) fromName: string | null;
  @Column({ type: 'text', nullable: true }) fromPhone: string | null;
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'jsonb', nullable: true }) parsed: Record<string, unknown> | null;
  @Column({ type: 'timestamptz', nullable: true }) handledAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) handledBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('issues')
export class Issue {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text', unique: true }) ref: string;
  @Column({ type: 'text' }) kind: IssueKind;
  @Column({ type: 'text', default: 'open' }) status: IssueStatus;
  @Column({ type: 'int', default: 2 }) priority: number;
  @Column({ type: 'text' }) title: string;
  @Column({ type: 'text', nullable: true }) body: string | null;
  @Column({ type: 'uuid', nullable: true }) shipmentId: string | null;
  @Column({ type: 'uuid', nullable: true }) tripId: string | null;
  @Column({ type: 'uuid', nullable: true }) raisedBy: string | null;
  @Column({ type: 'uuid', nullable: true }) raisedByOrg: string | null;
  @Column({ type: 'uuid', nullable: true }) assignedTo: string | null;
  @Column({ type: 'text', nullable: true }) resolution: string | null;
  @Column({ type: 'jsonb', default: {} }) meta: Record<string, unknown>;
  @Column({ type: 'text', nullable: true }) actionHint: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) resolvedAt: Date | null;

  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'raised_by' }) raiser: Relation<User> | null;
  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'assigned_to' }) assignee: Relation<User> | null;
}

@Entity('issue_comments')
export class IssueComment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) issueId: string;
  @Column({ type: 'uuid', nullable: true }) authorId: string | null;
  @Column({ type: 'text' }) body: string;
  @Column({ type: 'boolean', default: true }) internal: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;

  @ManyToOne(() => User, { nullable: true }) @JoinColumn({ name: 'author_id' }) author: Relation<User> | null;
}

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' }) id: string;
  @Column({ type: 'uuid', nullable: true }) actorId: string | null;
  @Column({ type: 'text', default: 'user' }) actorType: 'user' | 'staff' | 'system';
  @Column({ type: 'text' }) action: string;
  @Column({ type: 'text' }) entityType: string;
  @Column({ type: 'text' }) entityId: string;
  @Column({ type: 'jsonb', default: {} }) data: Record<string, unknown>;
  @Column({ type: 'text', nullable: true }) ip: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
