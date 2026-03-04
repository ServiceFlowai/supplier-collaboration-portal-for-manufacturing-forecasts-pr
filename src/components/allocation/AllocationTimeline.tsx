import React, { useMemo } from 'react';
import { AllocationTimelineEntry } from '../../types/allocation';
import { useAllocationTimeline } from '../../hooks/useAllocationTimeline';

interface AllocationTimelineProps {
  prLineId: string;
  showHeader?: boolean;
  autoRefreshIntervalMs?: number;
  onSupplierSelected?: (supplierId: string) => void;
}

const containerStyle: React.CSSProperties = {
  borderLeft: '2px solid #d0d5dd',
  paddingLeft: '1.5rem',
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const markerStyle: React.CSSProperties = {
  position: 'absolute',
  left: '-0.7rem',
  top: '0.4rem',
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  backgroundColor: '#344054',
  border: '2px solid #fff',
  boxShadow: '0 0 0 3px #d0d5dd',
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '0.75rem',
  border: '1px solid #e5e7eb',
  padding: '1rem',
  boxShadow: '0 10px 20px rgba(15, 23, 42, 0.08)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
};

const splitRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.2fr 0.8fr 0.8fr',
  gap: '0.75rem',
  padding: '0.5rem 0',
  alignItems: 'center',
  borderBottom: '1px solid #f1f5f9',
};

const legendStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  flexWrap: 'wrap',
  fontSize: '0.85rem',
  color: '#475467',
};

const AllocationTimeline: React.FC<AllocationTimelineProps> = ({
  prLineId,
  showHeader = true,
  autoRefreshIntervalMs = 0,
  onSupplierSelected,
}) => {
  const { trace, loading, error, refresh } = useAllocationTimeline({
    prLineId,
    autoRefreshIntervalMs,
  });

  const timelineEntries = trace?.timeline ?? [];
  const prLine = trace?.prLine;

  const dateTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    [],
  );

  if (loading && !trace) {
    return <div>Loading allocation timeline…</div>;
  }

  if (error) {
    return (
      <div role="alert" style={{ color: '#b42318' }}>
        <p>Failed to load allocation timeline: {error.message}</p>
        <button type="button" onClick={() => refresh()} style={{ marginTop: '0.5rem' }}>
          Retry
        </button>
      </div>
    );
  }

  if (!trace || timelineEntries.length === 0) {
    return <div>No allocation activity has been recorded for this purchase requisition line.</div>;
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {showHeader && prLine && (
        <header style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontSize: '1.125rem', fontWeight: 600, color: '#101828' }}>
            Allocation timeline for PR Line {prLine.lineNumber}
          </div>
          <div style={{ color: '#475467' }}>
            Material {prLine.materialNumber} · Requested {prLine.requestedQuantity} {prLine.uom}
            {prLine.plantName ? ` · ${prLine.plantName}` : ''}
          </div>
          <div style={legendStyle}>
            <span>Original quantity: {trace.originalQuantity}</span>
            <span>Remaining quantity: {timelineEntries[0]?.remainingQuantity ?? 0}</span>
            <button type="button" onClick={() => refresh()} style={{ padding: '0.25rem 0.75rem' }}>
              Refresh
            </button>
          </div>
        </header>
      )}
      <div style={containerStyle}>
        {timelineEntries.map((entry: AllocationTimelineEntry) => (
          <article key={entry.event.eventId} style={{ position: 'relative' }}>
            <span style={markerStyle} />
            <div style={cardStyle}>
              <div style={headerStyle}>
                <div style={{ fontWeight: 600, color: '#344054' }}>
                  {entry.event.action.replace(/_/g, ' ')} · {dateTimeFormatter.format(new Date(entry.event.timestamp))}
                </div>
                <div style={{ color: '#475467', fontSize: '0.9rem' }}>
                  Actor role: {entry.event.actorRole} · Remaining quantity: {entry.remainingQuantity}
                </div>
                {entry.event.note && <div style={{ color: '#667085' }}>{entry.event.note}</div>}
              </div>

              {entry.splits.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{
                    ...splitRowStyle,
                    fontWeight: 600,
                    borderBottom: '2px solid #e2e8f0',
                  }}>
                    <span>Supplier</span>
                    <span>Quantity</span>
                    <span>Plant</span>
                  </div>
                  {entry.splits.map((split) => (
                    <div key={`${split.allocationEventId}-${split.supplierId}`} style={splitRowStyle}>
                      <button
                        type="button"
                        onClick={() => onSupplierSelected?.(split.supplierId)}
                        style={{
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontWeight: 500,
                          color: '#1570ef',
                          cursor: onSupplierSelected ? 'pointer' : 'default',
                        }}
                        aria-label={`View allocations for supplier ${split.supplierName}`}
                      >
                        {split.supplierName}
                      </button>
                      <span>
                        {split.quantity}
                        {prLine?.uom ? ` ${prLine.uom}` : ''}
                      </span>
                      <span>{split.plantName ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}

              <footer style={{
                marginTop: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.85rem',
                color: '#475467',
              }}>
                <span>Cumulative allocated: {entry.cumulativeAllocatedQuantity}</span>
                <span>Total allocated this event: {entry.totalAllocatedQuantity}</span>
              </footer>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default AllocationTimeline;
