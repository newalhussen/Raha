'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Logo } from './brand';
import { Avatar } from './layout';


function isOn(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export interface NavItem { href: string; label: string; count?: number | string | null; exact?: boolean }

/** Top bar used by the shipper console (matches the design's header-with-tabs). */
export function TopShell({ nav, action, userSlot, children, tag, footer }: { nav: NavItem[]; action?: ReactNode; userSlot?: ReactNode; tag?: string; children: ReactNode; footer?: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="col" style={{ minHeight: '100vh' }}>
      <header className="topbar">
        <Link href="/" aria-label="Raha home"><Logo size={24} tag={tag} /></Link>
        <nav className="topnav" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={isOn(pathname, n.href, n.exact) ? 'on' : ''} aria-current={isOn(pathname, n.href, n.exact) ? 'page' : undefined}>
              {n.label}
            </Link>
          ))}
        </nav>
        {action}
        {userSlot}
      </header>
      <div className="col grow">{children}</div>
      {footer}
    </div>
  );
}

/** Sidebar shell used by broker, fleet and ops (matches the design's left rail). */
export function SideShell({ tag, org, nav, foot, children, header }: { tag: string; org: { name: string; sub: string }; nav: NavItem[]; foot?: ReactNode; children: ReactNode; header?: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="shell-side">
      <aside className="sidebar">
        <Link href="/" className="brand"><Logo size={24} tag={tag} /></Link>
        <div className="org-card">
          <Avatar name={org.name} size={32} shape="square" amber />
          <div>
            <div className="name">{org.name}</div>
            <div className="sub">{org.sub}</div>
          </div>
        </div>
        <nav className="sidenav" aria-label="Main">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={isOn(pathname, n.href, n.exact) ? 'on' : ''} aria-current={isOn(pathname, n.href, n.exact) ? 'page' : undefined}>
              {n.label}
              {n.count !== undefined && n.count !== null && n.count !== 0 ? <span className="count">{n.count}</span> : null}
            </Link>
          ))}
        </nav>
        {foot ? <div className="side-foot">{foot}</div> : null}
      </aside>
      <div className="side-main">
        {header}
        {children}
      </div>
    </div>
  );
}

/** Pill-style tab links (list filters such as Active / Completed / All). */
export function TabLinks({ items }: { items: Array<{ href: string; label: ReactNode; on: boolean }> }) {
  return (
    <div className="seg" role="tablist">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={i.on ? 'on' : ''} role="tab" aria-selected={i.on}>
          {i.label}
        </Link>
      ))}
    </div>
  );
}
