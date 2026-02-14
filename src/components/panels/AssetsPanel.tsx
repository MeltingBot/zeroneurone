import { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, File, Image, FileText, FileX2, X, Download, Eye, GripVertical, ScanText, ChevronDown, ChevronUp } from 'lucide-react';
import { useInvestigationStore } from '../../stores';
import { useUIStore } from '../../stores/uiStore';
import type { Element, Asset } from '../../types';
import { fileService } from '../../services/fileService';
import { metadataService } from '../../services/metadataService';

interface AssetsPanelProps {
  element: Element;
}

export function AssetsPanel({ element }: AssetsPanelProps) {
  useTranslation('panels'); // Load namespace for child components
  const { assets, addAsset, removeAsset, reorderAssets, clearAssetText, extractAssetText } = useInvestigationStore();
  const pushMetadataImport = useUIStore((s) => s.pushMetadataImport);
  const [isDragging, setIsDragging] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Drag-and-drop reordering state
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null);
  const [dragOverAssetId, setDragOverAssetId] = useState<string | null>(null);
  const dragCounter = useRef(0);

  // Get assets for this element, preserving order from assetIds
  const elementAssets = element.assetIds
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is Asset => a !== undefined);

  // Extract metadata from a file and queue for import if found
  const extractAndQueueMetadata = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        const metadata = await metadataService.extractMetadata(file, buffer);
        if (metadata && (metadata.properties.length > 0 || metadata.geo)) {
          pushMetadataImport({
            elementId: element.id,
            elementLabel: element.label,
            filename: file.name,
            metadata,
          });
        }
      } catch (error) {
        console.error('Metadata extraction failed:', error);
      }
    },
    [element.id, element.label, pushMetadataImport]
  );

  // Handle paste from clipboard
  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length === 0) return;

      // Prevent default paste behavior
      e.preventDefault();

      setIsUploading(true);
      try {
        for (const file of files) {
          let uploadedFile = file;
          // If the file doesn't have a name (clipboard images), give it one
          if (!file.name || file.name === 'image.png') {
            const ext = file.type.split('/')[1] || 'png';
            const blob = file.slice(0, file.size, file.type);
            uploadedFile = new window.File([blob], `pasted-${Date.now()}.${ext}`, { type: file.type });
          }
          await addAsset(element.id, uploadedFile);
          await extractAndQueueMetadata(uploadedFile);
        }
      } catch (error) {
        console.error('Error pasting files:', error);
      } finally {
        setIsUploading(false);
      }
    },
    [element.id, addAsset, extractAndQueueMetadata]
  );

  // Listen for paste events when this element is selected
  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      setIsUploading(true);
      try {
        for (const file of files) {
          await addAsset(element.id, file);
          await extractAndQueueMetadata(file);
        }
      } catch (error) {
        console.error('Error uploading files:', error);
      } finally {
        setIsUploading(false);
      }
    },
    [element.id, addAsset, extractAndQueueMetadata]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setIsUploading(true);
      try {
        for (const file of Array.from(files)) {
          await addAsset(element.id, file);
          await extractAndQueueMetadata(file);
        }
      } catch (error) {
        console.error('Error uploading files:', error);
      } finally {
        setIsUploading(false);
      }

      // Reset input
      e.target.value = '';
    },
    [element.id, addAsset, extractAndQueueMetadata]
  );

  const handleRemove = useCallback(
    async (assetId: string) => {
      await removeAsset(element.id, assetId);
    },
    [element.id, removeAsset]
  );

  const handleClearText = useCallback(
    async (assetId: string) => {
      await clearAssetText(assetId);
    },
    [clearAssetText]
  );

  const [extractingAssetId, setExtractingAssetId] = useState<string | null>(null);
  const handleExtractText = useCallback(
    async (assetId: string) => {
      setExtractingAssetId(assetId);
      try {
        await extractAssetText(assetId);
      } finally {
        setExtractingAssetId(null);
      }
    },
    [extractAssetText]
  );

  // Drag-and-drop reordering handlers
  const handleReorderDragStart = useCallback((assetId: string) => {
    setDraggingAssetId(assetId);
  }, []);

  const handleReorderDragEnter = useCallback((assetId: string) => {
    dragCounter.current++;
    if (assetId !== draggingAssetId) {
      setDragOverAssetId(assetId);
    }
  }, [draggingAssetId]);

  const handleReorderDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setDragOverAssetId(null);
    }
  }, []);

  const handleReorderDrop = useCallback(
    (targetAssetId: string) => {
      if (!draggingAssetId || draggingAssetId === targetAssetId) {
        setDraggingAssetId(null);
        setDragOverAssetId(null);
        dragCounter.current = 0;
        return;
      }

      // Reorder: move draggingAssetId to the position of targetAssetId
      const currentOrder = [...element.assetIds];
      const dragIndex = currentOrder.indexOf(draggingAssetId);
      const dropIndex = currentOrder.indexOf(targetAssetId);

      if (dragIndex !== -1 && dropIndex !== -1) {
        // Remove from old position
        currentOrder.splice(dragIndex, 1);
        // Insert at new position
        currentOrder.splice(dropIndex, 0, draggingAssetId);
        reorderAssets(element.id, currentOrder);
      }

      setDraggingAssetId(null);
      setDragOverAssetId(null);
      dragCounter.current = 0;
    },
    [draggingAssetId, element.id, element.assetIds, reorderAssets]
  );

  const handleReorderDragEnd = useCallback(() => {
    setDraggingAssetId(null);
    setDragOverAssetId(null);
    dragCounter.current = 0;
  }, []);

  const handleDownload = useCallback(async (asset: Asset) => {
    try {
      // Get file from OPFS using fileService (handles directory navigation)
      const file = await fileService.getAssetFile(asset);

      // Create download link
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = asset.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  }, []);

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          p-4 border-2 border-dashed rounded transition-colors
          ${isDragging
            ? 'border-accent bg-accent/5'
            : 'border-border-default hover:border-accent/50'
          }
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <Upload size={20} className="text-text-tertiary" />
          <p className="text-xs text-text-secondary">
            {isUploading
              ? 'Téléchargement...'
              : 'Glisser des fichiers ou Ctrl+V pour coller'
            }
          </p>
          <label className="text-xs text-accent hover:underline cursor-pointer">
            ou parcourir
            <input
              type="file"
              multiple
              onChange={handleFileInput}
              className="hidden"
              disabled={isUploading}
            />
          </label>
        </div>
      </div>

      {/* Assets list */}
      {elementAssets.length > 0 && (
        <div className="space-y-2">
          {elementAssets.map((asset, index) => (
            <AssetItem
              key={asset.id}
              asset={asset}
              index={index}
              onRemove={() => handleRemove(asset.id)}
              onClearText={asset.extractedText ? () => handleClearText(asset.id) : undefined}
              onExtractText={
                (asset.mimeType === 'application/pdf' || asset.mimeType.startsWith('text/'))
                  ? () => handleExtractText(asset.id)
                  : undefined
              }
              isExtracting={extractingAssetId === asset.id}
              onDownload={() => handleDownload(asset)}
              onPreview={() => setPreviewAsset(asset)}
              isDragging={draggingAssetId === asset.id}
              isDragOver={dragOverAssetId === asset.id}
              onDragStart={() => handleReorderDragStart(asset.id)}
              onDragEnter={() => handleReorderDragEnter(asset.id)}
              onDragLeave={handleReorderDragLeave}
              onDrop={() => handleReorderDrop(asset.id)}
              onDragEnd={handleReorderDragEnd}
            />
          ))}
        </div>
      )}

      {elementAssets.length === 0 && (
        <p className="text-xs text-text-tertiary text-center">
          Aucun fichier attaché
        </p>
      )}

      {/* Preview modal */}
      {previewAsset && (
        <AssetPreviewModal
          asset={previewAsset}
          onClose={() => setPreviewAsset(null)}
        />
      )}
    </div>
  );
}

