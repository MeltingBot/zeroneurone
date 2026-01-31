import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Upload, AlertCircle } from 'lucide-react';
import { importService } from '../../services/importService';
import { useInvestigationStore, useUIStore } from '../../stores';

interface ImportIntoCurrentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Simplified import modal for importing a ZIP into the current investigation.
 * Only accepts ZIP files and always triggers placement mode.
 */
export function ImportIntoCurrentModal({ isOpen, onClose }: ImportIntoCurrentModalProps) {
  const { t } = useTranslation('modals');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { currentInvestigation } = useInvestigationStore();
  const enterImportPlacementMode = useUIStore((state) => state.enterImportPlacementMode);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentInvestigation) return;

    // Only accept ZIP files
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError(t('importIntoCurrent.zipOnly'));
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Parse the ZIP to get bounding box
      const parseResult = await importService.parseZipForPlacement(file);

      if (parseResult.success && parseResult.boundingBox.elementCount > 0) {
        // Enter placement mode
        enterImportPlacementMode({
          boundingBox: parseResult.boundingBox,
          file,
          investigationId: currentInvestigation.id,
          onComplete: () => {
            setError(null);
          }
        });
        // Close modal to show the canvas for placement
        onClose();
        return;
      } else if (!parseResult.success) {
        setError(parseResult.error || t('import.unknownError'));
      } else {
        // Empty ZIP
        setError(t('importIntoCurrent.emptyZip'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('import.unknownError'));
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [currentInvestigation, enterImportPlacementMode, onClose, t]);

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed z-[1000] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-bg-primary rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('importIntoCurrent.title')}
          </h2>
          <button
            onClick={handleClose}
            className="p-1 text-text-tertiary hover:text-text-primary rounded"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-xs text-text-secondary">
            {t('importIntoCurrent.description')}
          </p>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Import button */}
          <button
            onClick={triggerFileSelect}
            disabled={isProcessing}
            className="w-full flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed border-border-default hover:border-accent hover:bg-accent/5 transition-colors disabled:opacity-50"
          >
            <Upload size={32} className="text-text-tertiary" />
            <div className="text-center">
              <div className="text-sm font-medium text-text-primary">
                {isProcessing ? t('import.importing') : t('importIntoCurrent.selectZip')}
              </div>
              <div className="text-xs text-text-tertiary mt-1">
                {t('importIntoCurrent.zipFormat')}
              </div>
            </div>
          </button>

          {/* Error message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-red-600" />
                <span className="text-sm text-red-800">{error}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
