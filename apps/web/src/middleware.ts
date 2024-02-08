import { createAuthMiddleware } from '@raha/web-kit/middleware';
import { kitConfig } from '@/lib/config';

const PUBLIC = [/^\/$/, /^\/login/, /^\/r\//, /^\/api\//, /^\/favicon/, /^\/icon/];

export const middleware = createAuthMiddleware(kitConfig, { isPublic: (p) => PUBLIC.some((re) => re.test(p)) });

export const config = { matcher: ['/((?!_next/static|_next/image|.*\\..*).*)'] };
