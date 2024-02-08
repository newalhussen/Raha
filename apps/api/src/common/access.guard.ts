import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { orgPermissionsFor, staffPermissionsFor, type ClientApp, type OrgPermission, type OrgType, type StaffPermission } from '@raha/contracts';
import { loadEnv } from '../config/env';
import { DriverProfile, Membership, User } from '../database/entities';
import { DomainError, forbidden } from './errors';
import { IS_PUBLIC, REQUIRED_ORG_TYPE, REQUIRED_PERMISSIONS, REQUIRES_DRIVER } from './decorators';
import type { ActiveOrg, AuthedRequest, RequestContext } from './request-context';

interface AccessTokenPayload {
  sub: string;
  app: ClientApp;
}

/**
 * Global guard. For every non-public route it:
 *  1. verifies the bearer access token,
 *  2. loads the user and works out which organization they are acting for (X-Org-Id),
 *  3. computes their permissions (org role + staff role),
 *  4. enforces @RequirePermissions / @RequireOrgType / @RequireDriver.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  private readonly env = loadEnv();
  private readonly lastSeenWrites = new Map<string, number>();

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(DriverProfile) private readonly driverProfiles: Repository<DriverProfile>,
  ) {}

  async canActivate(host: ExecutionContext): Promise<boolean> {
    const handlers = [host.getHandler(), host.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, handlers)) return true;

    const req = host.switchToHttp().getRequest<AuthedRequest>();
    const token = this.bearer(req);
    if (!token) throw new DomainError('unauthenticated', 'Sign in to continue', HttpStatus.UNAUTHORIZED);

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { secret: this.env.jwtSecret });
    } catch {
      throw new DomainError('token_expired', 'Your session has expired', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') throw new DomainError('unauthenticated', 'Sign in to continue', HttpStatus.UNAUTHORIZED);

    const memberships = await this.memberships.find({
      where: { userId: user.id, status: 'active' },
      relations: { organization: true },
      order: { createdAt: 'ASC' },
    });
    const org = this.pickOrg(req, payload.app, memberships);

    const permissions: Array<OrgPermission | StaffPermission> = [];
    if (org) permissions.push(...orgPermissionsFor(org.type, org.role));
    if (user.isStaff && user.staffRole) permissions.push(...staffPermissionsFor(user.staffRole));

    const ctx: RequestContext = {
      userId: user.id,
      fullName: user.fullName,
      phone: user.phone,
      app: payload.app,
      isStaff: user.isStaff,
      staffRole: user.staffRole,
      org,
      permissions,
      ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? null,
    };
    req.ctx = ctx;
    this.touchLastSeen(user);

    const needed = this.reflector.getAllAndOverride<Array<OrgPermission | StaffPermission>>(REQUIRED_PERMISSIONS, handlers);
    if (needed?.length && !needed.every((p) => permissions.includes(p))) {
      throw forbidden(`Your role does not allow this (${needed.join(', ')})`, 'permission_denied');
    }
    const orgTypes = this.reflector.getAllAndOverride<OrgType[]>(REQUIRED_ORG_TYPE, handlers);
    if (orgTypes?.length && (!org || !orgTypes.includes(org.type))) {
      throw forbidden(`This is only available to ${orgTypes.join(' / ')} accounts`, 'wrong_org_type');
    }
    if (this.reflector.getAllAndOverride<boolean>(REQUIRES_DRIVER, handlers)) {
      const isDriver = await this.driverProfiles.exist({ where: { userId: user.id } });
      if (!isDriver) throw forbidden('This account has no driver profile', 'not_a_driver');
    }
    return true;
  }

  private bearer(req: AuthedRequest): string | null {
    const h = req.headers.authorization;
    if (!h) return null;
    const [scheme, token] = h.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }

  private pickOrg(req: AuthedRequest, app: ClientApp, memberships: Membership[]): ActiveOrg | null {
    const requested = req.headers['x-org-id'];
    let m: Membership | undefined;
    if (typeof requested === 'string' && requested) {
      m = memberships.find((x) => x.organizationId === requested);
      if (!m) throw forbidden('You are not a member of that organization', 'not_a_member');
    } else if (memberships.length === 1) {
      m = memberships[0];
    } else if (app === 'driver') {
      // Drivers belong to one fleet; prefer the fleet where they are listed as a driver.
      m = memberships.find((x) => x.organization.type === 'fleet' && x.role === 'driver') ?? memberships.find((x) => x.organization.type === 'fleet');
    }
    if (!m) return null;
    return {
      id: m.organizationId,
      type: m.organization.type,
      name: m.organization.name,
      verification: m.organization.verificationStatus,
      membershipId: m.id,
      role: m.role,
    };
  }

  /** Cheap "last seen" bookkeeping: at most one write per user per 5 minutes. */
  private touchLastSeen(user: User): void {
    const now = Date.now();
    if (now - (this.lastSeenWrites.get(user.id) ?? 0) < 300_000) return;
    this.lastSeenWrites.set(user.id, now);
    void this.users.update(user.id, { appLastSeenAt: new Date() }).catch(() => undefined);
  }
}
