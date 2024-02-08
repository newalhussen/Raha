export {
  formatAge,
  formatDay,
  formatDuration,
  formatEtb,
  formatEtbCompact,
  formatKg,
  formatPhone,
  formatTime,
  formatTonnes,
  formatWhen,
  initials,
} from '@raha/contracts';

/** "Addis Ababa → Hawassa" */
export const route = (from: { name: string }, to: { name: string }) => `${from.name} → ${to.name}`;

/** Drop "Ababa"/"Port" suffixes in tight spaces: "Addis", "Djibouti". */
export const shortPlace = (name: string) => name.replace(' Ababa', '').replace(' Port', '');
