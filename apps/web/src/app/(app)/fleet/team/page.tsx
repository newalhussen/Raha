import type { Metadata } from 'next';
import { PageHeader } from '@raha/ui';
import { TeamManager } from '@/components/TeamManager';
import { requireSession } from '@/lib/raha';

export const metadata: Metadata = { title: 'Team & roles' };

export default async function Team() {
  const s = await requireSession();
  return (
    <main className="page-fluid">
      <PageHeader kicker={s.active?.organizationName.toUpperCase()} title="Team & roles" />
      <TeamManager orgType="fleet" canManage={s.active?.permissions.includes('members:manage') ?? false} meUserId={s.user.id} />
    </main>
  );
}
