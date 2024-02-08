import type { ApiErrorBody } from '@raha/contracts';

export interface KitConfig {
  /** Cookie prefix, e.g. "raha_web" → raha_web_at / raha_web_rt / raha_web_org. */
  prefix: string;
  /** Where unauthenticated visitors are sent. */
  loginPath: string;
  /** Which API audience this app signs in for. */
  app: 'web' | 'ops';
}

export function cookieNames(prefix: string) {
  return { at: `${prefix}_at`, rt: `${prefix}_rt`, org: `${prefix}_org` } as const;
}

/** Server-side base URL of the Raha API (never exposed to the browser: the browser talks to /api/proxy). */
export function apiBase(): string {
  return `${(process.env.RAHA_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')}/api/v1`;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(status: number, body: Partial<ApiErrorBody> | string | null) {
    const parsed = typeof body === 'string' || body === null ? { message: body ?? 'Request failed' } : body;
    super(parsed.message ?? 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = parsed.code;
    this.details = parsed.details;
  }
}

export const ACCESS_COOKIE_GRACE_SECONDS = 30;
export const REFRESH_COOKIE_DAYS = 30;

export function cookieOptions(maxAgeSeconds: number, httpOnly = true) {
  return {
    httpOnly,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
