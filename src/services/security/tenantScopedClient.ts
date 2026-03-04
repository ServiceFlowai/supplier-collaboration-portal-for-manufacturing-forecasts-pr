import { ensureSecureContext } from './dataProtection';

export interface TenantScopedClientOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string | undefined> | string | undefined;
  getTenantId: () => string;
  getCorrelationId?: () => string;
}

export class TenantScopedClient {
  private readonly baseUrl: string;

  private readonly getAccessTokenFn: () => Promise<string | undefined> | string | undefined;

  private readonly getTenantIdFn: () => string;

  private readonly getCorrelationIdFn?: () => string;

  constructor(options: TenantScopedClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getAccessTokenFn = options.getAccessToken;
    this.getTenantIdFn = options.getTenantId;
    this.getCorrelationIdFn = options.getCorrelationId;
    ensureSecureContext();
  }

  private buildUrl(path: string): string {
    if (/^https?:/i.test(path)) {
      return path;
    }
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private async resolveAccessToken(): Promise<string | undefined> {
    const tokenOrPromise = this.getAccessTokenFn();
    return tokenOrPromise instanceof Promise ? tokenOrPromise : tokenOrPromise;
  }

  private async enrich(init: RequestInit = {}): Promise<RequestInit> {
    const headers = new Headers(init.headers ?? {});
    headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');

    const token = await this.resolveAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const tenantId = this.getTenantIdFn();
    headers.set('X-Tenant-Id', tenantId);

    if (this.getCorrelationIdFn) {
      headers.set('X-Correlation-Id', this.getCorrelationIdFn());
    }

    return { ...init, headers };
  }

  private async execute<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(this.buildUrl(path), await this.enrich(init));
    if (!response.ok) {
      const message = await response.text();
      throw new Error(`TenantScopedClient request failed (${response.status}): ${message}`);
    }

    if (response.status === 204) {
      return undefined as unknown as T;
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : (undefined as unknown as T);
  }

  get<T>(path: string, init?: RequestInit): Promise<T> {
    return this.execute<T>(path, { ...(init ?? {}), method: 'GET' });
  }

  post<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
    return this.execute<T>(path, {
      ...(init ?? {}),
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  put<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
    return this.execute<T>(path, {
      ...(init ?? {}),
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  delete(path: string, init?: RequestInit): Promise<void> {
    return this.execute<void>(path, { ...(init ?? {}), method: 'DELETE' });
  }
}
