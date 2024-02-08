import type { Metadata } from 'next';
import { PageHeader } from '@raha/ui';
import { TeamManager } from '@/components/TeamManager';
import { requireSession } from '@/lib/raha';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage() {
  const s = await requireSession();
  return (
    <main className="page">
      <PageHeader kicker={s.active?.organizationName.toUpperCase()} title="Team" />
      <TeamManager orgType="shipper" canManage={s.active?.permissions.includes('members:manage') ?? false} meUserId={s.user.id} />
    </main>
  );
}
