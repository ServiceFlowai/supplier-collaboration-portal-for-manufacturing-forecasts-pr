import { SSOProviderType } from '../../types/auth';

export interface SSOProviderConfig {
  providerId: string;
  type: SSOProviderType;
  authorizationUrl: string;
  tokenUrl?: string;
  issuer?: string;
  clientId: string;
  redirectUri: string;
  audience?: string;
  scopes?: string[];
  metadataUrl?: string;
  relayStateParam?: string;
  default?: boolean;
}

export interface BuildSSOLoginUrlOptions {
  relayState?: string;
  prompt?: 'login' | 'consent';
  extraParams?: Record<string, string>;
}

const registry = new Map<string, SSOProviderConfig>();
let defaultProviderId: string | undefined = process.env.REACT_APP_DEFAULT_SSO_PROVIDER_ID;

export function registerSSOProvider(config: SSOProviderConfig): void {
  registry.set(config.providerId, config);
  if (config.default || !defaultProviderId) {
    defaultProviderId = config.providerId;
  }
}

export function registerSSOProviders(configs: SSOProviderConfig[]): void {
  configs.forEach((config) => registerSSOProvider(config));
}

export function listSSOProviders(): SSOProviderConfig[] {
  return Array.from(registry.values());
}

export function getSSOProviderConfig(providerId: string): SSOProviderConfig {
  const config = registry.get(providerId);
  if (!config) {
    throw new Error(`SSO provider ${providerId} is not registered`);
  }
  return config;
}

export function getDefaultSSOProviderId(): string | undefined {
  if (defaultProviderId && registry.has(defaultProviderId)) {
    return defaultProviderId;
  }
  const iterator = registry.values().next();
  return iterator.done ? undefined : iterator.value.providerId;
}

export function buildSSOLoginUrl(
  providerId: string,
  options: BuildSSOLoginUrlOptions = {},
): string {
  const config = getSSOProviderConfig(providerId);

  if (config.type === 'OIDC') {
    const url = new URL(config.authorizationUrl);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.scopes?.join(' ') ?? 'openid profile email');

    if (config.audience) {
      url.searchParams.set('audience', config.audience);
    }

    if (options.relayState) {
      url.searchParams.set('state', options.relayState);
    }

    if (options.prompt) {
      url.searchParams.set('prompt', options.prompt);
    }

    Object.entries(options.extraParams ?? {}).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    return url.toString();
  }

  const url = new URL(config.authorizationUrl);

  if (options.relayState) {
    url.searchParams.set(config.relayStateParam ?? 'RelayState', options.relayState);
  }

  Object.entries(options.extraParams ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}
