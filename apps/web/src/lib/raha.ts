import { createServerKit } from '@raha/web-kit/server';
import { kitConfig } from './config';

export { kitConfig };

/** Server-side access to the Raha API as the signed-in user. */
export const kit = createServerKit(kitConfig);
export const { api, apiAsOrg, getSession, requireSession, homeFor } = kit;
