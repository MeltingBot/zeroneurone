import { describe, it, expect, beforeEach } from 'vitest';
import { registerPlugin, clearAllPlugins, enablePlugin } from './pluginRegistry';
import { getSourceSchemes, getSourceSchemeNames } from './sourceSchemes';
import type { SourceSchemeExtension } from '../types/plugins';

const ext = (scheme: string, pluginId = 'test-plugin'): SourceSchemeExtension => ({
  scheme,
  resolve: () => true,
  open: () => {},
  pluginId,
});

describe('getSourceSchemes', () => {
  beforeEach(() => {
    clearAllPlugins();
    enablePlugin('test-plugin');
    enablePlugin('other-plugin');
  });

  it('aucun plugin → aucun schéma', () => {
    expect(getSourceSchemes().size).toBe(0);
  });

  it('garde les schémas valides, en minuscules', () => {
    registerPlugin('source:scheme', ext('MN'));
    expect([...getSourceSchemeNames()]).toEqual(['mn']);
  });

  it('ignore les schémas réservés ou invalides', () => {
    registerPlugin('source:scheme', ext('javascript'));
    registerPlugin('source:scheme', ext('asset'));
    registerPlugin('source:scheme', ext('https'));
    registerPlugin('source:scheme', ext('a b'));
    registerPlugin('source:scheme', { scheme: 'nofn', pluginId: 'test-plugin' } as unknown as SourceSchemeExtension);
    expect(getSourceSchemes().size).toBe(0);
  });

  it('premier enregistrement gagnant pour un même schéma', () => {
    const first = ext('mn');
    registerPlugin('source:scheme', first);
    registerPlugin('source:scheme', ext('mn', 'other-plugin'));
    expect(getSourceSchemes().get('mn')).toBe(first);
  });
});
