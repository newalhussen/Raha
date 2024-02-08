import { NextRequest, NextResponse } from 'next/server';
import type { TokensDto } from '@raha/contracts';
import { ACCESS_COOKIE_GRACE_SECONDS, REFRESH_COOKIE_DAYS, apiBase, cookieNames, cookieOptions, type KitConfig } from './shared';

export interface AuthMiddlewareOptions {
  /** Paths that never need a session (marketing pages, login, the receiver page…). */
  isPublic: (pathname: string) => boolean;
}

/**
 * Keeps sessions alive without the browser noticing: when the short-lived access cookie has expired but the
 * refresh cookie is still good, it refreshes and forwards the new tokens to the page being rendered.
 * No session at all → redirect to sign-in with a `next` parameter.
 */
export function createAuthMiddleware(cfg: KitConfig, opts: AuthMiddlewareOptions) {
  const n = cookieNames(cfg.prefix);

  return async function middleware(req: NextRequest): Promise<NextResponse> {
    const { pathname, search } = req.nextUrl;
    if (opts.isPublic(pathname)) return NextResponse.next();

    const at = req.cookies.get(n.at)?.value;
    if (at) return NextResponse.next();

    const rt = req.cookies.get(n.rt)?.value;
    if (rt) {
      let tokens: TokensDto | null = null;
      try {
        const res = await fetch(`${apiBase()}/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }), cache: 'no-store' });
        if (res.ok) tokens = (await res.json()) as TokensDto;
      } catch {
        /* API unreachable: fall through to sign-in */
      }
      if (tokens) {
        // Make the new tokens visible to the server components rendering THIS request, and persist them for the next.
        const headers = new Headers(req.headers);
        const jar = new Map(req.cookies.getAll().map((c) => [c.name, c.value]));
        jar.set(n.at, tokens.accessToken);
        jar.set(n.rt, tokens.refreshToken);
        headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
        const res = NextResponse.next({ request: { headers } });
        res.cookies.set(n.at, tokens.accessToken, cookieOptions(Math.max(60, tokens.expiresIn - ACCESS_COOKIE_GRACE_SECONDS)));
        res.cookies.set(n.rt, tokens.refreshToken, cookieOptions(REFRESH_COOKIE_DAYS * 86_400));
        return res;
      }
    }

    const url = req.nextUrl.clone();
    url.pathname = cfg.loginPath;
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const res = NextResponse.redirect(url);
    res.cookies.delete(n.rt);
    return res;
  };
}
