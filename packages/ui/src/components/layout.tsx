import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { initials } from '@raha/contracts';

export function Panel({ children, pad = true, dark, amber, className, style }: { children: ReactNode; pad?: boolean; dark?: boolean; amber?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <section className={['panel', pad ? 'panel-pad' : '', dark ? 'panel-dark' : '', amber ? 'panel-amber' : '', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </section>
  );
}

export function PanelHead({ kicker, title, aside }: { kicker?: ReactNode; title?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="panel-head">
      <div className="col gap-4">
        {kicker ? <span className="kicker">{kicker}</span> : null}
        {title ? <span className="h3">{title}</span> : null}
      </div>
      {aside ? <div className="small muted">{aside}</div> : null}
    </div>
  );
}

export function PageHeader({ kicker, title, aside, sub }: { kicker?: ReactNode; title: ReactNode; aside?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="row between wrap gap-16" style={{ alignItems: 'flex-end' }}>
      <div className="col gap-4">
        {kicker ? <div className="kicker">{kicker}</div> : null}
        <h1 className="h1">{title}</h1>
        {sub ? <div className="small muted">{sub}</div> : null}
      </div>
      {aside ? <div className="row gap-8 wrap">{aside}</div> : null}
    </div>
  );
}

/** One row of big numbers. `sub` renders next to the value (e.g. "3 offers"). */
export function Stats({ items }: { items: Array<{ label: string; value: ReactNode; sub?: ReactNode; tone?: 'amber' | 'red' }> }) {
  return (
    <div className="stats">
      {items.map((s) => (
        <div className="stat" key={s.label}>
          <span className="k">{s.label}</span>
          <span className="v" style={s.tone === 'amber' ? { color: 'var(--amber)' } : s.tone === 'red' ? { color: 'var(--ops-orange, var(--red))' } : undefined}>
            {s.value}
            {s.sub ? <span className="sub">{s.sub}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

export function KeyValue({ rows }: { rows: Array<[ReactNode, ReactNode]> }) {
  return (
    <div className="kv">
      {rows.map(([k, v], i) => (
        <div key={i}>
          <span>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}

export function Avatar({ name, size = 40, shape = 'round', amber }: { name: string; size?: number; shape?: 'round' | 'square'; amber?: boolean }) {
  return (
    <span className={['avatar', shape === 'square' ? 'avatar-sq' : '', amber ? 'avatar-amber' : ''].filter(Boolean).join(' ')} style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.32)) }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function Empty({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="h3" style={{ color: 'var(--ink)' }}>{title}</span>
      {children ? <p className="small" style={{ maxWidth: 420 }}>{children}</p> : null}
      {action}
    </div>
  );
}

export function Notice({ tone = 'amber', children }: { tone?: 'amber' | 'error'; children: ReactNode }) {
  return <div className={`notice${tone === 'error' ? ' error' : ''}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Skeleton({ height = 16, width = '100%' }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden />;
}

/** The hatched photo placeholder from the design; shows the real image when there is one. */
export function Photo({ src, tag, alt = '' }: { src?: string | null; tag?: string; alt?: string }) {
  return (
    <div className="photo">
      {/* signed, short-lived URLs from the API — plain <img> on purpose */}
      {src ? <img src={src} alt={alt} loading="lazy" /> : null}
      {tag ? <span className="tag">{tag}</span> : null}
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** CSS grid track, e.g. "130px" or "1.4fr". */
  width: string;
  render: (row: T) => ReactNode;
  align?: 'right';
}

/**
 * Table made of CSS grid rows so every cell can hold rich content (pills, bars, avatars).
 * Pass `href` to make rows links (client-side navigation).
 */
export function DataTable<T>({ columns, rows, rowKey, href, empty, minWidth }: { columns: Array<Column<T>>; rows: T[]; rowKey: (row: T) => string; href?: (row: T) => string; empty?: ReactNode; minWidth?: number }) {
  const cols = columns.map((c) => c.width).join(' ');
  return (
    <div className="dt">
      <div className="dt-inner" style={{ ['--cols' as string]: cols, minWidth }}>
        <div className="dt-head">
          {columns.map((c) => (
            <span key={c.key} style={c.align === 'right' ? { textAlign: 'right' } : undefined}>{c.header}</span>
          ))}
        </div>
        {rows.length === 0 ? <div className="dt-empty">{empty ?? 'Nothing here yet.'}</div> : null}
        {rows.map((row) => {
          const cells = columns.map((c) => (
            <div key={c.key} style={{ minWidth: 0, ...(c.align === 'right' ? { textAlign: 'right' } : {}) }}>{c.render(row)}</div>
          ));
          const url = href?.(row);
          return url ? (
            <Link key={rowKey(row)} href={url} className="dt-row">{cells}</Link>
          ) : (
            <div key={rowKey(row)} className="dt-row">{cells}</div>
          );
        })}
      </div>
    </div>
  );
}
