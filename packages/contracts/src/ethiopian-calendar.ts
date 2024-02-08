/**
 * Gregorian -> Ethiopian calendar conversion (via Julian Day Number).
 * The product shows Ethiopian month names on earnings / spend summaries ("Meskerem"),
 * because that is how drivers and businesses talk about their month.
 */

export const ETHIOPIAN_MONTHS = [
  'Meskerem',
  'Tikimt',
  'Hidar',
  'Tahsas',
  'Tir',
  'Yekatit',
  'Megabit',
  'Miazia',
  'Genbot',
  'Sene',
  'Hamle',
  'Nehase',
  'Pagume',
] as const;

export const ETHIOPIAN_MONTHS_AM = [
  'መስከረም',
  'ጥቅምት',
  'ኅዳር',
  'ታኅሣሥ',
  'ጥር',
  'የካቲት',
  'መጋቢት',
  'ሚያዝያ',
  'ግንቦት',
  'ሰኔ',
  'ሐምሌ',
  'ነሐሴ',
  'ጳጉሜን',
] as const;

export interface EthiopianDate {
  year: number;
  /** 1..13 */
  month: number;
  day: number;
  monthName: string;
  monthNameAm: string;
}

const JDN_EPOCH_OFFSET = 1723856;

function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function jdnToEthiopian(jdn: number): { year: number; month: number; day: number } {
  const r = (jdn - JDN_EPOCH_OFFSET) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor((jdn - JDN_EPOCH_OFFSET) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  const month = Math.floor(n / 30) + 1;
  const day = (n % 30) + 1;
  return { year, month, day };
}

export function toEthiopian(date: Date): EthiopianDate {
  // Use the calendar day as seen in Addis Ababa (UTC+3).
  const eat = new Date(date.getTime() + 3 * 3_600_000);
  const jdn = gregorianToJdn(eat.getUTCFullYear(), eat.getUTCMonth() + 1, eat.getUTCDate());
  const { year, month, day } = jdnToEthiopian(jdn);
  return {
    year,
    month,
    day,
    monthName: ETHIOPIAN_MONTHS[month - 1]!,
    monthNameAm: ETHIOPIAN_MONTHS_AM[month - 1]!,
  };
}

/** Start (UTC instant) of the Ethiopian month containing `date`. */
export function startOfEthiopianMonth(date: Date): Date {
  const e = toEthiopian(date);
  const eat = new Date(date.getTime() + 3 * 3_600_000);
  const start = Date.UTC(eat.getUTCFullYear(), eat.getUTCMonth(), eat.getUTCDate() - (e.day - 1));
  return new Date(start - 3 * 3_600_000);
}
