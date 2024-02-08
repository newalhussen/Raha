import type { NextRequest } from 'next/server';
import { createSessionHandlers } from '@raha/web-kit/routes';
import { kitConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';
const h = createSessionHandlers(kitConfig);
export const POST = (req: NextRequest) => h.requestOtp(req);
