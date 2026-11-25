/** Ticks and labels of the timeline axis, for the view and the SVG export */

import { dateLocale } from '../../utils/dates';
import { axisStepForZoom, MINUTE_STEP_SIZE } from './timelineConstants';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AxisLabel {
  x: number;
  label: string;
  isMain: boolean;
}

/**
 * Axis ticks between `viewStart` and the right edge (`containerWidth` px at
 * `zoom` px per day): the smallest time unit whose labels fit between two ticks.
 */
export function computeAxisLabels(viewStart: Date, zoom: number, containerWidth: number, language: string): AxisLabel[] {
  const labels: AxisLabel[] = [];
  const viewEnd = new Date(viewStart.getTime() + (containerWidth / zoom) * DAY_MS);
  const dateToX = (date: Date) => ((date.getTime() - viewStart.getTime()) / DAY_MS) * zoom;

  // Pixel-based step selection for smooth transitions: the smallest time
  // unit whose labels fit between two ticks
  const step = axisStepForZoom(zoom);
  const minuteSize = MINUTE_STEP_SIZE[step];
  const format: Intl.DateTimeFormatOptions = step === 'day' || step === 'week'
    ? { day: 'numeric', month: 'short' }
    : step === 'month' ? { month: 'short' } : { year: 'numeric' };

  const current = new Date(viewStart);

  // Align to step boundary
  if (minuteSize) {
    current.setMinutes(Math.floor(current.getMinutes() / minuteSize) * minuteSize, 0, 0);
  } else if (step === 'hour') {
    current.setMinutes(0, 0, 0);
  } else if (step === 'hour6') {
    current.setHours(Math.floor(current.getHours() / 6) * 6, 0, 0, 0);
  } else if (step === 'century') {
    current.setFullYear(Math.floor(current.getFullYear() / 100) * 100);
    current.setMonth(0, 1);
    current.setHours(0, 0, 0, 0);
  } else if (step === 'decade') {
    current.setFullYear(Math.floor(current.getFullYear() / 10) * 10);
    current.setMonth(0, 1);
    current.setHours(0, 0, 0, 0);
  } else if (step === 'year') {
    current.setMonth(0, 1);
    current.setHours(0, 0, 0, 0);
  } else if (step === 'month') {
    current.setDate(1);
    current.setHours(0, 0, 0, 0);
  } else if (step === 'week') {
    const dayOfWeek = current.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    current.setDate(current.getDate() + daysToMonday);
    current.setHours(0, 0, 0, 0);
  } else {
    current.setHours(0, 0, 0, 0);
  }

  while (current <= viewEnd) {
    const x = dateToX(current);
    if (x >= -50 && x <= containerWidth + 50) {
      const isMain = step === 'century' ||
                     (step === 'decade' && current.getFullYear() % 100 === 0) ||
                     step === 'year' ||
                     (step === 'month' && current.getMonth() === 0) ||
                     (step === 'week' && current.getDate() <= 7) ||
                     (step === 'day' && (current.getDate() === 1 || current.getDay() === 1)) ||
                     (step === 'hour6' && current.getHours() === 0) ||
                     (step === 'hour' && current.getHours() % 6 === 0) ||
                     (minuteSize !== undefined && current.getMinutes() === 0);
      // For year/decade/century: use getFullYear() directly to show negative years (BC)
      // For hour steps: show date at midnight ticks, time otherwise
      const locale = dateLocale(language);
      let label: string;
      if (step === 'century' || step === 'decade' || step === 'year' || (step === 'month' && isMain)) {
        label = String(current.getFullYear());
      } else if (minuteSize) {
        // Minutes: the date at midnight, the hour on the hour, else hh:mm
        label = isMain && current.getHours() === 0
          ? current.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
          : `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`;
      } else if (step === 'hour' || step === 'hour6') {
        label = isMain
          ? current.toLocaleDateString(locale, { day: 'numeric', month: 'short' })
          : `${String(current.getHours()).padStart(2, '0')}:00`;
      } else {
        label = current.toLocaleDateString(locale, format);
      }
      labels.push({ x, label, isMain });
    }

    if (minuteSize) {
      current.setMinutes(current.getMinutes() + minuteSize);
    } else if (step === 'hour') {
      current.setHours(current.getHours() + 1);
    } else if (step === 'hour6') {
      current.setHours(current.getHours() + 6);
    } else if (step === 'century') {
      current.setFullYear(current.getFullYear() + 100);
    } else if (step === 'decade') {
      current.setFullYear(current.getFullYear() + 10);
    } else if (step === 'year') {
      current.setFullYear(current.getFullYear() + 1);
    } else if (step === 'month') {
      current.setMonth(current.getMonth() + 1);
    } else if (step === 'week') {
      current.setDate(current.getDate() + 7);
    } else {
      current.setDate(current.getDate() + 1);
    }
  }

  return labels;
}
