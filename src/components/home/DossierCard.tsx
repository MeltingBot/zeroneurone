import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Trash2, Edit2, Download, Star, Tag } from 'lucide-react';
import { IconButton, DropdownMenu, DropdownItem } from '../common';
import { formatRelativeTime } from '../../utils';
import type { Dossier } from '../../types';
import { dossierRepository, elementRepository, linkRepository, reportRepository, tabRepository } from '../../db/repositories';
import { exportService } from '../../services/exportService';
import { fileService } from '../../services/fileService';
import { toast } from '../../stores';

interface DossierCardProps {
  dossier: Dossier;
  onDelete: (id: string) => void;
  onRename: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onEditTags: (id: string) => void;
}

export function DossierCard({
  dossier,
  onDelete,
  onRename,
  onToggleFavorite,
  onEditTags,
}: DossierCardProps) {
  const { t, i18n } = useTranslation('pages');
  const navigate = useNavigate();
  const [stats, setStats] = useState({ elementCount: 0, linkCount: 0 });

  useEffect(() => {
    dossierRepository.getStats(dossier.id).then(setStats);
  }, [dossier.id]);

  const handleOpen = () => {
    navigate(`/dossier/${dossier.id}`);
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite(dossier.id);
  };

  const handleExport = async () => {
    try {
      const elements = await elementRepository.getByDossier(dossier.id);
      const links = await linkRepository.getByDossier(dossier.id);
      const assets = await fileService.getAssetsByDossier(dossier.id);
      const report = await reportRepository.getByDossierWithYDoc(dossier.id);
      const tabs = await tabRepository.getByDossier(dossier.id);
      await exportService.exportDossier('zip', dossier, elements, links, assets, report, tabs);
      toast.success(t('home.card.exportSuccess'));
    } catch (error) {
      console.error('[DossierCard] Export error:', error);
      toast.error(t('home.card.exportError'));
    }
  };

  return (
    <div
      onClick={handleOpen}
      data-testid={`dossier-card-${dossier.id}`}
      className="
        border border-border-default sketchy-border node-shadow
        hover:bg-bg-secondary hover:node-shadow-hover
        bg-bg-primary
        cursor-pointer
        transition-all
        relative
      "
    >
      {/* Favorite star - top right corner */}
      <button
        onClick={handleFavoriteClick}
        className={`absolute top-2 right-2 p-1 rounded transition-colors z-10 ${
          dossier.isFavorite
            ? 'text-amber-500 hover:text-amber-600'
            : 'text-text-tertiary hover:text-text-secondary'
        }`}
        title={dossier.isFavorite ? t('home.card.unfavorite') : t('home.card.favorite')}
      >
        <Star size={14} fill={dossier.isFavorite ? 'currentColor' : 'none'} />
      </button>

      <div className="p-3">
        <div className="flex items-start justify-between gap-2 pr-6">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-text-primary truncate">
              {dossier.name}
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              {t('home.card.modified', { time: formatRelativeTime(dossier.updatedAt, i18n.language) })} •{' '}
              {t('home.card.elementCount', { count: stats.elementCount })}
              {stats.linkCount > 0 && ` • ${t('home.card.linkCount', { count: stats.linkCount })}`}
            </p>
          </div>
          <div onClick={handleMenuClick}>
            <DropdownMenu
              trigger={
                <IconButton size="sm" data-testid="card-menu">
                  <MoreHorizontal size={14} />
                </IconButton>
              }
            >
              <DropdownItem onClick={() => onRename(dossier.id)} data-testid="rename-action">
                <span className="flex items-center gap-2">
                  <Edit2 size={14} />
                  {t('home.card.rename')}
                </span>
              </DropdownItem>
              <DropdownItem onClick={() => onEditTags(dossier.id)} data-testid="edit-tags-action">
                <span className="flex items-center gap-2">
                  <Tag size={14} />
                  {t('home.card.editTags')}
                </span>
              </DropdownItem>
              <DropdownItem onClick={handleExport} data-testid="export-action">
                <span className="flex items-center gap-2">
                  <Download size={14} />
                  {t('home.card.exportZip')}
                </span>
              </DropdownItem>
              <DropdownItem destructive onClick={() => onDelete(dossier.id)} data-testid="delete-action">
                <span className="flex items-center gap-2">
                  <Trash2 size={14} />
                  {t('home.card.delete')}
                </span>
              </DropdownItem>
            </DropdownMenu>
          </div>
        </div>

        {/* Tags */}
        {Array.isArray(dossier.tags) && dossier.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {dossier.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[10px] bg-bg-tertiary text-text-secondary rounded border border-border-default"
              >
                {tag}
              </span>
            ))}
            {dossier.tags.length > 4 && (
              <span className="px-1.5 py-0.5 text-[10px] bg-bg-tertiary text-text-tertiary rounded border border-border-default">
                +{dossier.tags.length - 4}
              </span>
            )}
          </div>
        )}

        {/* Description */}
        {dossier.description && (
          <p className="text-xs text-text-tertiary mt-2 line-clamp-2">
            {dossier.description}
          </p>
        )}
      </div>
    </div>
  );
}
