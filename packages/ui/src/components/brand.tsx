import type { CSSProperties } from 'react';

/**
 * The Raha mark: two half-discs on a shared axis, offset like forward motion.
 * Upper half = the cargo waiting for a ride (amber). Lower half = the truck already on the road with its load.
 * 48-unit grid, radius-16 discs, 4-unit lane; below 20 px the lane widens so the halves stay apart.
 */
export function RahaMark({ size = 28, tone = 'reverse', style, title }: { size?: number; tone?: 'reverse' | 'primary' | 'on-amber'; style?: CSSProperties; title?: string }) {
  const lane = size < 20 ? 6 : 4; // total gap between the halves, in grid units
  const top = 24 - lane / 2;
  const bottom = 24 + lane / 2;
  const upper = tone === 'on-amber' ? '#FBFAF7' : '#F2A516';
  const lower = tone === 'primary' || tone === 'on-amber' ? '#15141A' : '#F4F1EA';
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} style={style} role={title ? 'img' : 'presentation'} aria-label={title} aria-hidden={title ? undefined : true}>
      <path d={`M4 ${top}A16 16 0 0 1 36 ${top}Z`} fill={upper} />
      <path d={`M12 ${bottom}A16 16 0 0 0 44 ${bottom}Z`} fill={lower} />
    </svg>
  );
}

/** Lowercase "raha" in Archivo Expanded — heavy like vehicle livery. */
export function Wordmark({ size = 20, color, style }: { size?: number; color?: string; style?: CSSProperties }) {
  return (
    <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 700, fontSize: size, letterSpacing: '-0.02em', lineHeight: 1, color, ...style }}>raha</span>
  );
}

export function Logo({ size = 24, tone = 'reverse', wordSize, tag }: { size?: number; tone?: 'reverse' | 'primary'; wordSize?: number; tag?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.4) }}>
      <RahaMark size={size} tone={tone} />
      <Wordmark size={wordSize ?? Math.round(size * 0.8)} />
      {tag ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--amber)', marginLeft: 4 }}>{tag}</span> : null}
    </span>
  );
}
