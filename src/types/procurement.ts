export type CommitmentStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'LATE' | 'PARTIAL';

export type NotificationChannel = 'IN_APP' | 'EMAIL';

export interface NotificationRecipient {
  userId?: string;
  email?: string;
  roleId?: string;
  supplierId?: string;
}

export interface NotificationPayload {
  id?: string;
  channel: NotificationChannel;
  recipient: NotificationRecipient;
  subject: string;
  body: string;
  linkUrl?: string;
  metadata?: Record<string, unknown>;
  sendAt?: string;
}

export interface BuyerContact {
  id: string;
  name: string;
  email: string;
}

export interface SupplierGeography {
  country: string;
  region?: string;
}

export interface SupplierProfile {
  id: string;
  name: string;
  rank?: number;
  leadTimeDays: number;
  minimumOrderQuantity?: number;
  approvedPolicies?: string[];
  approvedVendorListIds?: string[];
  approvedRegions?: SupplierGeography[];
  allowedCountries?: string[];
  allowedRegions?: string[];
  primaryContactEmail?: string;
  primaryContactName?: string;
  timezone?: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface PurchaseCommitment {
  id: string;
  supplierId: string;
  committedQuantity: number;
  promisedDate: string;
  status: CommitmentStatus;
  createdAt: string;
  updatedAt: string;
  respondedAt?: string;
}

export interface SupplierRanking {
  supplierId: string;
  rank: number;
}

export interface GeographicConstraint {
  countries?: string[];
  regions?: string[];
}

export interface SourcingPolicy {
  id: string;
  name: string;
  approvedVendorListIds?: string[];
  requireApprovedVendor?: boolean;
  allowedSuppliers?: string[];
  maxLeadTimeDays?: number;
  minOrderQuantity?: number;
  maxRankAllowed?: number;
  geographicConstraints?: GeographicConstraint[];
  allowAutoReallocation?: boolean;
  autoReallocateOnPartial?: boolean;
  autoReallocateOnLate?: boolean;
}

export interface PurchaseRequestLine {
  id: string;
  purchaseRequestId: string;
  lineNumber: string;
  materialCode: string;
  description?: string;
  quantity: number;
  uom: string;
  buyer: BuyerContact;
  buyerOrganizationId: string;
  requiredDate: string;
  releasedAt: string;
  plantRegion?: string;
  sourcingPolicy: SourcingPolicy;
  supplierRankings: SupplierRanking[];
  commitments: PurchaseCommitment[];
}

export interface SlaReminderRule {
  offsetHours: number;
  channels: NotificationChannel[];
  escalateToEmails?: string[];
  escalateToRoleIds?: string[];
}

export interface SlaPolicy {
  id: string;
  name: string;
  responseHours: number;
  reminderRules: SlaReminderRule[];
  supplierIds?: string[];
  supplierRanks?: number[];
}

export interface SlaConfig {
  defaultPolicyId: string;
  policies: SlaPolicy[];
}

export interface SlaReminderDue {
  rule: SlaReminderRule;
  scheduledFor: string;
  hasEscalation: boolean;
}

export interface CommitmentSlaStatus {
  commitmentId: string;
  lineId: string;
  supplierId: string;
  dueAt: string;
  evaluatedAt: string;
  isOverdue: boolean;
  hoursRemaining: number;
  hoursPastDue: number;
  policyId: string;
  policyName: string;
  remindersDue: SlaReminderDue[];
}

export interface SupplierEligibilityResult {
  eligible: boolean;
  reasons: string[];
  policyId: string;
  score: number;
}

export interface EligibleSupplier {
  supplier: SupplierProfile;
  eligibility: SupplierEligibilityResult;
  ranking?: SupplierRanking;
}

export type ReallocationTriggerMode = 'MANUAL' | 'AUTO';

export interface ReallocationRequestPayload {
  supplierId: string;
  lineId: string;
  purchaseRequestId: string;
  quantity: number;
  triggerMode: ReallocationTriggerMode;
  reason: string;
  sourceCommitmentIds: string[];
}

export interface ReallocationResponse {
  id: string;
  supplierId: string;
  lineId: string;
  quantity: number;
  createdAt: string;
  triggerMode: ReallocationTriggerMode;
}
