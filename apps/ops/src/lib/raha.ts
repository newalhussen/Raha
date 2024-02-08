import { createServerKit } from '@raha/web-kit/server';
import { kitConfig } from './config';

export const kit = createServerKit(kitConfig);
export const { api, getSession, requireSession } = kit;
