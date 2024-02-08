'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar, Button } from '@raha/ui';
import { postSession } from '@raha/web-kit/client';

/** Clock (EAT) + who am I + sign out. */
export function StaffMenu({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  const [now, setNow] = useState('');
  useEffect(() => {
    const f = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Addis_Ababa' });
    const tick = () => setNow(f.format(new Date()));
    tick();
    const t = setInterval(tick, 20_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="row gap-12 small" style={{ color: 'var(--header-muted)' }}>
      <span className="mono">{now} EAT</span>
      <Avatar name={name} size={30} />
      <span className="hide-sm" style={{ color: 'var(--header-ink)' }}>{name} · {role}</span>
      <Button variant="ghost" size="xs" onClick={async () => { await postSession('logout'); router.replace('/login'); router.refresh(); }}>Sign out</Button>
    </div>
  );
}
