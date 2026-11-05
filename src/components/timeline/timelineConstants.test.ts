import { describe, it, expect } from 'vitest';
import { axisStepForZoom, clipSpan, fitZoom, MAX_ZOOM, MIN_ZOOM, SINGLE_DATE_ZOOM } from './timelineConstants';

describe('timeline zoom to the minute', () => {
  it('reaches one pixel per second: entries 30 s apart stay apart', () => {
    const pxPerSecond = MAX_ZOOM / 86400;
    expect(30 * pxPerSecond).toBeGreaterThanOrEqual(30);
  });

  it('ticks by minute, 5 and 15 minutes once their labels fit', () => {
    expect(axisStepForZoom(60000)).toBe('minute');
    expect(axisStepForZoom(MAX_ZOOM)).toBe('minute');
    expect(axisStepForZoom(14000)).toBe('minute5');
    expect(axisStepForZoom(4000)).toBe('minute15');
    // The steps of before are unchanged
    expect(axisStepForZoom(1000)).toBe('hour');
    expect(axisStepForZoom(200)).toBe('hour6');
    expect(axisStepForZoom(50)).toBe('day');
    expect(axisStepForZoom(8)).toBe('week');
    expect(axisStepForZoom(1.5)).toBe('month');
    expect(axisStepForZoom(0.2)).toBe('year');
    expect(axisStepForZoom(0.01)).toBe('decade');
    expect(axisStepForZoom(MIN_ZOOM)).toBe('century');
  });

  it('fits a span down to the second, a single date to about a day', () => {
    expect(fitZoom(800, 20 / 1440)).toBe(57600);
    expect(fitZoom(800, 1 / 86400)).toBe(MAX_ZOOM);
    expect(fitZoom(800, 0)).toBe(SINGLE_DATE_ZOOM);
    expect(fitZoom(800, 1e9)).toBe(MIN_ZOOM);
  });

  it('draws a long period around the view only', () => {
    // Two years crossing the view at 1 px per second: beyond what browsers lay out
    expect(clipSpan(-63e6, 126e6, 800)).toEqual({ x: -800, width: 2400 });
    expect(clipSpan(100, 50, 800)).toEqual({ x: 100, width: 50 });
    // Outside the view: as it is
    expect(clipSpan(-5000, 100, 800)).toEqual({ x: -5000, width: 100 });
  });
});
