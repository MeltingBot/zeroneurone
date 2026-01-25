import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Trash2, Edit2, Download } from 'lucide-react';
import { IconButton, DropdownMenu, DropdownItem } from '../common';
import { formatRelativeTime } from '../../utils';
import type { Investigation } from '../../types';
import { investigationRepository, elementRepository, linkRepository } from '../../db/repositories';
import { exportService } from '../../services/exportService';
import { fileService } from '../../services/fileService';
import { toast } from '../../stores';

interface InvestigationCardProps {
  investigation: Investigation;
  onDelete: (id: string) => void;
  onRename: (id: string) => void;
}

export function InvestigationCard({
  investigation,
  onDelete,
  onRename,
}: InvestigationCardProps) {
  const { t, i18n } = useTranslation('pages');
  const navigate = useNavigate();
  const [stats, setStats] = useState({ elementCount: 0, linkCount: 0 });

  useEffect(() => {
    investigationRepository.getStats(investigation.id).then(setStats);
  }, [investigation.id]);

  const handleOpen = () => {
    navigate(`/investigation/${investigation.id}`);
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleExport = async () => {
    try {
      const elements = await elementRepository.getByInvestigation(investigation.id);
      const links = await linkRepository.getByInvestigation(investigation.id);
      const assets = await fileService.getAssetsByInvestigation(investigation.id);
      await exportService.exportInvestigation('zip', investigation, elements, links, assets);
      toast.success(t('home.card.exportSuccess'));
    } catch {
      toast.error(t('home.card.exportError'));
    }
  };

  return (
    <div
      onClick={handleOpen}
      data-testid={`investigation-card-${investigation.id}`}
      className="
        border border-border-default sketchy-border node-shadow
        hover:bg-bg-secondary hover:node-shadow-hover
        bg-bg-primary
        cursor-pointer
        transition-all
      "
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-text-primary truncate">
              {investigation.name}
            </h3>
            <p className="text-xs text-text-secondary mt-1">
              {t('home.card.modified', { time: formatRelativeTime(investigation.updatedAt, i18n.language) })} •{' '}
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
              <DropdownItem onClick={() => onRename(investigation.id)} data-testid="rename-action">
                <span className="flex items-center gap-2">
                  <Edit2 size={14} />
                  {t('home.card.rename')}
                </span>
              </DropdownItem>
              <DropdownItem onClick={handleExport} data-testid="export-action">
                <span className="flex items-center gap-2">
                  <Download size={14} />
                  {t('home.card.exportZip')}
                </span>
              </DropdownItem>
              <DropdownItem destructive onClick={() => onDelete(investigation.id)} data-testid="delete-action">
                <span className="flex items-center gap-2">
                  <Trash2 size={14} />
                  {t('home.card.delete')}
                </span>
              </DropdownItem>
            </DropdownMenu>
          </div>
        </div>
        {investigation.description && (
          <p className="text-xs text-text-tertiary mt-2 line-clamp-2">
            {investigation.description}
          </p>
        )}
      </div>
    </div>
  );
}
