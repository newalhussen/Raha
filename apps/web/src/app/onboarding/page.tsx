import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OnboardingForm } from './OnboardingForm';
import { homeFor, requireSession } from '@/lib/raha';

export const metadata: Metadata = { title: 'Set up your company' };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const session = await requireSession();
  const { type } = await searchParams;
  if (session.active) redirect(homeFor(session));
  const initial = type === 'fleet' || type === 'brokerage' || type === 'shipper' ? type : 'shipper';
  return <OnboardingForm name={session.user.fullName} initialType={initial} />;
}
