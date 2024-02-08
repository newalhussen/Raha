import type { MemberRole, OrgType, StaffRole } from './enums';

/**
 * Permissions are granted by (organization type, member role) for customer-side users,
 * and by staff role for Raha operations. The API enforces them with `@RequirePermissions`;
 * the web apps use the same matrix to hide actions the user cannot perform.
 */
export const ORG_PERMISSIONS = [
  'org:read',
  'org:update',
  'members:manage',
  'shipment:create',
  'shipment:read',
  'shipment:cancel',
  'shipment:confirm_delivery',
  'match:book', // shipper side: book a truck for a shipment
  'match:respond', // accept / decline a proposal addressed to this org
  'message:post',
  'payment:read',
  'payment:record',
  'broker:log_load',
  'broker:offer',
  'broker:network',
  'fleet:trucks',
  'fleet:drivers',
  'capacity:publish',
  'offer:assign',
  'driver:trips',
] as const;
export type OrgPermission = (typeof ORG_PERMISSIONS)[number];

export const STAFF_PERMISSIONS = [
  'ops:read',
  'ops:verify',
  'ops:match',
  'ops:support',
  'ops:finance',
  'ops:users',
  'ops:admin',
] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];

export type Permission = OrgPermission | StaffPermission;

const SHIPPER_STAFF: OrgPermission[] = ['org:read', 'shipment:create', 'shipment:read', 'match:book', 'match:respond', 'message:post', 'payment:read'];
const SHIPPER_MANAGER: OrgPermission[] = [...SHIPPER_STAFF, 'shipment:cancel', 'shipment:confirm_delivery', 'payment:record'];
const SHIPPER_OWNER: OrgPermission[] = [...SHIPPER_MANAGER, 'org:update', 'members:manage'];

const FLEET_DRIVER: OrgPermission[] = ['org:read', 'driver:trips', 'capacity:publish', 'match:respond', 'message:post'];
const FLEET_MANAGER: OrgPermission[] = [
  'org:read',
  'fleet:trucks',
  'fleet:drivers',
  'capacity:publish',
  'offer:assign',
  'match:respond',
  'shipment:read',
  'message:post',
  'payment:read',
  'payment:record',
];
const FLEET_OWNER: OrgPermission[] = [...FLEET_MANAGER, 'org:update', 'members:manage'];

const BROKER_DISPATCHER: OrgPermission[] = [
  'org:read',
  'shipment:create',
  'shipment:read',
  'broker:log_load',
  'broker:offer',
  'broker:network',
  'capacity:publish',
  'match:book',
  'match:respond',
  'message:post',
  'payment:read',
  'payment:record',
];
const BROKER_OWNER: OrgPermission[] = [...BROKER_DISPATCHER, 'shipment:cancel', 'shipment:confirm_delivery', 'org:update', 'members:manage'];

/** Roles that may exist per organization type — also what the invite form offers. */
export const ASSIGNABLE_ROLES: Record<OrgType, MemberRole[]> = {
  shipper: ['owner', 'manager', 'staff'],
  fleet: ['owner', 'manager', 'driver'],
  brokerage: ['owner', 'dispatcher'],
};

const MATRIX: Record<OrgType, Partial<Record<MemberRole, OrgPermission[]>>> = {
  shipper: { owner: SHIPPER_OWNER, manager: SHIPPER_MANAGER, staff: SHIPPER_STAFF },
  fleet: { owner: FLEET_OWNER, manager: FLEET_MANAGER, driver: FLEET_DRIVER },
  brokerage: { owner: BROKER_OWNER, dispatcher: BROKER_DISPATCHER },
};

export function orgPermissionsFor(type: OrgType, role: MemberRole): OrgPermission[] {
  return MATRIX[type][role] ?? [];
}

const STAFF_MATRIX: Record<StaffRole, StaffPermission[]> = {
  support: ['ops:read', 'ops:support', 'ops:match'],
  verifier: ['ops:read', 'ops:verify'],
  finance: ['ops:read', 'ops:finance'],
  admin: ['ops:read', 'ops:verify', 'ops:match', 'ops:support', 'ops:finance', 'ops:users', 'ops:admin'],
};

export function staffPermissionsFor(role: StaffRole): StaffPermission[] {
  return STAFF_MATRIX[role] ?? [];
}

export function hasPermission(granted: readonly string[], needed: Permission): boolean {
  return granted.includes(needed);
}

/** Which console a member lands in. */
export const HOME_BY_ORG_TYPE: Record<OrgType, string> = {
  shipper: '/shipper/shipments',
  brokerage: '/broker/match-board',
  fleet: '/fleet/board',
};
