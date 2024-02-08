import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import type { BrokerCountsDto } from '@raha/contracts';
import { SideShell } from '@raha/ui';
import { UserMenu } from '@/components/UserMenu';
import { apiAsOrg, homeFor, requireSession } from '@/lib/raha';

export default async function BrokerLayout({ children }: { children: ReactNode }) {
  const s = await requireSession();
  if (!s.active) redirect('/onboarding');
  if (s.active.organizationType !== 'brokerage') redirect(homeFor(s));
  const counts = await apiAsOrg<BrokerCountsDto>('/broker/counts');
  return (
    <SideShell
      tag="BROKER"
      org={{ name: s.active.organizationName, sub: `${counts.area ?? 'Addis Ababa'} · ${counts.dispatchers.length} dispatcher${counts.dispatchers.length === 1 ? '' : 's'}` }}
      nav={[
        { href: '/broker/match-board', label: 'Match board', count: counts.openLoads },
        { href: '/broker/trips', label: 'Active trips', count: counts.activeTrips },
        { href: '/broker/network', label: 'Truck network' },
        { href: '/broker/shippers', label: 'Shippers' },
        { href: '/broker/inbox', label: 'Inbox', count: counts.inbox },
        { href: '/broker/payments', label: 'Payments log' },
        { href: '/broker/team', label: 'Team' },
      ]}
      foot={
        <>
          <span className="mono" style={{ fontSize: 10 }}>DISPATCHERS ON SHIFT</span>
          {counts.dispatchers.map((d) => (
            <span key={d.name} className="row between"><span>{d.name}{d.isMe ? ' · you' : ''}</span><span style={{ color: d.onShift ? 'var(--amber)' : undefined }}>{d.onShift ? '●' : '○'}</span></span>
          ))}
          <UserMenu variant="side" name={s.user.fullName || s.user.phone} org={{ id: s.active.organizationId, name: s.active.organizationName, role: s.active.role }} memberships={s.memberships.filter((m) => m.status === 'active')} />
        </>
      }
    >
      {children}
    </SideShell>
  );
}
