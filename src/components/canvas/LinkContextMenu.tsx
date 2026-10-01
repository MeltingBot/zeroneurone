import { memo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ContextMenuExtension, MenuContext } from '../../types/plugins';
import { ContextMenuShell } from './contextMenu/ContextMenuShell';
import { usePluginMenuItems } from './contextMenu/usePluginMenuItems';

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
  const pluginItems = usePluginMenuItems(pluginExtensions, menuContext);

  return (
    <ContextMenuShell
      x={x}
      y={y}
      minWidthClass="min-w-44"
      onClose={onClose}
      header={
        <span className="text-xs text-text-secondary truncate block max-w-56">
          {linkLabel || cm('noLabel')}
        </span>
      }
      sections={[
        [{ id: 'edit-label', label: cm('editLinkLabel'), icon: Pencil, onSelect: onEditLabel }],
        pluginItems,
        [{ id: 'delete', label: cm('deleteLink'), icon: Trash2, danger: true, onSelect: onDelete }],
      ]}
    />
  );
}

export const LinkContextMenu = memo(LinkContextMenuComponent);
