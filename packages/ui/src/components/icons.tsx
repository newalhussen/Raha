import type { CSSProperties } from 'react';

/**
 * Functional icons only — 1.75 px stroke, square caps, never decorative (see brand guide).
 * Truck, package, route, camera, PIN lock, message and "offline" are the core set.
 */
const PATHS = {
  truck: 'M3 7h12v10H3zM15 10h4l2 3v4h-6M7 18.5a1.5 1.5 0 1 0 0.01 0M17 18.5a1.5 1.5 0 1 0 0.01 0',
  package: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
  route: 'M5 18h7a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h7M5 16a2 2 0 1 0 0.01 0M19 4a2 2 0 1 0 0.01 0',
  arrow: 'M4 12h16M14 6l6 6-6 6',
  'arrow-left': 'M20 12H4M10 6l-6 6 6 6',
  camera: 'M3 7h18v13H3zM12 10a3.5 3.5 0 1 0 0.01 0M8 7l2-3h4l2 3',
  lock: 'M5 10h14v10H5zM8 10V7a4 4 0 0 1 8 0v3',
  message: 'M4 5h16v11H9l-5 4z',
  offline: 'M2 12a10 10 0 0 1 20 0M5.5 12a6.5 6.5 0 0 1 13 0M9 12a3 3 0 0 1 6 0M3 21L21 3',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  wallet: 'M3 6h18v12H3zM3 10h18M16 15h2',
  user: 'M12 4a4 4 0 1 0 0.01 0M4 21c1-4 4-6 8-6s7 2 8 6',
  users: 'M9 5a3.5 3.5 0 1 0 0.01 0M2 20c.8-3.5 3.3-5.5 7-5.5s6.2 2 7 5.5M17 6.5a3 3 0 0 1 0 6M18 14.8c2 .6 3.4 2.3 4 5.2',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  search: 'M11 4a7 7 0 1 0 0.01 0M16 16l5 5',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l4.5 4.5L19 7',
  close: 'M6 6l12 12M18 6L6 18',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z',
  clock: 'M12 4a8 8 0 1 0 0.01 0M12 8v4l3 2',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  alert: 'M12 4l9 16H3zM12 10v4M12 17.5v.01',
  flag: 'M5 21V4h12l-2 4 2 4H5',
  chevron: 'M9 6l6 6-6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  map: 'M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2zM9 4v14M15 6v14',
  file: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  gauge: 'M4 18a9 9 0 1 1 16 0M12 18l4-6',
  cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0.01 0M6 10v.01M18 14v.01',
  inbox: 'M4 13l2-8h12l2 8v6H4zM4 13h5l1 2h4l1-2h5',
  settings: 'M12 9a3 3 0 1 0 0.01 0M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  menu: 'M4 7h16M4 12h16M4 17h16',
  logout: 'M10 4H4v16h6M15 8l5 4-5 4M20 12H9',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  edit: 'M4 20h4l11-11-4-4L4 16zM13 7l4 4',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, stroke = 1.75, style, title }: { name: IconName; size?: number; stroke?: number; style?: CSSProperties; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="square"
      strokeLinejoin="miter"
      style={{ flex: 'none', ...style }}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
