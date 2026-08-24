import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileWarning } from 'lucide-react';
import { ZoomControls } from './ZoomControls';
import { ZOOM_STEP, clampScale } from './zoom';

const CONTAINER_PADDING = 32;

interface ImagePreviewProps {
  url: string;
  alt: string;
}

/**
 * Image preview with the same zoom behaviour as the PDF one.
 *
 * An image used to render as a plain `max-w-full` tag: a scanned document or a
 * scene photograph could only ever be seen at whatever size the modal allowed.
 *
 * Callers pass `key={url}` so a new image remounts with fresh state, rather
 * than resetting it from an effect.
 */
export function ImagePreview({ url, alt }: ImagePreviewProps) {
  const { t } = useTranslation('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const handleLoad = (event: React.SyntheticEvent<HTMLImageElement>) => {
    const width = event.currentTarget.naturalWidth;
    setNaturalWidth(width);
    // Fit to width on open, never enlarging a small image beyond its own size.
    const available = (containerRef.current?.clientWidth ?? width) - CONTAINER_PADDING;
    setScale(clampScale(Math.min(1, available / width)));
  };

  const zoomOut = () => setScale((s) => clampScale((s ?? 1) - ZOOM_STEP));
  const zoomIn = () => setScale((s) => clampScale((s ?? 1) + ZOOM_STEP));

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-end gap-3 px-3 py-1.5 border-b border-border-default text-xs shrink-0">
        <ZoomControls scale={scale} onZoomIn={zoomIn} onZoomOut={zoomOut} />
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-bg-tertiary flex items-start justify-center p-4"
      >
        {error ? (
          <div className="flex flex-col items-center justify-center gap-2 text-text-tertiary py-8">
            <FileWarning size={32} />
            <span className="text-xs">{t('errors.generic')}</span>
          </div>
        ) : (
          <img
            src={url}
            alt={alt}
            onLoad={handleLoad}
            onError={() => setError(true)}
            data-testid="image-preview"
            // Width rather than transform: the container then scrolls around
            // the zoomed image instead of clipping it.
            style={
              naturalWidth !== null && scale !== null
                ? { width: Math.round(naturalWidth * scale), maxWidth: 'none' }
                : { maxWidth: '100%' }
            }
            className="bg-white"
          />
        )}
      </div>
    </div>
  );
}
