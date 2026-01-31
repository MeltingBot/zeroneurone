import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useReactFlow } from '@xyflow/react';
import { X, Download } from 'lucide-react';
import { useUIStore } from '../../stores';

/**
 * Visual overlay shown when importing into existing investigation.
 * Shows preview rectangle and instructions - click handling is in Canvas.tsx.
 * Uses pointer-events: none to let clicks pass through to canvas.
 */
export function ImportPlacementOverlay() {
  const { t } = useTranslation('pages');
  const { getViewport } = useReactFlow();

  const importPlacementMode = useUIStore((state) => state.importPlacementMode);
  const importPlacementData = useUIStore((state) => state.importPlacementData);
  const exitImportPlacementMode = useUIStore((state) => state.exitImportPlacementMode);

  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Track mouse position for preview
  useEffect(() => {
    if (!importPlacementMode) return;

    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitImportPlacementMode();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [importPlacementMode, exitImportPlacementMode]);

  if (!importPlacementMode || !importPlacementData) return null;

  const { boundingBox } = importPlacementData;
  const viewport = getViewport();

  // Calculate preview rectangle size in screen coordinates
  const previewWidth = boundingBox.width * viewport.zoom;
  const previewHeight = boundingBox.height * viewport.zoom;

  return (
    <>
      {/* Preview rectangle following cursor */}
      <div
        className="fixed z-[101] pointer-events-none border-2 border-dashed border-accent bg-accent/10 rounded"
        style={{
          left: mousePosition.x,
          top: mousePosition.y,
          width: Math.max(previewWidth, 100),
          height: Math.max(previewHeight, 60),
        }}
      >
        {/* Element count badge */}
        <div className="absolute -top-6 left-0 px-2 py-0.5 bg-accent text-white text-xs rounded">
          {t('investigation.importPlacement.elements', { count: boundingBox.elementCount })}
        </div>
      </div>

      {/* Instructions bar - pointer-events: auto for cancel button */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[102] flex items-center gap-3 px-4 py-2 bg-bg-primary border border-border-default rounded-lg shadow-lg pointer-events-auto"
      >
        <Download size={16} className="text-accent" />
        <span className="text-sm text-text-primary">
          {t('investigation.importPlacement.instructions')}
        </span>
        <button
          onClick={exitImportPlacementMode}
          className="p-1 text-text-tertiary hover:text-text-primary rounded"
          title={t('investigation.importPlacement.cancel')}
        >
          <X size={16} />
        </button>
      </div>
    </>
  );
}
