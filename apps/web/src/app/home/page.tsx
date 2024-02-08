import { redirect } from 'next/navigation';
import { homeFor, requireSession } from '@/lib/raha';

/** Post-login router: onboarding for new accounts, otherwise the console for the active organization. */
export default async function Home({ searchParams }: { searchParams: Promise<{ intent?: string }> }) {
  const session = await requireSession();
  const { intent } = await searchParams;
  if (!session.active) redirect(`/onboarding${intent ? `?type=${encodeURIComponent(intent)}` : ''}`);
  redirect(homeFor(session));
}
