import { memo } from 'react';
import { Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ContextMenuExtension, MenuContext } from '../../types/plugins';
import type { Element, Link } from '../../types';
import { LinkEndsSummary } from './LinkEndsSummary';
import { ContextMenuShell } from './contextMenu/ContextMenuShell';
import { usePluginMenuItems } from './contextMenu/usePluginMenuItems';

interface LinkContextMenuProps {
  x: number;
  y: number;
  link: Link;
  from: Element | undefined;
  to: Element | undefined;
  /** Selects the link and opens its detail panel */
  onOpenDetail: () => void;
  onEditLabel: () => void;
  /** Present only when the link has a manual route offset in the current route style */
  onResetRoute?: () => void;
  onDelete: () => void;
  onClose: () => void;
  pluginExtensions?: readonly ContextMenuExtension[];
  menuContext?: MenuContext;
}

function LinkContextMenuComponent({
  x,
  y,
  link,
  from,
  to,
  onOpenDetail,
  onEditLabel,
  onResetRoute,
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
      header={<LinkEndsSummary link={link} from={from} to={to} />}
      onHeaderClick={onOpenDetail}
      headerTitle={cm('openDetail')}
      sections={[
        [
          { id: 'edit-label', label: cm('editLinkLabel'), icon: Pencil, onSelect: onEditLabel },
          ...(onResetRoute
            ? [{ id: 'reset-route', label: cm('resetLinkRoute'), icon: RotateCcw, onSelect: onResetRoute }]
            : []),
        ],
        pluginItems,
        [{ id: 'delete', label: cm('deleteLink'), icon: Trash2, danger: true, onSelect: onDelete }],
      ]}
    />
  );
}

export const LinkContextMenu = memo(LinkContextMenuComponent);
