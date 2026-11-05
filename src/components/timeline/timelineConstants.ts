/** Timeline geometry shared by the view and its hooks */

export const MIN_ZOOM = 0.002; // pixels per day (allows viewing centuries)
/** Pixels per day: 1 px per second, entries 30 s apart stay apart (~13 min visible at 800px) */
export const MAX_ZOOM = 86400;
/** Zoom to fit a single date (no span to fit): about a day visible */
export const SINGLE_DATE_ZOOM = 900;
export const ROW_HEIGHT = 36;
export const ROW_GAP = 8;

/** Zoom (px per day) that shows `days` in `width` pixels, within the zoom bounds */
export function fitZoom(width: number, days: number): number {
  if (!(days > 0)) return SINGLE_DATE_ZOOM;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, width / days));
}

/**
 * A bar drawn between two x, kept to the part near the view: browsers cap
 * layout lengths (about 33 million px), so at a fine zoom a long period
 * crossing the view would otherwise be drawn too short, off screen. A bar
 * outside the view is returned as it is.
 */
export function clipSpan(x: number, width: number, viewWidth: number): { x: number; width: number } {
  const left = -viewWidth;
  const right = viewWidth * 2;
  const start = Math.max(left, x);
  const end = Math.min(right, x + width);
  if (end <= start) return { x, width };
  return { x: start, width: end - start };
}

export type AxisStep = 'minute' | 'minute5' | 'minute15' | 'hour' | 'hour6' | 'day' | 'week' | 'month' | 'year' | 'decade' | 'century';

/** Minimum spacing between two ticks, from the label width at 10px ("12:00", "12 sept.", "sept." / "2025") */
const SPACING = { time: 40, day: 48, month: 36, year: 36 };

/** The smallest time unit whose labels fit between two ticks at this zoom (px per day) */
export function axisStepForZoom(zoom: number): AxisStep {
  const perHour = zoom / 24;
  if (perHour / 60 >= SPACING.time) return 'minute';
  if (perHour / 12 >= SPACING.time) return 'minute5';
  if (perHour / 4 >= SPACING.time) return 'minute15';
  if (perHour >= SPACING.time) return 'hour';
  if (perHour * 6 >= SPACING.time) return 'hour6';
  if (zoom >= SPACING.day) return 'day';
  if (zoom * 7 >= SPACING.day) return 'week';
  if (zoom * 30 >= SPACING.month) return 'month';
  if (zoom * 365 >= SPACING.year) return 'year';
  if (zoom * 3652 >= SPACING.year) return 'decade';
  return 'century';
}

/** Minutes between two ticks of a minute step */
export const MINUTE_STEP_SIZE: Partial<Record<AxisStep, number>> = { minute: 1, minute5: 5, minute15: 15 };
