import React, { useEffect, useMemo, useState } from 'react';
import { useReallocationWorkflow } from '../hooks/useReallocationWorkflow';
import {
  PurchaseRequestLine,
  SupplierProfile,
  SlaConfig,
} from '../../../types/procurement';
import { useSlaNotifications } from '../hooks/useSlaNotifications';

interface ReallocationActionPanelProps {
  line: PurchaseRequestLine;
  candidateSuppliers: SupplierProfile[];
  slaConfig: SlaConfig;
  onReallocationComplete?: (supplierId: string) => void;
}

export const ReallocationActionPanel: React.FC<ReallocationActionPanelProps> = ({
  line,
  candidateSuppliers,
  slaConfig,
  onReallocationComplete,
}) => {
  useSlaNotifications({ lines: [line], slaConfig });

  const {
    openQuantity,
    eligibleSuppliers,
    triggerReallocation,
    isSubmitting,
    error,
    autoTriggeredSupplierId,
    autoReallocationEnabled,
    setAutoReallocationEnabled,
    hasAutoReallocationCapability,
  } = useReallocationWorkflow({ line, candidateSuppliers, autoTrigger: true });

  const committedSupplierIds = useMemo(() => new Set(line.commitments.map((commitment) => commitment.supplierId)), [line.commitments]);

  const initialSupplierId = useMemo(() => {
    const candidate = eligibleSuppliers.find((item) => item.eligibility.eligible && !committedSupplierIds.has(item.supplier.id));
    return candidate?.supplier.id ?? '';
  }, [committedSupplierIds, eligibleSuppliers]);

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(initialSupplierId);

  useEffect(() => {
    setSelectedSupplierId(initialSupplierId);
  }, [initialSupplierId]);

  const selectedSupplier = eligibleSuppliers.find((item) => item.supplier.id === selectedSupplierId);

  const handleManualReallocation = async (): Promise<void> => {
    const response = await triggerReallocation(selectedSupplierId, 'MANUAL');
    if (response && onReallocationComplete) {
      onReallocationComplete(selectedSupplierId);
    }
  };

  return (
    <section className="reallocation-panel">
      <header className="reallocation-panel__header">
        <div>
          <h3>Reallocation Workflow</h3>
          <p>Manage remaining open quantity across eligible suppliers.</p>
        </div>
        <div className="reallocation-panel__summary">
          <span className="reallocation-panel__summary-label">Open Quantity:</span>
          <span className="reallocation-panel__summary-value">{openQuantity}</span>
        </div>
      </header>

      {hasAutoReallocationCapability && (
        <div className="reallocation-panel__auto-toggle">
          <label className="reallocation-panel__auto-label">
            <input
              type="checkbox"
              checked={autoReallocationEnabled}
              onChange={(event) => setAutoReallocationEnabled(event.target.checked)}
              disabled={isSubmitting}
            />
            Enable automatic reallocation on late or partial commitments
          </label>
          <small>
            When enabled, the system will automatically send remaining open quantity to the next eligible supplier
            if Supplier 1 is late or partially committed.
          </small>
        </div>
      )}

      {autoTriggeredSupplierId && (
        <div className="reallocation-panel__auto-message">
          Automatically reallocated to supplier <strong>{autoTriggeredSupplierId}</strong> based on sourcing policy.
        </div>
      )}

      <div className="reallocation-panel__controls">
        <label htmlFor={`supplier-select-${line.id}`} className="reallocation-panel__select-label">
          Supplier
        </label>
        <select
          id={`supplier-select-${line.id}`}
          className="reallocation-panel__select"
          value={selectedSupplierId}
          onChange={(event) => setSelectedSupplierId(event.target.value)}
          disabled={isSubmitting}
        >
          <option value="">Select supplier</option>
          {eligibleSuppliers.map((candidate) => (
            <option key={candidate.supplier.id} value={candidate.supplier.id} disabled={!candidate.eligibility.eligible}>
              {candidate.supplier.name}
              {candidate.ranking ? ` (Rank ${candidate.ranking.rank})` : ''}
              {!candidate.eligibility.eligible ? ' - Not eligible' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="reallocation-panel__action-button"
          onClick={handleManualReallocation}
          disabled={isSubmitting || !selectedSupplierId || openQuantity <= 0 || (selectedSupplier && !selectedSupplier.eligibility.eligible)}
        >
          {isSubmitting ? 'Sending...' : 'Send remaining open to supplier'}
        </button>
      </div>

      {selectedSupplier && (
        <div className="reallocation-panel__eligibility">
          <h4>Eligibility assessment</h4>
          <p>Score: {selectedSupplier.eligibility.score}%</p>
          {selectedSupplier.eligibility.reasons.length > 0 ? (
            <ul>
              {selectedSupplier.eligibility.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="reallocation-panel__eligibility-pass">Supplier meets all sourcing policy criteria.</p>
          )}
        </div>
      )}

      {error && <div className="reallocation-panel__error">{error}</div>}

      <style jsx>{`
        .reallocation-panel {
          border: 1px solid #d0d5dd;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: #ffffff;
        }

        .reallocation-panel__header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }

        .reallocation-panel__summary {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }

        .reallocation-panel__summary-label {
          font-size: 0.875rem;
          color: #475467;
        }

        .reallocation-panel__summary-value {
          font-size: 1.5rem;
          font-weight: 600;
          color: #1d2939;
        }

        .reallocation-panel__auto-toggle {
          border: 1px solid #e4e7ec;
          border-radius: 10px;
          padding: 12px;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .reallocation-panel__auto-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
          color: #1d2939;
        }

        .reallocation-panel__auto-message {
          padding: 12px;
          border-left: 4px solid #16a34a;
          background: #dcfce7;
          color: #166534;
          border-radius: 8px;
        }

        .reallocation-panel__controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .reallocation-panel__select-label {
          font-weight: 500;
          color: #1d2939;
        }

        .reallocation-panel__select {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #d0d5dd;
          border-radius: 8px;
          font-size: 0.95rem;
        }

        .reallocation-panel__action-button {
          padding: 10px 16px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          background: #2563eb;
          color: #ffffff;
          font-weight: 600;
        }

        .reallocation-panel__action-button:disabled {
          background: #cbd5f5;
          cursor: not-allowed;
        }

        .reallocation-panel__eligibility {
          border: 1px solid #eaecf0;
          border-radius: 10px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: #f9fafb;
        }

        .reallocation-panel__eligibility-pass {
          color: #16a34a;
          font-weight: 500;
        }

        .reallocation-panel__error {
          color: #b42318;
          background: #fee4e2;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #fda29b;
        }

        @media (max-width: 720px) {
          .reallocation-panel__header {
            flex-direction: column;
            align-items: flex-start;
          }

          .reallocation-panel__controls {
            flex-direction: column;
            align-items: stretch;
          }

          .reallocation-panel__action-button {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
};
