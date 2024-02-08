import type { ReactNode } from 'react';
import type { Glyph, StatusMeta, Tone } from '@raha/contracts';

/** A status chip: label + tone + a distinct glyph shape, so it survives colour-blindness and cracked screens. */
export function Pill({ tone = 'neutral', glyph = 'dot', mono = false, children, title }: { tone?: Tone; glyph?: Glyph | null; mono?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={`pill tone-${tone}${mono ? ' pill-mono' : ''}`} title={title}>
      {glyph ? <span className={`g g-${glyph}`} aria-hidden /> : null}
      {children}
    </span>
  );
}

export function StatusPill({ meta, label }: { meta: StatusMeta; label?: string }) {
  return (
    <Pill tone={meta.tone} glyph={meta.glyph}>
      {label ?? meta.label}
    </Pill>
  );
}

/** Square tag, e.g. DISPUTE / LATE / MATCH on the ops "needs a human" list. */
export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`pill pill-mono tone-${tone}`}>{children}</span>;
}
