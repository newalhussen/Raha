import { NextRequest, NextResponse } from 'next/server';
import type { AuthResultDto, TokensDto } from '@raha/contracts';
import { ACCESS_COOKIE_GRACE_SECONDS, REFRESH_COOKIE_DAYS, apiBase, cookieNames, cookieOptions, type KitConfig } from './shared';

type Ctx = { params: Promise<{ path: string[] }> };

function setTokens(res: NextResponse, cfg: KitConfig, tokens: TokensDto, orgId?: string | null) {
  const n = cookieNames(cfg.prefix);
  res.cookies.set(n.at, tokens.accessToken, cookieOptions(Math.max(60, tokens.expiresIn - ACCESS_COOKIE_GRACE_SECONDS)));
  res.cookies.set(n.rt, tokens.refreshToken, cookieOptions(REFRESH_COOKIE_DAYS * 86_400));
  if (orgId) res.cookies.set(n.org, orgId, cookieOptions(REFRESH_COOKIE_DAYS * 86_400));
}

async function refresh(refreshToken: string): Promise<TokensDto | null> {
  try {
    const res = await fetch(`${apiBase()}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken }), cache: 'no-store' });
    return res.ok ? ((await res.json()) as TokensDto) : null;
  } catch {
    return null;
  }
}

/**
 * `/api/proxy/*` — the browser's only way to reach the API. Adds the bearer token and active organization from
 * the httpOnly cookies, and transparently refreshes an expired session once.
 */
export function createProxyHandlers(cfg: KitConfig) {
  const n = cookieNames(cfg.prefix);

  async function forward(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
    const { path } = await ctx.params;
    const target = `${apiBase()}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`;
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const body = hasBody ? await req.arrayBuffer() : undefined;
    const contentType = req.headers.get('content-type');
    const org = req.cookies.get(n.org)?.value;

    const call = (token: string | undefined) =>
      fetch(target, {
        method: req.method,
        headers: {
          ...(contentType && hasBody ? { 'content-type': contentType } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(org ? { 'x-org-id': org } : {}),
        },
        body,
        cache: 'no-store',
      });

    let refreshed: TokensDto | null = null;
    let res = await call(req.cookies.get(n.at)?.value);
    const rt = req.cookies.get(n.rt)?.value;
    if (res.status === 401 && rt) {
      refreshed = await refresh(rt);
      if (refreshed) res = await call(refreshed.accessToken);
    }

    const out = new NextResponse(res.status === 204 ? null : await res.arrayBuffer(), { status: res.status });
    const ct = res.headers.get('content-type');
    if (ct) out.headers.set('content-type', ct);
    if (refreshed) setTokens(out, cfg, refreshed);
    if (res.status === 401) {
      out.cookies.delete(n.at);
      out.cookies.delete(n.rt);
    }
    return out;
  }

  return { GET: forward, POST: forward, PATCH: forward, PUT: forward, DELETE: forward };
}

/** `/api/session/*` — sign in / out and switch organization. */
export function createSessionHandlers(cfg: KitConfig) {
  const n = cookieNames(cfg.prefix);
  const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

  async function upstream(path: string, body: unknown, req: NextRequest) {
    const res = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': req.headers.get('user-agent') ?? 'raha-web', 'x-forwarded-for': req.headers.get('x-forwarded-for') ?? '' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const text = await res.text();
    return { res, data: text ? JSON.parse(text) : null };
  }

  return {
    /** POST { phone } → SMS code. */
    async requestOtp(req: NextRequest) {
      const { phone } = (await req.json()) as { phone: string };
      const { res, data } = await upstream('/auth/otp/request', { phone, app: cfg.app }, req);
      return json(data, res.status);
    },

    /** POST { phone, code } → sets cookies, returns the session (without tokens). */
    async verifyOtp(req: NextRequest) {
      const { phone, code } = (await req.json()) as { phone: string; code: string };
      const { res, data } = await upstream('/auth/otp/verify', { phone, code, app: cfg.app }, req);
      if (!res.ok) return json(data, res.status);
      const result = data as AuthResultDto;
      const out = json({ user: result.user, memberships: result.memberships, needsProfile: result.needsProfile });
      const usable = result.memberships.filter((m) => m.status === 'active');
      setTokens(out, cfg, result.tokens, usable[0]?.organizationId ?? null);
      return out;
    },

    /** POST { email, password } — Raha Operations. */
    async staffLogin(req: NextRequest) {
      const { email, password } = (await req.json()) as { email: string; password: string };
      const { res, data } = await upstream('/auth/staff/login', { email, password }, req);
      if (!res.ok) return json(data, res.status);
      const result = data as AuthResultDto;
      const out = json({ user: result.user, staffPermissions: result.staffPermissions });
      setTokens(out, cfg, result.tokens);
      return out;
    },

    /** POST → ends the session on the API and clears cookies. */
    async logout(req: NextRequest) {
      const rt = req.cookies.get(n.rt)?.value;
      if (rt) await upstream('/auth/logout', { refreshToken: rt }, req).catch(() => undefined);
      const out = json({ ok: true });
      for (const name of Object.values(n)) out.cookies.delete(name);
      return out;
    },

    /** POST { orgId } — act for another organization the user belongs to. */
    async switchOrg(req: NextRequest) {
      const { orgId } = (await req.json()) as { orgId: string };
      const out = json({ ok: true });
      out.cookies.set(n.org, orgId, cookieOptions(REFRESH_COOKIE_DAYS * 86_400));
      return out;
    },

    /** POST — after creating a company the active org becomes the new one. */
    async setOrg(req: NextRequest) {
      return this.switchOrg(req);
    },
  };
}