interface AssetItemProps {
  asset: Asset;
  index: number;
  onRemove: () => void;
  onClearText?: () => void;
  onExtractText?: () => void;
  isExtracting: boolean;
  onDownload: () => void;
  onPreview: () => void;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function AssetItem({
  asset,
  index,
  onRemove,
  onClearText,
  onExtractText,
  isExtracting,
  onDownload,
  onPreview,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
}: AssetItemProps) {
  const { t } = useTranslation('common');
  const { t: tPanels } = useTranslation('panels');
  const [showText, setShowText] = useState(false);
  const isImage = asset.mimeType.startsWith('image/');
  const isPdf = asset.mimeType === 'application/pdf';
  const hasText = !!asset.extractedText;

  const Icon = isImage ? Image : isPdf ? FileText : File;

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', asset.id);
          onDragStart();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          onDragEnter();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
          e.preventDefault();
          onDrop();
        }}
        onDragEnd={onDragEnd}
        className={`
          flex items-center gap-2 p-2 bg-bg-secondary rounded border transition-all group cursor-grab active:cursor-grabbing
          ${isDragging ? 'opacity-50 border-accent' : 'border-border-default'}
          ${isDragOver ? 'border-accent bg-accent/5' : ''}
        `}
      >
        {/* Drag handle */}
        <div className="flex-shrink-0 text-text-tertiary hover:text-text-secondary">
          <GripVertical size={14} />
        </div>

        {/* Thumbnail or icon */}
        <div className="w-10 h-10 flex-shrink-0 rounded bg-bg-tertiary flex items-center justify-center overflow-hidden relative">
          {asset.thumbnailDataUrl ? (
            <img
              src={asset.thumbnailDataUrl}
              alt={asset.filename}
              className="w-full h-full object-cover"
            />
          ) : (
            <Icon size={16} className="text-text-tertiary" />
          )}
          {/* First asset indicator */}
          {index === 0 && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-accent rounded-full" title={tPanels('detail.files.defaultThumbnail')} />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-primary truncate">
            {asset.filename}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <span>{formatFileSize(asset.size)}</span>
            {hasText && (
              <button
                onClick={() => setShowText(!showText)}
                className="flex items-center gap-0.5 text-text-secondary hover:text-text-primary transition-colors"
                title={tPanels('detail.files.toggleText')}
              >
                <ScanText size={11} />
                <span>{formatCharCount(asset.extractedText!.length)}</span>
                {showText ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
            )}
            {isExtracting && (
              <span className="flex items-center gap-1 text-accent">
                <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {(isImage || isPdf) && (
            <button
              onClick={onPreview}
              className="p-1 text-text-tertiary hover:text-text-primary"
              title={tPanels('detail.files.preview')}
            >
              <Eye size={14} />
            </button>
          )}
          <button
            onClick={onDownload}
            className="p-1 text-text-tertiary hover:text-text-primary"
            title={t('actions.download')}
          >
            <Download size={14} />
          </button>
          {onExtractText && !isExtracting && (
            <button
              onClick={onExtractText}
              className="p-1 text-text-tertiary hover:text-accent"
              title={hasText ? tPanels('detail.files.reExtractText') : tPanels('detail.files.extractText')}
            >
              <ScanText size={14} />
            </button>
          )}
          {onClearText && (
            <button
              onClick={onClearText}
              className="p-1 text-text-tertiary hover:text-warning"
              title={tPanels('detail.files.clearText')}
            >
              <FileX2 size={14} />
            </button>
          )}
          <button
            onClick={onRemove}
            className="p-1 text-text-tertiary hover:text-error"
            title={t('actions.delete')}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Extracted text preview */}
      {showText && hasText && (
        <div className="mt-1 ml-7 px-2 py-1.5 bg-bg-tertiary rounded text-xs text-text-secondary max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
          {asset.extractedText!.length > 2000
            ? asset.extractedText!.substring(0, 2000) + '...'
            : asset.extractedText}
        </div>
      )}
    </div>
  );
}

interface AssetPreviewModalProps {
  asset: Asset;
  onClose: () => void;
}

function AssetPreviewModal({ asset, onClose }: AssetPreviewModalProps) {
  const { t: tCommon } = useTranslation('common');
  const { t: tPanels } = useTranslation('panels');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isImage = asset.mimeType.startsWith('image/');
  const isPdf = asset.mimeType === 'application/pdf';

  // Load file from OPFS
  useEffect(() => {
    let mounted = true;
    let url: string | null = null;

    const loadFile = async () => {
      try {
        setIsLoading(true);
        url = await fileService.getAssetUrl(asset);
        if (mounted) {
          setFileUrl(url);
        }
      } catch (error) {
        console.error('Error loading file:', error);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    if (isImage || isPdf) {
      loadFile();
    } else {
      setIsLoading(false);
    }

    return () => {
      mounted = false;
      // Revoke object URL to free memory
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [asset, isImage, isPdf]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className={`bg-bg-primary rounded shadow-lg ${
          isPdf ? 'w-[90vw] h-[90vh] flex flex-col' : 'max-w-[90vw] max-h-[90vh] flex flex-col'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border-default flex-shrink-0">
          <h3 className="text-sm font-medium text-text-primary truncate pr-4">
            {asset.filename}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary flex-shrink-0"
            title={tPanels('detail.files.closeEsc')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className={isPdf ? 'flex-1 min-h-0 overflow-hidden' : 'overflow-auto'}>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-text-secondary">{tCommon('status.loading')}</span>
              </div>
            </div>
          ) : isPdf && fileUrl ? (
            /* PDF Viewer using iframe with browser's native PDF viewer */
            <iframe
              src={fileUrl}
              className="w-full h-full border-0"
              title={asset.filename}
            />
          ) : isImage && fileUrl ? (
            <div className="p-4 text-center">
              <img
                src={fileUrl}
                alt={asset.filename}
                className="max-w-full inline-block"
              />
            </div>
          ) : asset.thumbnailDataUrl ? (
            <div className="p-4 text-center">
              <img
                src={asset.thumbnailDataUrl}
                alt={asset.filename}
                className="max-w-full inline-block"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-4 py-8 text-text-tertiary">
              <FileText size={48} />
              <p className="text-sm">Aperçu non disponible</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatCharCount(count: number): string {
  if (count < 1000) return `${count}c`;
  return `${(count / 1000).toFixed(1)}k`;
}
