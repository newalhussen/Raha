import type { KitConfig } from '@raha/web-kit';

/** Plain config (no server-only imports) so the edge middleware can use it too. */
export const kitConfig: KitConfig = { prefix: 'raha_web', loginPath: '/login', app: 'web' };
