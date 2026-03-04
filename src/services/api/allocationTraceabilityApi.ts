import { AllocationTrace } from '../../types/allocation';
import { TenantScopedClient } from '../security/tenantScopedClient';

export interface AllocationSplitPayload {
  allocationEventId?: string;
  supplierId: string;
  quantity: number;
  plantId?: string;
  committedDate?: string;
  note?: string;
}

export async function fetchAllocationTrace(
  prLineId: string,
  client: TenantScopedClient,
): Promise<AllocationTrace> {
  return client.get<AllocationTrace>(`/allocation-trace/${encodeURIComponent(prLineId)}`);
}

export async function createAllocationSplit(
  prLineId: string,
  payload: AllocationSplitPayload,
  client: TenantScopedClient,
): Promise<AllocationTrace> {
  return client.post<AllocationTrace>(
    `/allocation-trace/${encodeURIComponent(prLineId)}/splits`,
    payload,
  );
}
