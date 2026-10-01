import type { ComponentType } from 'react';

export type MenuIcon = ComponentType<{ size?: number; className?: string }>;

/**
 * Declarative context menu entry. A menu is a list of sections; empty
 * sections are dropped and separators are drawn between the others.
 */
export interface MenuItem {
  id: string;
  label: string;
  icon?: MenuIcon | null;
  /** Keyboard hint displayed on the right (e.g. "Ctrl+C") */
  shortcut?: string;
  /** Tooltip (e.g. the full URL) */
  title?: string;
  onSelect?: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
  /** Shows a check mark (e.g. element already in this tab) */
  checked?: boolean;
  /** Non-interactive caption row inside a submenu */
  kind?: 'header';
  children?: MenuItem[];
}

/** Falsy entries are skipped, so items can be written as `cond && {...}`. */
export type MenuSection = (MenuItem | null | false | undefined)[];

/**
 * Submenu that collapses to its single child when it has only one entry,
 * and disappears when it has none — avoids "Analyze ▸ (one item)".
 */
export function submenu(
  id: string,
  label: string,
  icon: MenuIcon | null,
  children: (MenuItem | null | false | undefined)[],
): MenuItem | null {
  const items = children.filter(Boolean) as MenuItem[];
  if (items.length === 0) return null;
  if (items.length === 1 && !items[0].kind) return items[0];
  return { id, label, icon, children: items };
}
