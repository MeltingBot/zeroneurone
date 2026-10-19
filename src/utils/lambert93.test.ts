import { describe, it, expect } from 'vitest';
import { lambert93ToWgs84, wgs84ToLambert93, isLambert93CrsName } from './lambert93';

describe('lambert93ToWgs84', () => {
  it('maps the projection origin to 3°E 46.5°N', () => {
    const [lng, lat] = lambert93ToWgs84([700000, 6600000]);
    expect(lng).toBeCloseTo(3, 9);
    expect(lat).toBeCloseTo(46.5, 9);
  });

  it('places the Eiffel Tower in Paris', () => {
    const [lng, lat] = lambert93ToWgs84([648237, 6862271]);
    expect(Math.abs(lng - 2.2945)).toBeLessThan(0.002);
    expect(Math.abs(lat - 48.8584)).toBeLessThan(0.002);
  });

  it('round-trips across mainland France', () => {
    for (const p of [[-4.5, 48.4], [8.2, 48.6], [3, 42.5], [2.5, 51], [9.4, 42.7]] as [number, number][]) {
      const [lng, lat] = lambert93ToWgs84(wgs84ToLambert93(p));
      expect(lng).toBeCloseTo(p[0], 9);
      expect(lat).toBeCloseTo(p[1], 9);
    }
  });
});

describe('isLambert93CrsName', () => {
  it('recognises the usual spellings', () => {
    expect(isLambert93CrsName('urn:ogc:def:crs:EPSG::2154')).toBe(true);
    expect(isLambert93CrsName('EPSG:2154')).toBe(true);
    expect(isLambert93CrsName('urn:ogc:def:crs:OGC:1.3:CRS84')).toBe(false);
    expect(isLambert93CrsName(undefined)).toBe(false);
  });
});
