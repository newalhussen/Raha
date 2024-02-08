import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from './LoginForm';
import { getSession, homeFor } from '@/lib/raha';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; intent?: string }> }) {
  const { next, intent } = await searchParams;
  const session = await getSession();
  if (session) redirect(next && next.startsWith('/') ? next : homeFor(session));
  return <LoginForm next={next && next.startsWith('/') && !next.startsWith('//') ? next : null} intent={intent ?? null} />;
}
