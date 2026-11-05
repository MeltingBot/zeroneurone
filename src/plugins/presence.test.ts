// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { useSyncStore } from '../stores/syncStore';
import type { UserPresence } from '../types/yjs';
import { getPresence, getRemoteUsers, onPresenceChange } from './presence';

const remote = (id: string, over: Partial<UserPresence> = {}): UserPresence => ({
  odUserId: id, name: `User ${id}`, color: '#3b82f6', cursor: null, selection: [], linkSelection: [],
  dragging: [], editing: null, editingLink: null, editingReportSection: null, viewMode: 'canvas', lastSeen: 1000, ...over,
});

describe('presence for plugins', () => {
  beforeEach(() => {
    useSyncStore.setState({ mode: 'local', remoteUsers: [] });
  });

  it('gives no one while the dossier is not shared', () => {
    useSyncStore.setState({ remoteUsers: [remote('a')] });
    expect(getRemoteUsers()).toEqual([]);
    expect(getPresence().shared).toBe(false);
    expect(getPresence().localUser).toEqual({
      userId: useSyncStore.getState().localUser.id,
      name: useSyncStore.getState().localUser.name,
      color: useSyncStore.getState().localUser.color,
    });
  });

  it('gives the users connected to the shared dossier', () => {
    useSyncStore.setState({ mode: 'shared', remoteUsers: [remote('a', { selection: ['e1'], viewMode: 'timeline' })] });
    expect(getRemoteUsers()).toEqual([
      { userId: 'a', name: 'User a', color: '#3b82f6', lastSeen: 1000, selection: ['e1'], viewMode: 'timeline' },
    ]);
  });

  it('reports a change of who is there, not a cursor move nor a heartbeat', () => {
    const seen: number[] = [];
    const off = onPresenceChange((p) => seen.push(p.remoteUsers.length));
    useSyncStore.setState({ mode: 'shared' });
    useSyncStore.setState({ remoteUsers: [remote('a')] });
    useSyncStore.setState({ remoteUsers: [remote('a', { cursor: { x: 1, y: 2 }, lastSeen: 2000 })] });
    useSyncStore.setState({ remoteUsers: [remote('a'), remote('b')] });
    off();
    useSyncStore.setState({ remoteUsers: [] });
    expect(seen).toEqual([0, 1, 2]);
  });

  it('keeps a failing listener from breaking the others', () => {
    const seen: string[] = [];
    const offA = onPresenceChange(() => { throw new Error('boom'); });
    const offB = onPresenceChange(() => seen.push('b'));
    useSyncStore.setState({ mode: 'shared' });
    offA(); offB();
    expect(seen).toEqual(['b']);
  });

  it('is given to a community plugin only with collab:read', async () => {
    const { createScopedPluginAPI, pluginAPI } = await import('./pluginAPI');
    const { buildSandboxedAPI } = await import('./pluginSandbox');
    const scoped = createScopedPluginAPI('p');
    expect(pluginAPI.features.presence).toBe(true);
    expect(buildSandboxedAPI(scoped, 'community', ['collab:read']).collab).toBe(scoped.collab);
    expect(buildSandboxedAPI(scoped, 'community', ['stores:dossier:read']).collab).toBeUndefined();
    expect(buildSandboxedAPI(scoped, 'trusted', []).collab).toBe(scoped.collab);
  });
});
