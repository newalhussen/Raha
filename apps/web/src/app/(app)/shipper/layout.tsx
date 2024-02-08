import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { TopShell, buttonClass } from '@raha/ui';
import { UserMenu } from '@/components/UserMenu';
import { homeFor, requireSession } from '@/lib/raha';

export default async function ShipperLayout({ children }: { children: ReactNode }) {
  const s = await requireSession();
  if (!s.active) redirect('/onboarding');
  if (s.active.organizationType !== 'shipper') redirect(homeFor(s));
  const canCreate = s.active.permissions.includes('shipment:create');
  return (
    <TopShell
      nav={[
        { href: '/shipper/shipments', label: 'Shipments' },
        { href: '/shipper/tracking', label: 'Tracking' },
        { href: '/shipper/history', label: 'History' },
        { href: '/shipper/payments', label: 'Payments' },
        { href: '/shipper/team', label: 'Team' },
      ]}
      action={canCreate ? <Link href="/shipper/shipments/new" className={buttonClass({ variant: 'amber', size: 'sm' })}>+ New shipment</Link> : null}
      userSlot={<UserMenu name={s.user.fullName || s.user.phone} org={{ id: s.active.organizationId, name: s.active.organizationName, role: s.active.role }} memberships={s.memberships.filter((m) => m.status === 'active')} />}
    >
      {children}
    </TopShell>
  );
}
