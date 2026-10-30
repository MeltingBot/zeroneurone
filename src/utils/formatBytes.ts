import { dateLocale } from './dates';

const UNITS = ['kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

/**
 * Size in the UI language's units (ko/Mo in French, kB/MB in English…).
 * The kilobyte is the smallest unit shown: Intl writes bytes as "512 byte"
 * in English, and a few bytes do not matter here.
 */
export function formatBytes(bytes: number, language: string | undefined): string {
  let value = Math.max(0, bytes) / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return new Intl.NumberFormat(dateLocale(language), {
    style: 'unit',
    unit: UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(value);
}
