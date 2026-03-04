import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AuthenticatedUser,
  AuthSessionTokens,
  Permission,
  TenantScope,
  UserRole,
  aggregatePermissions,
  hasPermission as hasPermissionFromRoles,
} from '../types/auth';
import { buildSSOLoginUrl, getDefaultSSOProviderId } from '../services/auth/ssoProviders';
import { TenantScopedClient } from '../services/security/tenantScopedClient';

interface PersistedAuthState {
  user: AuthenticatedUser;
  session: AuthSessionTokens;
  activeTenantId?: string;
}

interface LoginOptions {
  providerId?: string;
  relayState?: string;
  prompt?: 'login' | 'consent';
  extraParams?: Record<string, string>;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  user?: AuthenticatedUser;
  session?: AuthSessionTokens;
  activeTenant?: TenantScope;
  tenants: TenantScope[];
  permissions: Set<Permission>;
  loginWithSSO: (options?: LoginOptions) => void;
  completeLogin: (user: AuthenticatedUser, session: AuthSessionTokens) => void;
  refreshSession: () => Promise<void>;
  logout: () => void;
  hasRole: (role: UserRole) => boolean;
  hasPermission: (permission: Permission) => boolean;
  setActiveTenant: (tenantId: string) => void;
  getTenantClient: (tenantId?: string) => TenantScopedClient;
  isSessionRefreshing: boolean;
}

interface AuthProviderProps {
  children: React.ReactNode;
  onSessionExpired?: () => void;
  preferredSSOProviderId?: string;
}

