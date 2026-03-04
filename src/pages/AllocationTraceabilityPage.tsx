import React from 'react';
import { useParams } from 'react-router-dom';
import AllocationTimeline from '../components/allocation/AllocationTimeline';
import { TenantDataComplianceNotice } from '../components/security/TenantDataComplianceNotice';
import { useAuthorization } from '../hooks/useAuthorization';
import { UserRole } from '../types/auth';

export const AllocationTraceabilityPage: React.FC = () => {
  const { prLineId } = useParams<{ prLineId: string }>();
  const { canAccess, reason } = useAuthorization({
    permission: 'allocation:read',
    anyOfRoles: [
      UserRole.MANUFACTURER_ADMIN,
      UserRole.BUYER,
      UserRole.PLANNER,
      UserRole.SUPPLIER_ADMIN,
      UserRole.SUPPLIER_SALES_OPS,
    ],
  });

  if (!prLineId) {
    return <div>Purchase requisition line identifier is required to view allocations.</div>;
  }

  if (!canAccess) {
    return (
      <div role="alert" style={{ color: '#b42318' }}>
        You do not have access to view this allocation trace{reason ? `: ${reason}` : '.'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <TenantDataComplianceNotice />
      <AllocationTimeline prLineId={prLineId} autoRefreshIntervalMs={60_000} />
    </div>
  );
};

export default AllocationTraceabilityPage;
