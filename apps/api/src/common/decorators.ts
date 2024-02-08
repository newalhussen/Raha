import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { OrgPermission, OrgType, StaffPermission } from '@raha/contracts';
import type { AuthedRequest, RequestContext } from './request-context';

export const IS_PUBLIC = 'raha:public';
export const REQUIRED_PERMISSIONS = 'raha:permissions';
export const REQUIRED_ORG_TYPE = 'raha:org-type';
export const REQUIRES_DRIVER = 'raha:driver';

/** Skip authentication entirely (login, public receiver page, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Caller must hold ALL listed permissions (org permissions from their role, or staff permissions). */
export const RequirePermissions = (...perms: Array<OrgPermission | StaffPermission>) => SetMetadata(REQUIRED_PERMISSIONS, perms);

/** The active organization must be of this type. */
export const RequireOrgType = (...types: OrgType[]) => SetMetadata(REQUIRED_ORG_TYPE, types);

/** Caller must have a driver profile (driver app endpoints). */
export const RequireDriver = () => SetMetadata(REQUIRES_DRIVER, true);

/** Injects the RequestContext built by the AuthGuard. */
export const Ctx = createParamDecorator((_data: unknown, host: ExecutionContext): RequestContext => {
  return host.switchToHttp().getRequest<AuthedRequest>().ctx;
});
