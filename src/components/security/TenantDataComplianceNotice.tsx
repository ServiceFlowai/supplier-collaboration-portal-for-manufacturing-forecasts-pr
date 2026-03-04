import React, { useMemo } from 'react';
import { useAuthContext } from '../../context/AuthContext';
import {
  DataProtectionPolicy,
  describeDataProtectionPolicy,
  resolveDataProtectionPolicy,
} from '../../services/security/dataProtection';

export const TenantDataComplianceNotice: React.FC = () => {
  const { activeTenant } = useAuthContext();

  const policy = useMemo<DataProtectionPolicy | undefined>(() => {
    if (!activeTenant) {
      return undefined;
    }
    return resolveDataProtectionPolicy(activeTenant);
  }, [activeTenant]);

  if (!activeTenant || !policy) {
    return null;
  }

  return (
    <aside
      style={{
        borderRadius: '0.75rem',
        padding: '1rem',
        border: '1px solid #d0d5dd',
        background: '#f8fafc',
        color: '#475467',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
      }}
      role="note"
      aria-label="Tenant data compliance policy"
    >
      <span style={{ fontWeight: 600, color: '#101828' }}>
        Data protection · {activeTenant.displayName ?? activeTenant.tenantId}
      </span>
      <span>{describeDataProtectionPolicy(policy)}</span>
    </aside>
  );
};
