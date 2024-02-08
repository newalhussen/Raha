import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Relation, UpdateDateColumn } from 'typeorm';
import type { ClientApp, Language, MemberRole, MembershipStatus, OrgType, StaffRole, UserStatus, VerificationStatus } from '@raha/contracts';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text', unique: true }) phone: string;
  @Column({ type: 'text', nullable: true }) email: string | null;
  @Column({ type: 'text' }) fullName: string;
  @Column({ type: 'text', default: 'en' }) language: Language;
  @Column({ type: 'text', default: 'active' }) status: UserStatus;
  @Column({ type: 'boolean', default: false }) isStaff: boolean;
  @Column({ type: 'text', nullable: true }) staffRole: StaffRole | null;
  @Column({ type: 'text', nullable: true, select: false }) passwordHash: string | null;
  @Column({ type: 'text', nullable: true }) telegramChatId: string | null;
  @Column({ type: 'boolean', default: true }) notifyTelegram: boolean;
  @Column({ type: 'boolean', default: true }) notifySms: boolean;
  @Column({ type: 'boolean', default: false }) notifyCall: boolean;
  @Column({ type: 'boolean', default: true }) dataSaver: boolean;
  @Column({ type: 'timestamptz', nullable: true }) appLastSeenAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) lastLoginAt: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('otp_codes')
export class OtpCode {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ type: 'text' }) phone: string;
  @Column({ type: 'text' }) codeHash: string;
  @Column({ type: 'text', default: 'login' }) purpose: string;
  @Column({ type: 'int', default: 0 }) attempts: number;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) consumedAt: Date | null;
  @Column({ type: 'text', nullable: true }) ip: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'text', unique: true }) tokenHash: string;
  @Column({ type: 'text' }) app: ClientApp;
  @Column({ type: 'text', nullable: true }) deviceName: string | null;
  @Column({ type: 'text', nullable: true }) userAgent: string | null;
  @Column({ type: 'timestamptz' }) expiresAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) revokedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) replacedBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('device_tokens')
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'text', unique: true }) token: string;
  @Column({ type: 'text', default: 'android' }) platform: string;
  @Column({ type: 'text', nullable: true }) appVersion: string | null;
  @Column({ type: 'timestamptz', default: () => 'now()' }) lastSeenAt: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text' }) type: OrgType;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'text', nullable: true }) nameAm: string | null;
  @Column({ type: 'text', nullable: true }) tin: string | null;
  @Column({ type: 'text', nullable: true }) tradeLicenceNo: string | null;
  @Column({ type: 'text', nullable: true }) city: string | null;
  @Column({ type: 'text', nullable: true }) address: string | null;
  @Column({ type: 'text', nullable: true }) phone: string | null;
  @Column({ type: 'text', default: 'unverified' }) verificationStatus: VerificationStatus;
  @Column({ type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
  @Column({ type: 'uuid', nullable: true }) managedByOrgId: string | null;
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}

@Entity('memberships')
export class Membership {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'uuid' }) organizationId: string;
  @Column({ type: 'text' }) role: MemberRole;
  @Column({ type: 'text', default: 'active' }) status: MembershipStatus;
  @Column({ type: 'uuid', nullable: true }) invitedBy: string | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: Relation<Organization>;
}
