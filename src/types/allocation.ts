import { UserRole } from './auth';

export type AllocationAction =
  | 'PR_CREATED'
  | 'SPLIT'
  | 'REALLOCATED'
  | 'REALLOCATION_REVERSAL'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'ADJUSTED';

export interface PurchaseRequisitionLine {
  id: string;
  lineNumber: string;
  materialNumber: string;
  description?: string;
  requestedQuantity: number;
  uom: string;
  needByDate?: string;
  createdAt: string;
  plantId?: string;
  plantName?: string;
}

export interface AllocationEvent {
  eventId: string;
  prLineId: string;
  action: AllocationAction;
  actorUserId: string;
  actorRole: UserRole;
  timestamp: string;
  note?: string;
  previousQuantity?: number;
  newQuantity?: number;
  sourceEventId?: string;
}

export interface SupplierSplit {
  allocationEventId: string;
  supplierId: string;
  supplierName: string;
  quantity: number;
  plantId?: string;
  plantName?: string;
  committedDate?: string;
  comments?: string;
}

export interface AllocationTimelineEntry {
  event: AllocationEvent;
  splits: SupplierSplit[];
  totalAllocatedQuantity: number;
  remainingQuantity: number;
  cumulativeAllocatedQuantity: number;
}

export interface AllocationLinkNode {
  eventId: string;
  parentEventId?: string;
  supplierId?: string;
  quantity: number;
  timestamp: string;
}

export interface AllocationTrace {
  prLine: PurchaseRequisitionLine;
  originalQuantity: number;
  latestAllocationEventId: string;
  createdByUserId: string;
  timeline: AllocationTimelineEntry[];
  linkChain: AllocationLinkNode[];
}
