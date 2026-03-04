import { TenantScope } from '../../types/auth';

export type SecretsManagerType = 'vault' | 'awsKms' | 'gcpKms';

const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL ?? '/api').replace(/\/$/, '');
const defaultRetentionDays = Number(process.env.REACT_APP_DEFAULT_RETENTION_DAYS ?? '365');
const secretsManager = (process.env.REACT_APP_SECRETS_MANAGER as SecretsManagerType) ?? 'vault';

const retentionOverrides: Readonly<Record<string, number>> = (() => {
  const raw = process.env.REACT_APP_RETENTION_OVERRIDES;
  if (!raw) {
    return Object.freeze({});
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return Object.freeze(parsed);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Invalid retention override JSON configuration', error);
    return Object.freeze({});
  }
})();

export interface DataProtectionPolicy {
  tenantId: string;
  encryptionInTransit: boolean;
  encryptionAtRest: boolean;
  secretsManager: SecretsManagerType;
  retentionDays: number;
  lastEvaluatedAt: string;
}

export interface ScopedSecretRequest {
  tenantId: string;
  secretName: string;
  purpose: string;
  ttlSeconds?: number;
}

export const ensureSecureContext = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  const { protocol, hostname } = window.location;
  if (protocol !== 'https:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error('Insecure context detected: HTTPS is required to satisfy encryption-in-transit.');
  }
};

export function resolveDataProtectionPolicy(scope: TenantScope): DataProtectionPolicy {
  const retentionDays =
    scope.retentionPolicyDays ?? retentionOverrides[scope.tenantId] ?? defaultRetentionDays;

  return {
    tenantId: scope.tenantId,
    encryptionInTransit: true,
    encryptionAtRest: true,
    secretsManager,
    retentionDays,
    lastEvaluatedAt: new Date().toISOString(),
  };
}

export function describeDataProtectionPolicy(policy: DataProtectionPolicy): string {
  return `Data retained for ${policy.retentionDays} days with ${policy.secretsManager.toUpperCase()} managed secrets and AES-256 encryption in transit and at rest.`;
}

export async function requestScopedSecret(
  fetcher: typeof fetch,
  request: ScopedSecretRequest,
  accessToken?: string,
): Promise<string> {
  const response = await fetcher(`${API_BASE_URL}/security/secrets/lease`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'X-Tenant-Id': request.tenantId,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to lease secret ${request.secretName} for tenant ${request.tenantId}`);
  }

  const payload = (await response.json()) as { secret: string };
  return payload.secret;
}
