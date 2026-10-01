// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { clearAllPlugins, registerPlugin } from '../../../plugins/pluginRegistry';
import { groupByPlugin } from './usePluginMenuItems';
import type { MenuItem } from './types';

const item = (id: string): MenuItem => ({ id, label: id });

describe('groupByPlugin', () => {
  afterEach(() => clearAllPlugins());

  it('keeps single-entry plugins and core entries inline', () => {
    const out = groupByPlugin([
      { item: item('core') },
      { item: item('vault-backup'), pluginId: 'vault' },
    ]);
    expect(out.map((i) => i.id)).toEqual(['core', 'vault-backup']);
  });

  it('folds a plugin with several entries into a submenu named after its card', () => {
    registerPlugin('home:card', { id: 'oneneurone', name: 'Neurone', description: '', icon: 'Brain' });
    const out = groupByPlugin([
      { item: item('ask'), pluginId: 'oneneurone' },
      { item: item('suggest-tag'), pluginId: 'goneurone' },
      { item: item('summarize'), pluginId: 'oneneurone' },
    ]);
    expect(out.map((i) => i.id)).toEqual(['plugin:oneneurone', 'suggest-tag']);
    expect(out[0].label).toBe('Neurone');
    expect(out[0].children!.map((c) => c.id)).toEqual(['ask', 'summarize']);
  });

  it('falls back to the plugin id when no card is registered', () => {
    const out = groupByPlugin([
      { item: item('a'), pluginId: 'spot' },
      { item: item('b'), pluginId: 'spot' },
    ]);
    expect(out[0].label).toBe('spot');
  });
});
