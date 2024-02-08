'use client';

import { useCallback, useState } from 'react';
import useSWR, { mutate as globalMutate, type SWRConfiguration } from 'swr';
import { ApiError } from './shared';

export { ApiError } from './shared';

const PROXY = '/api/proxy';

/** Calls the Raha API through the authenticated proxy. Throws ApiError with the server's code and message. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(`${PROXY}/${path.replace(/^\//, '')}`, {
    method: init.method ?? (init.body !== undefined || init.form ? 'POST' : 'GET'),
    headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError(401, { message: 'Your session has ended. Please sign in again.' });
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new ApiError(res.status, (json && typeof json === 'object' ? json : text) as never);
  return json as T;
}

const fetcher = <T,>(key: string) => api<T>(key.replace(`${PROXY}/`, ''));

/** Live data with background refresh — dashboards poll every 20–30 s; milestone tracking does not need WebSockets. */
export function useApi<T>(path: string | null, config?: SWRConfiguration<T, ApiError>) {
  return useSWR<T, ApiError>(path ? `${PROXY}/${path.replace(/^\//, '')}` : null, fetcher as (k: string) => Promise<T>, { revalidateOnFocus: true, keepPreviousData: true, ...config });
}

/** Re-fetch every cached request whose path starts with `prefix` (call after a mutation). */
export function refreshApi(prefix = '') {
  return globalMutate((key) => typeof key === 'string' && key.startsWith(`${PROXY}/${prefix}`), undefined, { revalidate: true });
}

/** Wraps a mutation with loading + error state: `const { run, loading, error } = useAction(async (id) => api(...))`. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setLoading(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(e instanceof ApiError ? e : new ApiError(0, { message: (e as Error).message }));
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [fn],
  );
  return { run, loading, error, clearError: () => setError(null) };
}

export async function postSession(path: 'otp/request' | 'otp/verify' | 'staff-login' | 'logout' | 'org', body?: unknown) {
  const res = await fetch(`/api/session/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}), credentials: 'same-origin' });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}
