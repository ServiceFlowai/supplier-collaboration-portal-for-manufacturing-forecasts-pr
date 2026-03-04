import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateOpenQuantity, evaluateSupplierEligibility } from '../../../utils/openQuantity';
import { NotificationService } from '../../../services/notificationService';
import {
  EligibleSupplier,
  PurchaseRequestLine,
  ReallocationRequestPayload,
  ReallocationResponse,
  ReallocationTriggerMode,
  SupplierProfile,
} from '../../../types/procurement';

interface UseReallocationWorkflowOptions {
  line: PurchaseRequestLine;
  candidateSuppliers: SupplierProfile[];
  autoTrigger?: boolean;
}

interface UseReallocationWorkflowResult {
  openQuantity: number;
  eligibleSuppliers: EligibleSupplier[];
  triggerReallocation: (supplierId: string, triggerMode?: ReallocationTriggerMode) => Promise<ReallocationResponse | null>;
  isSubmitting: boolean;
  error: string | null;
  autoTriggeredSupplierId?: string;
  autoReallocationEnabled: boolean;
  setAutoReallocationEnabled: (enabled: boolean) => void;
  hasAutoReallocationCapability: boolean;
}

const REALLOCATION_API_ENDPOINT = '/api/purchase-requests/reallocate';

const buildPayload = (
  line: PurchaseRequestLine,
  supplierId: string,
  quantity: number,
  triggerMode: ReallocationTriggerMode
): ReallocationRequestPayload => ({
  supplierId,
  lineId: line.id,
  purchaseRequestId: line.purchaseRequestId,
  quantity,
  triggerMode,
  reason: triggerMode === 'AUTO' ? 'AUTO_TRIGGERED_PARTIAL_OR_LATE' : 'MANUAL_TRIGGER_BUYER_REQUEST',
  sourceCommitmentIds: line.commitments.map((commitment) => commitment.id),
});

const postReallocation = async (payload: ReallocationRequestPayload): Promise<ReallocationResponse> => {
  const response = await fetch(REALLOCATION_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Failed to trigger reallocation (${response.status}): ${message}`);
  }

  return response.json() as Promise<ReallocationResponse>;
};

export const useReallocationWorkflow = (
  options: UseReallocationWorkflowOptions
): UseReallocationWorkflowResult => {
  const { line, candidateSuppliers, autoTrigger = true } = options;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoTriggeredSupplierId, setAutoTriggeredSupplierId] = useState<string | undefined>(undefined);
  const [autoReallocationEnabled, setAutoReallocationEnabled] = useState<boolean>(
    options.line.sourcingPolicy.allowAutoReallocation ?? autoTrigger
  );
  const autoReallocationRef = useRef<boolean>(false);

  const openQuantity = useMemo(() => calculateOpenQuantity(line), [line]);

  const eligibleSuppliers = useMemo<EligibleSupplier[]>(() => {
    return candidateSuppliers
      .map<EligibleSupplier>((supplier) => ({
        supplier,
        eligibility: evaluateSupplierEligibility(line, supplier, line.sourcingPolicy),
        ranking: line.supplierRankings.find((ranking) => ranking.supplierId === supplier.id) ?? undefined,
      }))
      .sort((a, b) => {
        const rankA = a.ranking?.rank ?? Number.MAX_SAFE_INTEGER;
        const rankB = b.ranking?.rank ?? Number.MAX_SAFE_INTEGER;
        if (rankA === rankB) {
          return a.supplier.name.localeCompare(b.supplier.name);
        }
        return rankA - rankB;
      });
  }, [candidateSuppliers, line]);

  const firstEligibleAlternative = useMemo(() => {
    const committedSupplierIds = new Set(line.commitments.map((commitment) => commitment.supplierId));
    return eligibleSuppliers.find(
      (candidate) => candidate.eligibility.eligible && !committedSupplierIds.has(candidate.supplier.id)
    );
  }, [eligibleSuppliers, line.commitments]);

  const hasAutoReallocationCapability = Boolean(
    line.sourcingPolicy.allowAutoReallocation && (line.sourcingPolicy.autoReallocateOnLate || line.sourcingPolicy.autoReallocateOnPartial)
  );

  const triggerReallocation = useCallback<
    UseReallocationWorkflowResult['triggerReallocation']
  >(
    async (supplierId: string, triggerMode: ReallocationTriggerMode = 'MANUAL') => {
      if (!supplierId) {
        setError('Please select a supplier to reallocate the open quantity.');
        return null;
      }

      if (openQuantity <= 0) {
        setError('No open quantity remains to allocate.');
        return null;
      }

      setIsSubmitting(true);
      setError(null);
      try {
        const payload = buildPayload(line, supplierId, openQuantity, triggerMode);
        const response = await postReallocation(payload);

        const supplier = candidateSuppliers.find((item) => item.id === supplierId);
        if (supplier) {
          try {
            await NotificationService.notifySupplierOfReallocation(supplier, {
              channel: 'EMAIL',
              recipient: { email: supplier.primaryContactEmail ?? '' },
              subject: `New reallocation request - PR ${line.purchaseRequestId} Line ${line.lineNumber}`,
              body: `You have been allocated the remaining quantity (${openQuantity}) for PR ${line.purchaseRequestId} line ${line.lineNumber}. Please review and respond within the SLA.`,
              linkUrl: `/supplier/requests/${response.id}`,
            });
          } catch (notificationError) {
            // eslint-disable-next-line no-console
            console.error('Failed to notify supplier of reallocation', notificationError);
          }
        }

        if (triggerMode === 'AUTO') {
          setAutoTriggeredSupplierId(supplierId);
        }

        return response;
      } catch (submissionError) {
        const message = submissionError instanceof Error ? submissionError.message : 'Unknown error during reallocation.';
        setError(message);
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [candidateSuppliers, line, openQuantity]
  );

  useEffect(() => {
    if (!autoReallocationEnabled || autoReallocationRef.current) {
      return;
    }

    const committedQuantity = line.commitments.reduce((total, commitment) => total + commitment.committedQuantity, 0);
    const hasLateCommitment = line.commitments.some((commitment) => commitment.status === 'LATE');
    const hasPartialCommitment = committedQuantity < line.quantity;

    const policy = line.sourcingPolicy;

    const shouldAutoReallocate =
      openQuantity > 0 &&
      ((policy.autoReallocateOnLate && hasLateCommitment) || (policy.autoReallocateOnPartial && hasPartialCommitment));

    if (!shouldAutoReallocate) {
      return;
    }

    const candidate = firstEligibleAlternative;
    if (!candidate) {
      return;
    }

    autoReallocationRef.current = true;
    void triggerReallocation(candidate.supplier.id, 'AUTO').catch((error) => {
      setError(error instanceof Error ? error.message : 'Auto reallocation failed.');
      autoReallocationRef.current = false;
    });
  }, [autoReallocationEnabled, firstEligibleAlternative, line, openQuantity, triggerReallocation]);

  useEffect(() => {
    autoReallocationRef.current = false;
    setAutoTriggeredSupplierId(undefined);
  }, [line.id]);

  return {
    openQuantity,
    eligibleSuppliers,
    triggerReallocation,
    isSubmitting,
    error,
    autoTriggeredSupplierId,
    autoReallocationEnabled,
    setAutoReallocationEnabled,
    hasAutoReallocationCapability,
  };
};
