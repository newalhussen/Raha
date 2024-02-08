import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import type { FleetCountsDto } from '@raha/contracts';
import { Empty, SideShell } from '@raha/ui';
import { UserMenu } from '@/components/UserMenu';
import { apiAsOrg, homeFor, requireSession } from '@/lib/raha';

export default async function FleetLayout({ children }: { children: ReactNode }) {
  const s = await requireSession();
  if (!s.active) redirect('/onboarding');
  if (s.active.organizationType !== 'fleet') redirect(homeFor(s));
  const menu = <UserMenu variant="side" name={s.user.fullName || s.user.phone} org={{ id: s.active.organizationId, name: s.active.organizationName, role: s.active.role }} memberships={s.memberships.filter((m) => m.status === 'active')} />;

  // Drivers use the Raha Driver app; the fleet console is for owners and managers.
  if (s.active.role === 'driver') {
    return (
      <main className="page" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Empty title="Drivers use the Raha Driver app">Your loads, trips and earnings are in the Android app. Fleet owners and managers use this console to manage trucks and drivers.</Empty>
        <div style={{ width: 240 }}>{menu}</div>
      </main>
    );
  }

  const counts = await apiAsOrg<FleetCountsDto>('/fleet/counts');
  return (
    <SideShell
      tag="FLEET"
      org={{ name: s.active.organizationName, sub: `${s.user.fullName} · ${s.active.role}` }}
      nav={[
        { href: '/fleet/board', label: 'Fleet board' },
        { href: '/fleet/trips', label: 'Trips', count: counts.activeTrips },
        { href: '/fleet/trucks', label: 'Trucks' },
        { href: '/fleet/drivers', label: 'Drivers' },
        { href: '/fleet/offers', label: 'Load offers', count: counts.offers },
        { href: '/fleet/payments', label: 'Payments' },
        { href: '/fleet/team', label: 'Team & roles' },
      ]}
      foot={
        <>
          <span style={{ lineHeight: 1.5 }}>{counts.trucks} trucks · {counts.drivers} drivers</span>
          {menu}
        </>
      }
    >
      {children}
    </SideShell>
  );
}
