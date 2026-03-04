import { useCallback, useEffect, useRef, useState } from 'react';
import { AllocationTrace } from '../types/allocation';
import { fetchAllocationTrace } from '../services/api/allocationTraceabilityApi';
import { TenantScopedClient } from '../services/security/tenantScopedClient';
import { useAuthContext } from '../context/AuthContext';

interface UseAllocationTimelineArgs {
  prLineId: string;
  autoRefreshIntervalMs?: number;
  skip?: boolean;
}

interface UseAllocationTimelineResult {
  trace?: AllocationTrace;
  loading: boolean;
  error?: Error;
  refresh: () => Promise<void>;
  client?: TenantScopedClient;
}

export const useAllocationTimeline = ({
  prLineId,
  autoRefreshIntervalMs = 0,
  skip = false,
}: UseAllocationTimelineArgs): UseAllocationTimelineResult => {
  const { isAuthenticated, getTenantClient, activeTenant } = useAuthContext();
  const [trace, setTrace] = useState<AllocationTrace | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const clientRef = useRef<TenantScopedClient | undefined>(undefined);

  const resolveClient = useCallback((): TenantScopedClient => {
    if (!clientRef.current) {
      clientRef.current = getTenantClient(activeTenant?.tenantId);
    }
    return clientRef.current;
  }, [getTenantClient, activeTenant]);

  const load = useCallback(async () => {
    if (skip || !isAuthenticated || !prLineId) {
      return;
    }
    setLoading(true);
    const client = resolveClient();
    try {
      const data = await fetchAllocationTrace(prLineId, client);
      setTrace(data);
      setError(undefined);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [skip, isAuthenticated, prLineId, resolveClient]);

  useEffect(() => {
    clientRef.current = undefined;
  }, [activeTenant?.tenantId]);

  useEffect(() => {
    if (!skip && isAuthenticated && prLineId) {
      load().catch(() => undefined);
    }
  }, [skip, isAuthenticated, prLineId, load]);

  useEffect(() => {
    if (!autoRefreshIntervalMs || autoRefreshIntervalMs <= 0) {
      return () => undefined;
    }
    const intervalId = window.setInterval(() => {
      load().catch(() => undefined);
    }, autoRefreshIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [autoRefreshIntervalMs, load]);

  return {
    trace,
    loading,
    error,
    refresh: () => load(),
    client: clientRef.current,
  };
};
