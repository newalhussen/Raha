import { createProxyHandlers } from '@raha/web-kit/routes';
import { kitConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const { GET, POST, PATCH, PUT, DELETE } = createProxyHandlers(kitConfig);
