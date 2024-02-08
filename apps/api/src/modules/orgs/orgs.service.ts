import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { ASSIGNABLE_ROLES, normalizeEthiopianPhone, type MemberDto, type OrganizationDto, type SessionDto } from '@raha/contracts';
import { loadEnv } from '../../config/env';
import { badRequest, conflict, forbidden, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/request-context';
import { DriverProfile, Membership, Organization, User } from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { MessagingService } from '../messaging/messaging.service';
import type { CreateOrgDto, InviteMemberDto, UpdateMemberDto, UpdateOrgDto } from './orgs.dto';

@Injectable()
export class OrgsService {
  private readonly env = loadEnv();

  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(DriverProfile) private readonly driverProfiles: Repository<DriverProfile>,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
  ) {}

  /** Any signed-in user can open a company account; they become its owner. */
  async create(ctx: RequestContext, dto: CreateOrgDto): Promise<SessionDto> {
    const org = await this.orgs.save(
      this.orgs.create({
        type: dto.type,
        name: dto.name.trim(),
        nameAm: dto.nameAm ?? null,
        city: dto.city ?? null,
        address: dto.address ?? null,
        phone: dto.phone ? (normalizeEthiopianPhone(dto.phone) ?? dto.phone) : ctx.phone,
        tin: dto.tin ?? null,
        tradeLicenceNo: dto.tradeLicenceNo ?? null,
        createdBy: ctx.userId,
      }),
    );
    await this.memberships.save(this.memberships.create({ userId: ctx.userId, organizationId: org.id, role: 'owner', status: 'active' }));
    await this.audit.record({ actor: ctx, action: 'org.create', entityType: 'organization', entityId: org.id, data: { type: org.type, name: org.name } });
    return this.auth.session(ctx.userId);
  }

  async current(orgId: string): Promise<OrganizationDto> {
    const org = await this.orgs.findOne({ where: { id: orgId } });
    if (!org) throw notFound('Organization');
    return this.toDto(org, await this.memberships.count({ where: { organizationId: orgId, status: Not('removed') } }));
  }

  async update(ctx: RequestContext, orgId: string, dto: UpdateOrgDto): Promise<OrganizationDto> {
    const patch: Partial<Organization> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.nameAm !== undefined) patch.nameAm = dto.nameAm;
    if (dto.city !== undefined) patch.city = dto.city;
    if (dto.address !== undefined) patch.address = dto.address;
    if (dto.phone !== undefined) patch.phone = normalizeEthiopianPhone(dto.phone) ?? dto.phone;
    if (dto.tin !== undefined) patch.tin = dto.tin;
    if (dto.tradeLicenceNo !== undefined) patch.tradeLicenceNo = dto.tradeLicenceNo;
    if (Object.keys(patch).length) {
      await this.orgs.update(orgId, patch);
      await this.audit.record({ actor: ctx, action: 'org.update', entityType: 'organization', entityId: orgId, data: patch as Record<string, unknown> });
    }
    return this.current(orgId);
  }

  // ───────────────────────── members ─────────────────────────

  async members(orgId: string): Promise<MemberDto[]> {
    const rows = await this.memberships.find({
      where: { organizationId: orgId, status: Not('removed') },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((m) => this.toMemberDto(m));
  }

  async invite(ctx: RequestContext, orgId: string, orgType: Organization['type'], dto: InviteMemberDto): Promise<MemberDto> {
    if (!ASSIGNABLE_ROLES[orgType].includes(dto.role)) throw badRequest('invalid_role', `A ${orgType} account has no "${dto.role}" role`);
    if (dto.role === 'owner' && ctx.org?.role !== 'owner') throw forbidden('Only an owner can add another owner', 'owner_only');
    const phone = normalizeEthiopianPhone(dto.phone);
    if (!phone) throw badRequest('invalid_phone', 'Enter a valid Ethiopian mobile number');

    let user = await this.users.findOne({ where: { phone } });
    if (!user) user = await this.users.save(this.users.create({ phone, fullName: dto.fullName.trim() }));
    else if (!user.fullName) await this.users.update(user.id, { fullName: dto.fullName.trim() });

    const existing = await this.memberships.findOne({ where: { userId: user.id, organizationId: orgId } });
    if (existing && existing.status !== 'removed') throw conflict('already_member', 'That person is already on this team');
    // People who already use Raha join immediately; first-time users are activated when they sign in.
    const status = user.lastLoginAt ? ('active' as const) : ('invited' as const);
    const membership = existing
      ? await this.memberships.save({ ...existing, role: dto.role, status, invitedBy: ctx.userId })
      : await this.memberships.save(this.memberships.create({ userId: user.id, organizationId: orgId, role: dto.role, status, invitedBy: ctx.userId }));

    // A driver needs a profile before they can be verified; the licence arrives later via the app.
    if (dto.role === 'driver') {
      await this.driverProfiles.upsert({ userId: user.id }, ['userId']);
    }

    const org = await this.orgs.findOneByOrFail({ id: orgId });
    await this.messaging.sendSms(
      phone,
      `RAHA: ${org.name} added you as ${dto.role === 'driver' ? 'a driver' : `${dto.role} on Raha`}. Sign in with this number: ${this.env.publicWebUrl}`,
    );
    await this.audit.record({ actor: ctx, action: 'member.invite', entityType: 'membership', entityId: membership.id, data: { orgId, role: dto.role, phone } });

    const full = await this.memberships.findOneOrFail({ where: { id: membership.id }, relations: { user: true } });
    return this.toMemberDto(full);
  }

  async updateMember(ctx: RequestContext, orgId: string, membershipId: string, dto: UpdateMemberDto): Promise<MemberDto> {
    const m = await this.memberships.findOne({ where: { id: membershipId, organizationId: orgId }, relations: { user: true, organization: true } });
    if (!m) throw notFound('Member');
    if (dto.role) {
      if (!ASSIGNABLE_ROLES[m.organization.type].includes(dto.role)) throw badRequest('invalid_role', `A ${m.organization.type} account has no "${dto.role}" role`);
      if ((dto.role === 'owner' || m.role === 'owner') && ctx.org?.role !== 'owner') throw forbidden('Only an owner can change owners', 'owner_only');
    }
    if (m.role === 'owner' && (dto.status === 'suspended' || (dto.role && dto.role !== 'owner'))) {
      const owners = await this.memberships.count({ where: { organizationId: orgId, role: 'owner', status: In(['active', 'invited']) } });
      if (owners <= 1) throw conflict('last_owner', 'An organization needs at least one owner');
    }
    if (dto.role) m.role = dto.role;
    if (dto.status && dto.status !== 'removed') m.status = dto.status;
    await this.memberships.save(m);
    await this.audit.record({ actor: ctx, action: 'member.update', entityType: 'membership', entityId: m.id, data: { ...dto } });
    return this.toMemberDto(m);
  }

  async removeMember(ctx: RequestContext, orgId: string, membershipId: string): Promise<void> {
    const m = await this.memberships.findOne({ where: { id: membershipId, organizationId: orgId } });
    if (!m) throw notFound('Member');
    if (m.role === 'owner') {
      const owners = await this.memberships.count({ where: { organizationId: orgId, role: 'owner', status: In(['active', 'invited']) } });
      if (owners <= 1) throw conflict('last_owner', 'An organization needs at least one owner');
    }
    await this.memberships.update(m.id, { status: 'removed' });
    await this.audit.record({ actor: ctx, action: 'member.remove', entityType: 'membership', entityId: m.id, data: { orgId } });
  }

  // ───────────────────────── mapping ─────────────────────────

  toDto(o: Organization, memberCount: number): OrganizationDto {
    return {
      id: o.id,
      type: o.type,
      name: o.name,
      nameAm: o.nameAm,
      city: o.city,
      address: o.address,
      phone: o.phone,
      tin: o.tin,
      tradeLicenceNo: o.tradeLicenceNo,
      verification: o.verificationStatus,
      memberCount,
      createdAt: o.createdAt.toISOString(),
    };
  }

  private toMemberDto(m: Membership): MemberDto {
    const u = m.user;
    const channel: MemberDto['channel'] = m.status === 'invited' ? 'invited' : u.appLastSeenAt ? 'app' : u.telegramChatId ? 'telegram' : 'sms';
    return {
      membershipId: m.id,
      userId: u.id,
      fullName: u.fullName || u.phone,
      phone: u.phone,
      role: m.role,
      status: m.status,
      channel,
      lastSeenAt: u.appLastSeenAt?.toISOString() ?? null,
    };
  }
}
