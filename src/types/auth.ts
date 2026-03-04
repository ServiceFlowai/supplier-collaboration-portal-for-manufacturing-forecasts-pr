export type SSOProviderType = 'SAML' | 'OIDC';

export enum UserRole {
  MANUFACTURER_ADMIN = 'MANUFACTURER_ADMIN',
  BUYER = 'BUYER',
  PLANNER = 'PLANNER',
  SUPPLIER_ADMIN = 'SUPPLIER_ADMIN',
  SUPPLIER_SALES_OPS = 'SUPPLIER_SALES_OPS',
}

export type PartyType = 'MANUFACTURER' | 'SUPPLIER';

export type Permission =
  | 'allocation:read'
  | 'allocation:write'
  | 'allocation:approve'
  | 'configuration:read'
  | 'configuration:write'
  | 'supplier:read'
  | 'supplier:write'
  | 'pr:read'
  | 'tenant:admin';

export interface TenantScope {
  tenantId: string;
  partyType: PartyType;
  plantIds: string[];
  itemIds: string[];
  restrictedSupplierIds?: string[];
  restrictedManufacturerIds?: string[];
  retentionPolicyDays?: number;
  displayName?: string;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  tenantScopes: TenantScope[];
  lastLoginAt: string;
  ssoProvider?: SSOProviderType;
  metadata?: Record<string, string | number | boolean>;
}

export interface AuthSessionTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  provider: SSOProviderType;
}

export interface TenantContext {
  tenantId: string;
  displayName: string;
  partyType: PartyType;
  defaultRetentionDays: number;
}

export const RBAC_MATRIX: Record<UserRole, Permission[]> = {
  [UserRole.MANUFACTURER_ADMIN]: [
    'allocation:read',
    'allocation:write',
    'allocation:approve',
    'configuration:read',
    'configuration:write',
    'supplier:read',
    'supplier:write',
    'pr:read',
    'tenant:admin',
  ],
  [UserRole.BUYER]: ['allocation:read', 'allocation:write', 'supplier:read', 'pr:read'],
  [UserRole.PLANNER]: ['allocation:read', 'allocation:approve', 'pr:read'],
  [UserRole.SUPPLIER_ADMIN]: ['allocation:read', 'supplier:read', 'supplier:write'],
  [UserRole.SUPPLIER_SALES_OPS]: ['allocation:read', 'supplier:read'],
};

export const ROLE_DISPLAY_NAME: Record<UserRole, string> = {
  [UserRole.MANUFACTURER_ADMIN]: 'Manufacturer Admin',
  [UserRole.BUYER]: 'Buyer',
  [UserRole.PLANNER]: 'Planner',
  [UserRole.SUPPLIER_ADMIN]: 'Supplier Admin',
  [UserRole.SUPPLIER_SALES_OPS]: 'Supplier Sales Ops',
};

export function getPermissionsForRole(role: UserRole): Permission[] {
  return RBAC_MATRIX[role] ?? [];
}

export function aggregatePermissions(roles: UserRole[]): Set<Permission> {
  return roles.reduce<Set<Permission>>((acc, role) => {
    getPermissionsForRole(role).forEach((permission) => acc.add(permission));
    return acc;
  }, new Set<Permission>());
}

export function hasPermission(roles: UserRole[], permission: Permission): boolean {
  return roles.some((role) => getPermissionsForRole(role).includes(permission));
}

export function hasAnyRole(roles: UserRole[], allowedRoles: UserRole[]): boolean {
  return roles.some((role) => allowedRoles.includes(role));
}
