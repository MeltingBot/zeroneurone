import { memo, useRef, useState, useEffect, useLayoutEffect } from 'react';
import { Pencil, Trash2, icons } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ContextMenuExtension, ContextMenuChild, MenuContext } from '../../types/plugins';

interface LinkContextMenuProps {
  x: number;
  y: number;
  linkId: string;
  linkLabel: string;
  onEditLabel: () => void;
  onDelete: () => void;
  onClose: () => void;
  pluginExtensions?: readonly ContextMenuExtension[];
  menuContext?: MenuContext;
}

interface ResolvedExtension {
  ext: ContextMenuExtension;
  children: ContextMenuChild[];
}

function LinkContextMenuComponent({
  x,
  y,
  linkLabel,
  onEditLabel,
  onDelete,
  onClose,
  pluginExtensions,
  menuContext,
}: LinkContextMenuProps) {
  const { t } = useTranslation('pages');
  const cm = (key: string) => t(`dossier.contextMenu.${key}`);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  // Resolve async visible/children for plugin extensions
  const [resolvedExtensions, setResolvedExtensions] = useState<ResolvedExtension[]>([]);

  useEffect(() => {
    if (!pluginExtensions || !menuContext) return;
    let cancelled = false;

    (async () => {
      const results: ResolvedExtension[] = [];
      for (const ext of pluginExtensions) {
        try {
          const isVisible = ext.visible ? await ext.visible(menuContext) : true;
          if (!isVisible) continue;
          const children = ext.children ? await ext.children(menuContext) : [];
          results.push({ ext, children });
        } catch (err) {
          console.warn(`[LinkContextMenu] Plugin extension "${ext.id}" error:`, err);
        }
      }
      if (!cancelled) setResolvedExtensions(results);
    })();

    return () => { cancelled = true; };
  }, [pluginExtensions, menuContext]);

  // Adjust position to keep menu within viewport
  useLayoutEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const padding = 8;
      let newX = x;
      let newY = y;

      if (x + rect.width > window.innerWidth - padding) {
        newX = window.innerWidth - rect.width - padding;
      }
      if (y + rect.height > window.innerHeight - padding) {
        newY = window.innerHeight - rect.height - padding;
      }
      if (newX < padding) newX = padding;
      if (newY < padding) newY = padding;

      if (newX !== x || newY !== y) {
        setPosition({ x: newX, y: newY });
      }
    }
  }, [x, y]);

  const itemClass = 'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary transition-colors';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />

      {/* Menu */}
      <div
        ref={menuRef}
        className="fixed z-50 min-w-44 py-1 bg-bg-primary border border-border-default sketchy-border-soft panel-shadow"
        style={{ left: position.x, top: position.y }}
      >
        {/* Header — link label */}
        <div className="px-3 py-1.5 border-b border-border-default">
          <span className="text-xs text-text-secondary truncate block max-w-56">
            {linkLabel || cm('noLabel')}
          </span>
        </div>

        {/* Native actions */}
        <div className="py-1">
          <button onClick={() => { onEditLabel(); onClose(); }} className={itemClass}>
            <Pencil size={14} />
            {cm('editLinkLabel')}
          </button>
        </div>

        {/* Plugin extensions */}
        {resolvedExtensions.length > 0 && (
          <div className="py-1 border-t border-border-default">
            {resolvedExtensions.map(({ ext, children }) => {
              const Icon = icons[ext.icon as keyof typeof icons];

              // Single child — apply directly
              if (children.length === 1) {
                const child = children[0];
                const ChildIcon = child.icon ? icons[child.icon as keyof typeof icons] : null;
                return (
                  <button
                    key={ext.id}
                    onClick={async () => {
                      await child.action();
                      onClose();
                    }}
                    className={itemClass}
                  >
                    {ChildIcon ? <ChildIcon size={14} /> : (Icon ? <Icon size={14} /> : null)}
                    {child.label}
                  </button>
                );
              }

              // Multiple children — flat group under parent label
              if (children.length > 1) {
                return (
                  <div key={ext.id}>
                    {ext.separator && <div className="border-t border-border-default my-1" />}
                    <div className="px-3 py-1 text-xs text-text-tertiary font-medium">
                      {Icon && <Icon size={12} className="inline mr-1.5 -mt-0.5" />}
                      {ext.label}
                    </div>
                    {children.map((child) => {
                      const ChildIcon = child.icon ? icons[child.icon as keyof typeof icons] : null;
                      return (
                        <button
                          key={child.id}
                          onClick={async () => {
                            await child.action();
                            onClose();
                          }}
                          className={`${itemClass} pl-6`}
                        >
                          {ChildIcon && <ChildIcon size={14} />}
                          {child.label}
                        </button>
                      );
                    })}
                  </div>
                );
              }

              // No children — simple action button
              return (
                <button
                  key={ext.id}
                  onClick={async () => {
                    if (menuContext) await ext.action(menuContext);
                    onClose();
                  }}
                  className={itemClass}
                >
                  {Icon && <Icon size={14} />}
                  {ext.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Delete — always last */}
        <div className="py-1 border-t border-border-default">
          <button
            onClick={() => { onDelete(); onClose(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-error hover:bg-pastel-pink transition-colors"
          >
            <Trash2 size={14} />
            {cm('deleteLink')}
          </button>
        </div>
      </div>
    </>
  );
}

export const LinkContextMenu = memo(LinkContextMenuComponent);
