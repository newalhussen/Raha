'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Icon } from '@raha/ui';
import { postSession } from '@raha/web-kit/client';

export interface MenuMembership { organizationId: string; organizationName: string; organizationType: string; role: string }

/** Who I am, which company I'm acting for, switch company, sign out. */
export function UserMenu({ name, org, memberships, variant = 'top' }: { name: string; org: { id: string; name: string; role: string }; memberships: MenuMembership[]; variant?: 'top' | 'side' }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function switchTo(orgId: string) {
    await postSession('org', { orgId });
    setOpen(false);
    router.replace('/home');
    router.refresh();
  }

  async function signOut() {
    await postSession('logout');
    router.replace('/login');
    router.refresh();
  }

  const trigger =
    variant === 'top' ? (
      <button type="button" className="user-chip" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={org.name} size={32} shape="square" />
        <span className="who">
          <b>{org.name}</b>
          <span>{name} · {org.role}</span>
        </span>
        <Icon name="chevron-down" size={14} />
      </button>
    ) : (
      <button type="button" className="btn btn-ghost btn-sm btn-block" style={{ justifyContent: 'space-between', color: 'var(--bone)' }} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>
        <span className="row gap-8"><Avatar name={name} size={24} shape="square" />{name}</span>
        <Icon name="chevron-down" size={14} />
      </button>
    );

  return (
    <div className="menu" ref={ref}>
      {trigger}
      {open ? (
        <div className="menu-pop" role="menu">
          <div className="sec">Signed in as</div>
          <div style={{ padding: '0 14px 10px' }}>
            <div className="semi">{name}</div>
            <div className="xs muted">{org.name} · {org.role}</div>
          </div>
          {memberships.length > 1 ? (
            <>
              <hr />
              <div className="sec">Switch company</div>
              {memberships.map((m) => (
                <button key={m.organizationId} className={`item${m.organizationId === org.id ? ' on' : ''}`} role="menuitem" onClick={() => switchTo(m.organizationId)}>
                  <Icon name={m.organizationId === org.id ? 'check' : 'chevron'} size={14} />
                  <span className="grow">{m.organizationName}<span className="xs muted"> · {m.organizationType}</span></span>
                </button>
              ))}
            </>
          ) : null}
          <hr />
          <button className="item" role="menuitem" onClick={signOut}><Icon name="logout" size={16} />Sign out</button>
        </div>
      ) : null}
    </div>
  );
}
