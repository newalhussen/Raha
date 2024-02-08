import { CARGO_TYPES } from './enums';

/** Pure formatting helpers shared by the API (notifications/SMS), web and ops. */

export const ADDIS_TZ = 'Africa/Addis_Ababa';

export function formatKg(kg: number): string {
  return `${Math.round(kg).toLocaleString('en-US')} kg`;
}

/** 8000 -> "8.0 t", 1200 -> "1.2 t". */
export function formatTonnes(kg: number, digits = 1): string {
  return `${(kg / 1000).toFixed(digits)} t`;
}

/** Weight the way the design writes it: kilograms under a tonne, tonnes above. */
export function formatWeightShort(kg: number): string {
  return kg >= 1000 && kg % 100 === 0 ? formatTonnes(kg) : formatKg(kg);
}

export function formatEtb(amount: number, opts: { prefix?: boolean } = {}): string {
  const body = Math.round(amount).toLocaleString('en-US');
  return opts.prefix === false ? body : `ETB ${body}`;
}

/** 142000 -> "ETB 142K"; 612000 -> "ETB 612K"; 1_200_000 -> "ETB 1.2M". */
export function formatEtbCompact(amount: number): string {
  if (amount >= 1_000_000) return `ETB ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `ETB ${Math.round(amount / 1_000)}K`;
  return formatEtb(amount);
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

/** Normalises Ethiopian mobile numbers to E.164 (+2519XXXXXXXX). Returns null if invalid. */
export function normalizeEthiopianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  let national: string;
  if (digits.startsWith('+251')) national = digits.slice(4);
  else if (digits.startsWith('251')) national = digits.slice(3);
  else if (digits.startsWith('0')) national = digits.slice(1);
  else national = digits;
  if (!/^[79]\d{8}$/.test(national)) return null;
  return `+251${national}`;
}

/** "+251911204118" -> "+251 911 204 118". */
export function formatPhone(e164: string): string {
  const m = /^\+251(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `+251 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
}

const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ADDIS_TZ });
const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: ADDIS_TZ });
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: ADDIS_TZ });

/** "14:02" in Addis Ababa time. */
export function formatTime(d: Date | string): string {
  return timeFmt.format(typeof d === 'string' ? new Date(d) : d);
}

/** "Thu 8 Oct". */
export function formatDay(d: Date | string): string {
  return dayFmt.format(typeof d === 'string' ? new Date(d) : d).replace(',', '');
}

/** Relative-day label used in lists: "Today 11:00", "Tomorrow 07:00", "Sat 08:00", or "Mon 5 Oct 07:00". */
export function formatWhen(d: Date | string, now: Date = new Date()): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const key = dayKeyFmt.format(date);
  const todayKey = dayKeyFmt.format(now);
  const tomorrowKey = dayKeyFmt.format(new Date(now.getTime() + 86_400_000));
  const yesterdayKey = dayKeyFmt.format(new Date(now.getTime() - 86_400_000));
  const time = formatTime(date);
  if (key === todayKey) return `Today ${time}`;
  if (key === tomorrowKey) return `Tomorrow ${time}`;
  if (key === yesterdayKey) return `Yesterday ${time}`;
  const diffDays = Math.abs(date.getTime() - now.getTime()) / 86_400_000;
  if (diffDays < 6) return `${new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: ADDIS_TZ }).format(date)} ${time}`;
  return `${formatDay(date)} ${time}`;
}

/** "3 h 49 min", "42m", "1h 10m" style duration from minutes. */
export function formatDuration(totalMinutes: number, style: 'long' | 'short' = 'long'): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (style === 'short') return h > 0 ? `${h}h ${rest}m` : `${rest}m`;
  return h > 0 ? `${h} h ${rest} min` : `${rest} min`;
}

export function formatAge(from: Date | string, now: Date = new Date()): string {
  const mins = (now.getTime() - (typeof from === 'string' ? new Date(from) : from).getTime()) / 60_000;
  if (mins < 60) return `${Math.max(1, Math.round(mins))}m`;
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    const r = Math.round(mins % 60);
    return r > 0 && h < 6 ? `${h}h ${r}m` : `${h}h`;
  }
  return `${Math.floor(mins / 1440)}d`;
}

/** "Addis → Hawassa" style heading. */
export function routeLabel(from: string, to: string): string {
  return `${from} → ${to}`;
}

/** Shipment reference: RH-26-08817. */
export function formatShipmentRef(year: number, seq: number): string {
  return `RH-${String(year % 100).padStart(2, '0')}-${String(seq).padStart(5, '0')}`;
}


/** "Coffee, 16 sacks" — the way drivers and receivers talk about cargo. */
export function piecesLabel(cargoType: string, pieces: number | null | undefined): string {
  const def = CARGO_TYPES.find((c) => c.key === cargoType);
  const name = (def?.label ?? cargoType).split(',')[0]!;
  return pieces ? `${name}, ${pieces} ${def?.unit ?? 'pieces'}` : name;
}

/** "16 sacks of coffee" for SMS. */
export function pieceCount(cargoType: string, pieces: number | null | undefined): string {
  const def = CARGO_TYPES.find((c) => c.key === cargoType);
  const name = (def?.label ?? cargoType).split(',')[0]!.toLowerCase();
  return pieces ? `${pieces} ${def?.unit ?? 'pieces'} of ${name}` : name;
}
