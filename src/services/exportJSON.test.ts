// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Dossier } from '../types';
import { exportService } from './exportService';

const dossier = { id: 'd1', name: 'Dossier', description: '', settings: {}, createdAt: new Date(), updatedAt: new Date() } as unknown as Dossier;

describe('JSON export — formatting', () => {
  it('is indented by default and on one line when compact, with the same data', () => {
    const pretty = exportService.exportToJSON(dossier, [], []);
    const compact = exportService.exportToJSON(dossier, [], [], undefined, undefined, undefined, undefined, undefined, undefined, undefined, true);
    expect(pretty).toContain('\n  "version"');
    expect(compact).not.toContain('\n');
    expect(compact.length).toBeLessThan(pretty.length);
    const strip = (json: string) => ({ ...JSON.parse(json), exportedAt: null });
    expect(strip(compact)).toEqual(strip(pretty));
  });
});