const STORAGE_KEY = 'scm.auth.state';
const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL ?? '/api').replace(/\/$/, '');

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  onSessionExpired,
  preferredSSOProviderId,
}) => {
  const [user, setUser] = useState<AuthenticatedUser | undefined>(undefined);
  const [session, setSession] = useState<AuthSessionTokens | undefined>(undefined);
  const [activeTenantId, setActiveTenantId] = useState<string | undefined>(undefined);
  const [isSessionRefreshing, setIsSessionRefreshing] = useState<boolean>(false);

  const sessionRef = useRef<AuthSessionTokens | undefined>();
  const userRef = useRef<AuthenticatedUser | undefined>();
  const activeTenantIdRef = useRef<string | undefined>();
  const tenantClientsRef = useRef<Map<string, TenantScopedClient>>(new Map());

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    activeTenantIdRef.current = activeTenantId;
  }, [activeTenantId]);

  const persistState = useCallback(
    (nextUser?: AuthenticatedUser, nextSession?: AuthSessionTokens, tenantId?: string) => {
      if (!nextUser || !nextSession) {
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      const payload: PersistedAuthState = {
        user: nextUser,
        session: nextSession,
        activeTenantId: tenantId,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    },
    [],
  );

  const logout = useCallback(() => {
    tenantClientsRef.current.clear();
    setUser(undefined);
    setSession(undefined);
    setActiveTenantId(undefined);
    activeTenantIdRef.current = undefined;
    persistState();
  }, [persistState]);

  const refreshSession = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession?.refreshToken) {
      logout();
      onSessionExpired?.();
      return;
    }

    setIsSessionRefreshing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentSession.refreshToken }),
      });

      if (!response.ok) {
        throw new Error(`Refresh failed with status ${response.status}`);
      }

      const payload = (await response.json()) as {
        accessToken: string;
        expiresIn: number;
      };

      const nextSession: AuthSessionTokens = {
        ...currentSession,
        accessToken: payload.accessToken,
        expiresAt: Date.now() + payload.expiresIn * 1000,
      };

      setSession(nextSession);
      persistState(userRef.current, nextSession, activeTenantIdRef.current);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to refresh session', error);
      logout();
      onSessionExpired?.();
    } finally {
      setIsSessionRefreshing(false);
    }
  }, [API_BASE_URL, logout, onSessionExpired, persistState]);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedAuthState;
      setUser(parsed.user);
      setSession(parsed.session);
      setActiveTenantId(parsed.activeTenantId ?? parsed.user.tenantScopes[0]?.tenantId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to restore persisted auth state', error);
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!session?.refreshToken) {
      return;
    }
    const now = Date.now();
    const msUntilExpiry = session.expiresAt - now;
    if (msUntilExpiry <= 0) {
      refreshSession().catch(() => undefined);
      return;
    }
    const timeout = window.setTimeout(() => {
      refreshSession().catch(() => undefined);
    }, Math.max(msUntilExpiry - 60_000, 5_000));
    return () => window.clearTimeout(timeout);
  }, [session, refreshSession]);

  useEffect(() => {
    if (user && !activeTenantId) {
      setActiveTenantId(user.tenantScopes[0]?.tenantId);
    }
  }, [user, activeTenantId]);

  const activeTenant = useMemo(() => {
    if (!user) {
      return undefined;
    }
    if (activeTenantId) {
      return user.tenantScopes.find((scope) => scope.tenantId === activeTenantId) ?? user.tenantScopes[0];
    }
    return user.tenantScopes[0];
  }, [user, activeTenantId]);

  const setActiveTenant = useCallback(
    (tenantId: string) => {
      const currentUser = userRef.current;
      const currentSession = sessionRef.current;
      if (!currentUser || !currentSession) {
        throw new Error('No authenticated user available to set tenant');
      }
      if (!currentUser.tenantScopes.some((scope) => scope.tenantId === tenantId)) {
        throw new Error(`Tenant ${tenantId} is not accessible for the current user`);
      }
      setActiveTenantId(tenantId);
      activeTenantIdRef.current = tenantId;
      persistState(currentUser, currentSession, tenantId);
    },
    [persistState],
  );

  const completeLogin = useCallback(
    (nextUser: AuthenticatedUser, nextSession: AuthSessionTokens) => {
      setUser(nextUser);
      setSession(nextSession);
      const allowedTenantIds = nextUser.tenantScopes.map((scope) => scope.tenantId);
      const preferredTenantId =
        activeTenantIdRef.current && allowedTenantIds.includes(activeTenantIdRef.current)
          ? activeTenantIdRef.current
          : allowedTenantIds[0];
      setActiveTenantId(preferredTenantId);
      activeTenantIdRef.current = preferredTenantId;
      persistState(nextUser, nextSession, preferredTenantId);
    },
    [persistState],
  );

  const loginWithSSO = useCallback(
    (options?: LoginOptions) => {
      const providerId = options?.providerId ?? preferredSSOProviderId ?? getDefaultSSOProviderId();
      if (!providerId) {
        throw new Error('No SSO provider configured for the application.');
      }
      const loginUrl = buildSSOLoginUrl(providerId, {
        relayState: options?.relayState,
        prompt: options?.prompt,
        extraParams: options?.extraParams,
      });
      window.location.assign(loginUrl);
    },
    [preferredSSOProviderId],
  );

  const tenants = user?.tenantScopes ?? [];
  const permissions = useMemo(() => aggregatePermissions(user?.roles ?? []), [user]);

  const hasRole = useCallback((role: UserRole) => user?.roles.includes(role) ?? false, [user]);

  const hasPermission = useCallback(
    (permission: Permission) => (user ? hasPermissionFromRoles(user.roles, permission) : false),
    [user],
  );

  const getTenantClient = useCallback(
    (tenantId?: string) => {
      const resolvedTenantId = tenantId ?? activeTenantIdRef.current;
      if (!resolvedTenantId) {
        throw new Error('Tenant context is not defined');
      }
      const existing = tenantClientsRef.current.get(resolvedTenantId);
      if (existing) {
        return existing;
      }
      const client = new TenantScopedClient({
        baseUrl: API_BASE_URL,
        getAccessToken: () => sessionRef.current?.accessToken,
        getTenantId: () => resolvedTenantId,
        getCorrelationId: () =>
          window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      });
      tenantClientsRef.current.set(resolvedTenantId, client);
      return client;
    },
    [],
  );

  const isAuthenticated = Boolean(user && session && session.expiresAt > Date.now());

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      user,
      session,
      activeTenant,
      tenants,
      permissions,
      loginWithSSO,
      completeLogin,
      refreshSession,
      logout,
      hasRole,
      hasPermission,
      setActiveTenant,
      getTenantClient,
      isSessionRefreshing,
    }),
    [
      isAuthenticated,
      user,
      session,
      activeTenant,
      tenants,
      permissions,
      loginWithSSO,
      completeLogin,
      refreshSession,
      logout,
      hasRole,
      hasPermission,
      setActiveTenant,
      getTenantClient,
      isSessionRefreshing,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
