import { useTranslation } from 'react-i18next';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { MIN_SCALE, MAX_SCALE } from './zoom';

interface ZoomControlsProps {
  /** null while the initial fit-to-width scale is still being computed. */
  scale: number | null;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export function ZoomControls({ scale, onZoomIn, onZoomOut }: ZoomControlsProps) {
  const { t } = useTranslation('common');

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onZoomOut}
        disabled={scale === null || scale <= MIN_SCALE}
        className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-tertiary"
        title={t('actions.zoomOut')}
        aria-label={t('actions.zoomOut')}
      >
        <ZoomOut size={14} />
      </button>
      <span className="text-text-secondary tabular-nums w-10 text-center">
        {scale !== null ? `${Math.round(scale * 100)}%` : '—'}
      </span>
      <button
        onClick={onZoomIn}
        disabled={scale === null || scale >= MAX_SCALE}
        className="p-1 text-text-tertiary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-tertiary"
        title={t('actions.zoomIn')}
        aria-label={t('actions.zoomIn')}
      >
        <ZoomIn size={14} />
      </button>
    </div>
  );
}
