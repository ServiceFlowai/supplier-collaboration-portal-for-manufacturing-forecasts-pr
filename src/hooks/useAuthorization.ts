import { useMemo } from 'react';
import { useAuthContext } from '../context/AuthContext';
import { Permission, UserRole } from '../types/auth';

interface AuthorizationOptions {
  anyOfRoles?: UserRole[];
  allOfRoles?: UserRole[];
  permission?: Permission;
  plantId?: string;
  itemId?: string;
  tenantId?: string;
}

interface AuthorizationResult {
  canAccess: boolean;
  reason?: string;
  isAuthenticated: boolean;
}

export const useAuthorization = (options: AuthorizationOptions = {}): AuthorizationResult => {
  const { user, isAuthenticated, activeTenant, hasPermission: contextHasPermission } = useAuthContext();

  return useMemo<AuthorizationResult>(() => {
    if (!isAuthenticated || !user) {
      return { canAccess: false, reason: 'User is not authenticated.', isAuthenticated };
    }

    const {
      anyOfRoles,
      allOfRoles,
      permission,
      plantId,
      itemId,
      tenantId,
    } = options;

    const resolvedTenantId = tenantId ?? activeTenant?.tenantId;
    if (resolvedTenantId) {
      const tenantScope = user.tenantScopes.find((scope) => scope.tenantId === resolvedTenantId);
      if (!tenantScope) {
        return {
          canAccess: false,
          reason: 'User lacks access to the requested tenant.',
          isAuthenticated,
        };
      }

      if (plantId && tenantScope.plantIds.length > 0 && !tenantScope.plantIds.includes(plantId)) {
        return {
          canAccess: false,
          reason: 'Insufficient plant access for this user.',
          isAuthenticated,
        };
      }

      if (itemId && tenantScope.itemIds.length > 0 && !tenantScope.itemIds.includes(itemId)) {
        return {
          canAccess: false,
          reason: 'Insufficient item access for this user.',
          isAuthenticated,
        };
      }
    }

    if (anyOfRoles?.length && !anyOfRoles.some((role) => user.roles.includes(role))) {
      return { canAccess: false, reason: 'Required role missing.', isAuthenticated };
    }

    if (allOfRoles?.length && allOfRoles.some((role) => !user.roles.includes(role))) {
      return { canAccess: false, reason: 'Missing one or more mandatory roles.', isAuthenticated };
    }

    if (permission && !contextHasPermission(permission)) {
      return { canAccess: false, reason: 'Required permission missing.', isAuthenticated };
    }

    return { canAccess: true, isAuthenticated };
  }, [isAuthenticated, user, activeTenant, contextHasPermission, options]);
};
