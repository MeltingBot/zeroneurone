import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode, RefObject } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { MenuItem, MenuSection } from './types';

const VIEWPORT_PADDING = 8;

const PANEL_CLASS = 'fixed z-50 py-1 bg-bg-primary border border-border-default sketchy-border-soft panel-shadow';

/** Enabled menu items of the menu that directly contains `el`. */
function menuItemsOf(menu: HTMLElement): HTMLButtonElement[] {
  return Array.from(menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')).filter(
    (b) => !b.disabled && b.closest('[role="menu"]') === menu,
  );
}

interface MenuRowProps {
  item: MenuItem;
  isOpen: boolean;
  setOpenId: (id: string | null) => void;
  onClose: () => void;
  /** Set when this row lives in a submenu: closes it and returns focus to its anchor */
  onCloseSubmenu?: () => void;
}

function MenuRow({ item, isOpen, setOpenId, onClose, onCloseSubmenu }: MenuRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [focusFirst, setFocusFirst] = useState(false);
  const hasChildren = !!item.children && item.children.length > 0;

  if (item.kind === 'header') {
    return (
      <div className="px-3 pt-1.5 pb-0.5 text-xs text-text-tertiary truncate max-w-72" title={item.title}>
        {item.label}
      </div>
    );
  }

  const open = (viaKeyboard: boolean) => {
    setFocusFirst(viaKeyboard);
    setOpenId(item.id);
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (item.disabled) return;
    if (hasChildren) {
      // detail === 0: click synthesized by Enter/Space
      if (isOpen && e.detail !== 0) setOpenId(null);
      else open(e.detail === 0);
      return;
    }
    let result: void | Promise<void> | undefined;
    try {
      result = item.onSelect?.();
    } finally {
      onClose();
    }
    if (result instanceof Promise) {
      result.catch((err) => console.warn(`[ContextMenu] "${item.id}" failed:`, err));
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowRight' && hasChildren) {
      e.preventDefault();
      e.stopPropagation();
      open(true);
    } else if (e.key === 'ArrowLeft' && onCloseSubmenu) {
      e.preventDefault();
      e.stopPropagation();
      onCloseSubmenu();
    }
  };

  const Icon = item.icon;
  const colorClass = item.disabled
    ? 'text-text-tertiary cursor-not-allowed'
    : item.danger
      ? 'text-error hover:bg-pastel-pink focus:bg-pastel-pink'
      : 'text-text-primary hover:bg-bg-tertiary focus:bg-bg-tertiary';

  return (
    <div ref={rowRef} onMouseEnter={() => setOpenId(hasChildren ? item.id : null)}>
      <button
        ref={buttonRef}
        type="button"
        role="menuitem"
        aria-haspopup={hasChildren ? 'menu' : undefined}
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-disabled={item.disabled || undefined}
        disabled={item.disabled}
        title={item.title}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onMouseEnter={(e) => e.currentTarget.focus({ preventScroll: true })}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left outline-none transition-colors ${colorClass} ${isOpen ? 'bg-bg-tertiary' : ''}`}
      >
        {Icon ? <Icon size={14} className="shrink-0" /> : <span className="w-3.5 shrink-0" />}
        <span className="truncate">{item.label}</span>
        {item.checked && <Check size={12} className="ml-auto shrink-0 text-text-tertiary" />}
        {item.shortcut && <span className="ml-auto pl-4 shrink-0 text-xs text-text-tertiary">{item.shortcut}</span>}
        {hasChildren && <ChevronRight size={14} className="ml-auto shrink-0 text-text-tertiary" />}
      </button>
      {isOpen && hasChildren && (
        <Submenu
          anchorRef={rowRef}
          items={item.children!}
          focusFirst={focusFirst}
          onClose={onClose}
          onRequestClose={() => {
            setOpenId(null);
            buttonRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </div>
  );
}

interface MenuListProps {
  sections: MenuItem[][];
  onClose: () => void;
  onCloseSubmenu?: () => void;
}

function MenuList({ sections, onClose, onCloseSubmenu }: MenuListProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      {sections.map((section, i) => (
        <div key={i} className={i > 0 ? 'py-1 border-t border-border-default' : 'py-0'}>
          {section.map((item) => (
            <MenuRow
              key={item.id}
              item={item}
              isOpen={openId === item.id}
              setOpenId={setOpenId}
              onClose={onClose}
              onCloseSubmenu={onCloseSubmenu}
            />
          ))}
        </div>
      ))}
    </>
  );
}

interface SubmenuProps {
  anchorRef: RefObject<HTMLDivElement | null>;
  items: MenuItem[];
  focusFirst: boolean;
  onClose: () => void;
  onRequestClose: () => void;
}

function Submenu({ anchorRef, items, focusFirst, onClose, onRequestClose }: SubmenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Open on the right of the anchor, flip to the left when it would overflow.
  // No deps on purpose: re-measure after each render, setPos only when it moved.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!ref.current || !anchorRef.current) return;
    const a = anchorRef.current.getBoundingClientRect();
    const r = ref.current.getBoundingClientRect();
    let left = a.right - 2;
    if (left + r.width > window.innerWidth - VIEWPORT_PADDING) {
      left = Math.max(VIEWPORT_PADDING, a.left - r.width + 2);
    }
    let top = a.top - 4;
    if (top + r.height > window.innerHeight - VIEWPORT_PADDING) {
      top = Math.max(VIEWPORT_PADDING, window.innerHeight - VIEWPORT_PADDING - r.height);
    }
    if (!pos || pos.left !== left || pos.top !== top) setPos({ left, top });
  });

  // Once positioned (a hidden element can't take focus), keyboard opening focuses the first entry
  const focused = useRef(false);
  useEffect(() => {
    if (!pos || !focusFirst || focused.current || !ref.current) return;
    focused.current = true;
    menuItemsOf(ref.current)[0]?.focus({ preventScroll: true });
  }, [pos, focusFirst]);

  return (
    <div
      ref={ref}
      role="menu"
      className={`${PANEL_CLASS} min-w-48 max-w-80 max-h-80 overflow-y-auto`}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
    >
      <MenuList sections={[items]} onClose={onClose} onCloseSubmenu={onRequestClose} />
    </div>
  );
}

interface ContextMenuShellProps {
  x: number;
  y: number;
  header?: ReactNode;
  sections: MenuSection[];
  onClose: () => void;
  /** Tailwind min-width class of the root panel */
  minWidthClass?: string;
}

/**
 * Shared context menu: backdrop, viewport clamping, sections with separators,
 * submenus (hover or click, flipped near the right edge) and keyboard
 * navigation (↑ ↓ Home End → ← Enter Esc).
 */
export function ContextMenuShell({ x, y, header, sections, onClose, minWidthClass = 'min-w-48' }: ContextMenuShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  const cleanSections = sections
    .map((s) => s.filter(Boolean) as MenuItem[])
    .filter((s) => s.length > 0);

  // Keep the menu inside the viewport. Runs after every render because async
  // plugin entries can make the menu grow after it opened.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    let newX = x;
    let newY = y;
    if (x + rect.width > window.innerWidth - VIEWPORT_PADDING) newX = window.innerWidth - rect.width - VIEWPORT_PADDING;
    if (y + rect.height > window.innerHeight - VIEWPORT_PADDING) newY = window.innerHeight - rect.height - VIEWPORT_PADDING;
    newX = Math.max(VIEWPORT_PADDING, newX);
    newY = Math.max(VIEWPORT_PADDING, newY);
    if (newX !== position.x || newY !== position.y) setPosition({ x: newX, y: newY });
  });

  // Take focus for keyboard navigation, give it back on close
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      // Only when focus fell back to <body> — an action may have focused an input
      const active = document.activeElement;
      const lost = !active || active === document.body;
      if (lost && previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as HTMLElement;
    const menu = (target === rootRef.current ? rootRef.current : target.closest('[role="menu"]')) as HTMLElement | null;
    if (!menu) return;
    const items = menuItemsOf(menu);
    if (items.length === 0) return;
    const current = items.indexOf(target as HTMLButtonElement);
    let next: number;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (current < 0) next = e.key === 'ArrowDown' ? 0 : items.length - 1;
    else next = (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus({ preventScroll: true });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={rootRef}
        role="menu"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onContextMenu={(e) => e.preventDefault()}
        className={`${PANEL_CLASS} ${minWidthClass} max-w-80 outline-none`}
        style={{ left: position.x, top: position.y }}
      >
        {header && <div className="px-3 py-1.5 mb-1 border-b border-border-default">{header}</div>}
        <MenuList sections={cleanSections} onClose={onClose} />
      </div>
    </>
  );
}
