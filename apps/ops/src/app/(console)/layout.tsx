import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { TopShell } from '@raha/ui';
import { StaffMenu } from '@/components/StaffMenu';
import { api, requireSession } from '@/lib/raha';

export default async function Console({ children }: { children: ReactNode }) {
  const s = await requireSession();
  if (!s.user.isStaff) redirect('/login');
  const perms = s.staffPermissions;
  const counts = await api<{ verification: number; support: number; disputes: number }>('/ops/counts', { org: null });
  const nav = [
    { href: '/', label: 'Control room', exact: true },
    perms.includes('ops:verify') ? { href: '/verification', label: counts.verification ? `Verification · ${counts.verification}` : 'Verification' } : null,
    { href: '/shipments', label: 'Shipments' },
    { href: '/matching', label: 'Matching' },
    { href: '/trips', label: 'Trips' },
    { href: '/trucks', label: 'Trucks' },
    { href: '/organizations', label: 'Organizations' },
    perms.includes('ops:users') ? { href: '/users', label: 'Users' } : null,
    { href: '/support', label: counts.support ? `Support · ${counts.support}` : 'Support' },
    { href: '/disputes', label: counts.disputes ? `Disputes · ${counts.disputes}` : 'Disputes' },
    perms.includes('ops:finance') ? { href: '/payments', label: 'Payments' } : null,
  ].filter((x): x is { href: string; label: string; exact?: boolean } => !!x);
  return (
    <TopShell tag="OPS" nav={nav} userSlot={<StaffMenu name={s.user.fullName} role={s.user.staffRole ?? 'staff'} />}>
      {children}
    </TopShell>
  );
}
