import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { HOME_BY_ORG_TYPE, type AuthResultDto, type MembershipDto, type SessionDto, type TokensDto } from '@raha/contracts';
import { ACCESS_COOKIE_GRACE_SECONDS, ApiError, REFRESH_COOKIE_DAYS, apiBase, cookieNames, cookieOptions, type KitConfig } from './shared';

export interface ActiveSession extends SessionDto {
  /** The organization the user is acting for (staff apps have none). */
  active: MembershipDto | null;
}

/**
 * Everything a Next.js server component or route handler needs to talk to the Raha API as the signed-in user.
 * Tokens live in httpOnly cookies, so browser JavaScript never sees them.
 */
export function createServerKit(cfg: KitConfig) {
  const names = cookieNames(cfg.prefix);

  async function readCookies() {
    const jar = await cookies();
    return { at: jar.get(names.at)?.value, rt: jar.get(names.rt)?.value, org: jar.get(names.org)?.value };
  }

  /** GET/POST to the API with the user's token. 401 → back to sign-in (middleware normally refreshed already). */
  async function api<T>(path: string, init: { method?: string; body?: unknown; org?: string | null; revalidate?: number } = {}): Promise<T> {
    const c = await readCookies();
    const org = init.org === undefined ? c.org : init.org;
    const res = await fetch(`${apiBase()}${path.startsWith('/') ? path : `/${path}`}`, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(c.at ? { authorization: `Bearer ${c.at}` } : {}),
        ...(org ? { 'x-org-id': org } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
    if (res.status === 401) redirect(cfg.loginPath);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const json = text ? safeJson(text) : null;
    if (!res.ok) throw new ApiError(res.status, json && typeof json === 'object' ? (json as never) : text);
    return json as T;
  }

  /** The signed-in session, or null. Cached for the duration of one request. */
  const getSession = cache(async (): Promise<ActiveSession | null> => {
    const c = await readCookies();
    if (!c.at) return null;
    const res = await fetch(`${apiBase()}/me`, { headers: { authorization: `Bearer ${c.at}` }, cache: 'no-store' });
    if (!res.ok) return null;
    const session = (await res.json()) as SessionDto;
    const usable = session.memberships.filter((m) => m.status === 'active');
    const active = usable.find((m) => m.organizationId === c.org) ?? usable[0] ?? null;
    return { ...session, active };
  });

  async function requireSession(): Promise<ActiveSession> {
    const s = await getSession();
    if (!s) redirect(cfg.loginPath);
    return s;
  }

  /** The API call context: always acts for the verified active organization. */
  async function apiAsOrg<T>(path: string, init: Omit<Parameters<typeof api>[1], 'org'> = {}): Promise<T> {
    const s = await requireSession();
    return api<T>(path, { ...init, org: s.active?.organizationId ?? null });
  }

  /** Where a signed-in user should land. */
  function homeFor(session: ActiveSession): string {
    if (cfg.app === 'ops') return '/';
    if (!session.active) return '/onboarding';
    return HOME_BY_ORG_TYPE[session.active.organizationType];
  }

  // ── route-handler helpers (cookies can only be written there) ──

  async function writeSession(tokens: TokensDto, orgId?: string | null) {
    const jar = await cookies();
    jar.set(names.at, tokens.accessToken, cookieOptions(Math.max(60, tokens.expiresIn - ACCESS_COOKIE_GRACE_SECONDS)));
    jar.set(names.rt, tokens.refreshToken, cookieOptions(REFRESH_COOKIE_DAYS * 86_400));
    if (orgId) jar.set(names.org, orgId, cookieOptions(REFRESH_COOKIE_DAYS * 86_400));
  }

  async function clearSession() {
    const jar = await cookies();
    for (const n of Object.values(names)) jar.delete(n);
  }

  /** Pick the organization to act for after sign-in. */
  function pickOrg(result: Pick<AuthResultDto, 'memberships'>): string | null {
    const usable = result.memberships.filter((m) => m.status === 'active');
    return usable[0]?.organizationId ?? null;
  }

  return { api, apiAsOrg, getSession, requireSession, homeFor, writeSession, clearSession, pickOrg, readCookies, names };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export type ServerKit = ReturnType<typeof createServerKit>;
