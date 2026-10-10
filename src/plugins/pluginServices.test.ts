import { beforeEach, describe, expect, it, vi } from 'vitest';

// Disabled plugins, and the registry's listener on enable/disable.
const disabled = new Set<string>();
let pluginsChanged: () => void = () => {};
vi.mock('./pluginRegistry', () => ({
  isPluginDisabled: (id: string) => disabled.has(id),
  subscribeToPlugins: (cb: () => void) => {
    pluginsChanged = cb;
    return () => {};
  },
}));

const { provideService, getService, subscribeToServices, getServicesVersion, resetPluginServices, scopedPluginServices } = await import('./pluginServices');

const anchors = { version: 1, anchor: () => 'ok' };

beforeEach(() => {
  disabled.clear();
  resetPluginServices();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('pluginServices', () => {
  it('provides, gets and revokes a service', () => {
    const handle = provideService('mark-neurone', 'mark-neurone:anchors', anchors);
    expect(getService('mark-neurone:anchors')).toBe(anchors);
    handle.revoke();
    expect(getService('mark-neurone:anchors')).toBeUndefined();
  });

  it('refuses a name without the provider prefix, or a service without version', () => {
    provideService('oneneurone', 'mark-neurone:anchors', anchors);
    provideService('oneneurone', 'oneneurone:', anchors);
    provideService('oneneurone', 'oneneurone:x', { foo: 1 } as never);
    expect(getService('mark-neurone:anchors')).toBeUndefined();
    expect(getService('oneneurone:x')).toBeUndefined();
  });

  it('keeps the first provider of a name', () => {
    provideService('mark-neurone', 'mark-neurone:anchors', anchors);
    const other = { version: 2 };
    const handle = provideService('mark-neurone', 'mark-neurone:anchors', other);
    expect(getService('mark-neurone:anchors')).toBe(anchors);
    // The refused handle does nothing.
    handle.revoke();
    expect(getService('mark-neurone:anchors')).toBe(anchors);
  });

  it('hides the service of a disabled plugin, and tells consumers', () => {
    provideService('oneneurone', 'oneneurone:extraction', { version: 1 });
    const seen = vi.fn();
    subscribeToServices(seen);
    disabled.add('oneneurone');
    pluginsChanged();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(getService('oneneurone:extraction')).toBeUndefined();
  });

  it('notifies consumers on changed()', () => {
    const handle = provideService('oneneurone', 'oneneurone:extraction', { version: 1 });
    const before = getServicesVersion();
    const seen = vi.fn();
    subscribeToServices(seen);
    handle.changed();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(getServicesVersion()).toBe(before + 1);
  });
});

describe('scoped pluginServices', () => {
  it('provides under the calling plugin, whatever owner it passes', () => {
    const api = { pluginServices: scopedPluginServices('oneneurone') };
    api.pluginServices.provide('oneneurone:extraction', { version: 1 });
    expect(getService('oneneurone:extraction')).toEqual({ version: 1 });
    // Raw form with another owner: the owner stays the calling plugin.
    (api.pluginServices.provide as (...a: unknown[]) => unknown)('mark-neurone', 'mark-neurone:anchors', anchors);
    expect(getService('mark-neurone:anchors')).toBeUndefined();
  });
});
