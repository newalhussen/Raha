import type { ClientApp, MemberRole, OrgPermission, OrgType, StaffPermission, StaffRole, VerificationStatus } from '@raha/contracts';
import type { Request } from 'express';
import { DomainError } from './errors';

export interface ActiveOrg {
  id: string;
  type: OrgType;
  name: string;
  verification: VerificationStatus;
  membershipId: string;
  role: MemberRole;
}

/** Everything a handler needs to know about "who is calling and as whom". Built by AuthGuard. */
export interface RequestContext {
  userId: string;
  fullName: string;
  phone: string;
  app: ClientApp;
  isStaff: boolean;
  staffRole: StaffRole | null;
  /** Organization the caller is acting for (X-Org-Id, or their only membership). */
  org: ActiveOrg | null;
  /** Org permissions (from role) + staff permissions. */
  permissions: Array<OrgPermission | StaffPermission>;
  ip: string | null;
}

export type AuthedRequest = Request & { ctx: RequestContext };

export function requireOrg(ctx: RequestContext): ActiveOrg {
  if (!ctx.org) throw new DomainError('org_required', 'Select which organization you are acting for (X-Org-Id header)', 400);
  return ctx.org;
}

export function can(ctx: RequestContext, permission: OrgPermission | StaffPermission): boolean {
  return ctx.permissions.includes(permission);
}
