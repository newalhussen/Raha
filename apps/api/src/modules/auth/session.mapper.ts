import { orgPermissionsFor, staffPermissionsFor, type MembershipDto, type SessionDto, type UserDto } from '@raha/contracts';
import type { Membership, User } from '../../database/entities';

export function toUserDto(u: User): UserDto {
  return {
    id: u.id,
    fullName: u.fullName,
    phone: u.phone,
    email: u.email,
    language: u.language,
    isStaff: u.isStaff,
    staffRole: u.staffRole,
    telegramLinked: !!u.telegramChatId,
    notifyTelegram: u.notifyTelegram,
    notifySms: u.notifySms,
    notifyCall: u.notifyCall,
    dataSaver: u.dataSaver,
  };
}

/** `membership.organization` must be loaded. */
export function toMembershipDto(m: Membership): MembershipDto {
  return {
    id: m.id,
    organizationId: m.organizationId,
    organizationName: m.organization.name,
    organizationType: m.organization.type,
    organizationVerification: m.organization.verificationStatus,
    role: m.role,
    status: m.status,
    permissions: orgPermissionsFor(m.organization.type, m.role),
  };
}

export function toSessionDto(user: User, memberships: Membership[]): SessionDto {
  return {
    user: toUserDto(user),
    memberships: memberships.map(toMembershipDto),
    staffPermissions: user.isStaff && user.staffRole ? staffPermissionsFor(user.staffRole) : [],
  };
}
