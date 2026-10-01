import { useEffect, useState } from 'react';
import { icons } from 'lucide-react';
import type { ContextMenuExtension, MenuContext } from '../../../types/plugins';
import { getExtensionPluginId, getPluginInfo } from '../../../plugins/pluginRegistry';
import type { MenuIcon, MenuItem } from './types';

/** A plugin with at least this many entries gets its own submenu. */
const PLUGIN_SUBMENU_THRESHOLD = 2;

function iconByName(name: string | undefined): MenuIcon | null {
  if (!name) return null;
  return (icons[name as keyof typeof icons] as MenuIcon | undefined) ?? null;
}

async function resolveExtension(ext: ContextMenuExtension, ctx: MenuContext): Promise<MenuItem | null> {
  const visible = ext.visible ? await ext.visible(ctx) : true;
  if (!visible) return null;
  const children = ext.children ? await ext.children(ctx) : [];
  const icon = iconByName(ext.icon);

  // One child: run it directly (GoNeurone / SpotNeurone rely on this shortcut)
  if (children.length === 1) {
    const child = children[0];
    return { id: ext.id, label: child.label, icon: iconByName(child.icon) ?? icon, onSelect: () => child.action() };
  }
  if (children.length > 1) {
    return {
      id: ext.id,
      label: ext.label,
      icon,
      children: children.map((child) => ({
        id: `${ext.id}:${child.id}`,
        label: child.label,
        icon: iconByName(child.icon),
        onSelect: () => child.action(),
      })),
    };
  }
  return { id: ext.id, label: ext.label, icon, onSelect: () => ext.action(ctx) };
}

/**
 * Group resolved entries by plugin: a plugin with several entries is folded
 * into a submenu named after it, a plugin with a single entry stays inline.
 */
export function groupByPlugin(entries: { item: MenuItem; pluginId?: string }[]): MenuItem[] {
  const counts = new Map<string, number>();
  for (const e of entries) if (e.pluginId) counts.set(e.pluginId, (counts.get(e.pluginId) ?? 0) + 1);

  const result: MenuItem[] = [];
  const groups = new Map<string, MenuItem>();
  for (const { item, pluginId } of entries) {
    if (!pluginId || (counts.get(pluginId) ?? 0) < PLUGIN_SUBMENU_THRESHOLD) {
      result.push(item);
      continue;
    }
    let group = groups.get(pluginId);
    if (!group) {
      const info = getPluginInfo(pluginId);
      group = { id: `plugin:${pluginId}`, label: info?.name ?? pluginId, icon: iconByName(info?.icon), children: [] };
      groups.set(pluginId, group);
      result.push(group);
    }
    group.children!.push(item);
  }
  return result;
}

/**
 * Resolve plugin context menu extensions (async `visible` and `children`)
 * once when the menu opens (the menu remounts on each opening).
 */
export function usePluginMenuItems(
  extensions: readonly ContextMenuExtension[] | undefined,
  context: MenuContext | undefined,
): MenuItem[] {
  const [items, setItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    const exts = extensions;
    const ctx = context;
    if (!exts || exts.length === 0 || !ctx) return;
    let cancelled = false;

    (async () => {
      // In parallel: one slow plugin must not delay the others
      const resolved = await Promise.all(
        exts.map(async (ext) => {
          try {
            const item = await resolveExtension(ext, ctx);
            return item ? { item, pluginId: getExtensionPluginId(ext) } : null;
          } catch (err) {
            console.warn(`[ContextMenu] Plugin extension "${ext.id}" error:`, err);
            return null;
          }
        }),
      );
      const entries = resolved.filter((e): e is { item: MenuItem; pluginId: string | undefined } => e !== null);
      if (!cancelled) setItems(groupByPlugin(entries));
    })();

    return () => {
      cancelled = true;
    };
    // Resolve once per opening: `context` is a new object on every parent render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return items;
}
