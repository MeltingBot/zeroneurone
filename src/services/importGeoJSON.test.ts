// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { importService } from './importService';
import { db } from '../db/database';
import type { GeoPolygon } from '../types';

const square = (x: number, y: number, size: number): [number, number][] => [
  [x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y],
];

function collection(...features: unknown[]): string {
  return JSON.stringify({ type: 'FeatureCollection', features });
}

describe('importFromGeoJSON', () => {
  beforeEach(async () => {
    await db.elements.clear();
  });

  it('imports a MultiPolygon as its largest part, outer ring opened', async () => {
    const result = await importService.importFromGeoJSON(collection({
      type: 'Feature',
      properties: { name: 'Archipel' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [square(0, 0, 0.1)],
          [square(1, 1, 1), square(1.2, 1.2, 0.1)], // largest, with a hole
        ],
      },
    }), 'd1');

    expect(result.success).toBe(true);
    expect(result.elementsImported).toBe(1);
    expect(result.warnings).toEqual(['1 MultiPolygon réduit(s) à leur plus grand polygone']);
    const [el] = await db.elements.toArray();
    const geo = el.geo as GeoPolygon;
    expect(geo.type).toBe('polygon');
    expect(geo.coordinates).toEqual(square(1, 1, 1).slice(0, -1));
    expect(geo.center).toEqual({ lat: 1.5, lng: 1.5 });
  });

  it('imports a single-part MultiPolygon without warning', async () => {
    const result = await importService.importFromGeoJSON(collection({
      type: 'Feature',
      properties: { name: 'Commune' },
      geometry: { type: 'MultiPolygon', coordinates: [[square(0, 0, 1)]] },
    }), 'd1');

    expect(result.elementsImported).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('numbers unnamed features by their position in the file', async () => {
    const result = await importService.importFromGeoJSON(collection(
      { type: 'Feature', properties: {}, geometry: { type: 'GeometryCollection', geometries: [] } },
      { type: 'Feature', properties: {}, geometry: { type: 'GeometryCollection', geometries: [] } },
    ), 'd1');

    expect(result.warnings).toEqual([
      '"Feature 1": géométrie "GeometryCollection" non supportée, ignorée',
      '"Feature 2": géométrie "GeometryCollection" non supportée, ignorée',
    ]);
  });

  it('converts a Lambert 93 file to WGS 84', async () => {
    const result = await importService.importFromGeoJSON(JSON.stringify({
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::2154' } },
      features: [{
        type: 'Feature',
        properties: { nom: 'Tour Eiffel' },
        geometry: { type: 'MultiPolygon', coordinates: [[square(648137, 6862171, 200)]] },
      }],
    }), 'd1');

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    const [el] = await db.elements.toArray();
    const { center } = el.geo as GeoPolygon;
    expect(Math.abs(center.lng - 2.2945)).toBeLessThan(0.002);
    expect(Math.abs(center.lat - 48.8584)).toBeLessThan(0.002);
  });

  it('rejects another projected file with a reprojection hint', async () => {
    const result = await importService.importFromGeoJSON(JSON.stringify({
      type: 'FeatureCollection',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::3857' } },
      features: [{
        type: 'Feature',
        properties: { nom: 'Paris' },
        geometry: { type: 'Point', coordinates: [261600, 6250600] },
      }],
    }), 'd1');

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('EPSG::3857');
    expect(result.errors[0]).toContain('EPSG:4326');
    expect(await db.elements.count()).toBe(0);
  });

  it('skips out-of-range features but keeps valid ones', async () => {
    const result = await importService.importFromGeoJSON(collection(
      { type: 'Feature', properties: { name: 'Ok' }, geometry: { type: 'Point', coordinates: [2.35, 48.85] } },
      { type: 'Feature', properties: { name: 'Hors' }, geometry: { type: 'Point', coordinates: [445000, 6650000] } },
    ), 'd1');

    expect(result.success).toBe(true);
    expect(result.elementsImported).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/^1 entité\(s\) aux coordonnées hors WGS 84/);
  });

  it('labels elements with the chosen field, falling back when it is empty', async () => {
    const result = await importService.importFromGeoJSON(collection(
      { type: 'Feature', properties: { ID: 'SURF-1', TOPONYME: null, NATURE: 'Centrale' }, geometry: { type: 'Point', coordinates: [0.1, 46] } },
      { type: 'Feature', properties: { ID: null, nom: 'Parc nord' }, geometry: { type: 'Point', coordinates: [0.2, 46] } },
    ), 'd1', { labelField: 'ID' });

    expect(result.elementsImported).toBe(2);
    const labels = (await db.elements.toArray()).map(e => e.label).sort();
    expect(labels).toEqual(['Parc nord', 'SURF-1']);
    const surf = (await db.elements.toArray()).find(e => e.label === 'SURF-1')!;
    expect(surf.properties.map(p => p.key)).toEqual(['NATURE']);
  });
  it('imports only the selected fields, keeping the label field', async () => {
    await importService.importFromGeoJSON(collection(
      { type: 'Feature', properties: { ID: 'SURF-1', NATURE: 'Centrale', path: 'H:\\x.shp', description: 'note' }, geometry: { type: 'Point', coordinates: [0.1, 46] } },
    ), 'd1', { labelField: 'ID', fields: ['NATURE'] });

    const [el] = await db.elements.toArray();
    expect(el.label).toBe('SURF-1');
    expect(el.properties.map(p => p.key)).toEqual(['NATURE']);
    expect(el.notes).toBe('');
  });
});

describe('analyzeGeoJSONFields', () => {
  it('lists filled fields in file order and suggests a name key', () => {
    const analysis = importService.analyzeGeoJSONFields(collection(
      { type: 'Feature', properties: { ID: 'A', TOPONYME: null, NATURE: '' }, geometry: null },
      { type: 'Feature', properties: { ID: 'B', TOPONYME: 'Les Landes', NATURE: 'Centrale' }, geometry: null },
    ));
    expect(analysis).toEqual({
      featureCount: 2,
      fields: [
        { key: 'ID', sample: 'A' },
        { key: 'TOPONYME', sample: 'Les Landes' },
        { key: 'NATURE', sample: 'Centrale' },
      ],
      suggested: 'TOPONYME',
    });
  });

  it('suggests the first field when there is no name key, null for non-GeoJSON', () => {
    expect(importService.analyzeGeoJSONFields(collection(
      { type: 'Feature', properties: { ID: 'A', NATURE: 'Centrale' }, geometry: null },
    ))?.suggested).toBe('ID');
    expect(importService.analyzeGeoJSONFields('{"elements": []}')).toBeNull();
    expect(importService.analyzeGeoJSONFields('pas du json')).toBeNull();
  });
});
