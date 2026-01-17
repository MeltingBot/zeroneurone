import { useCallback, useState, useEffect } from 'react';
import { Upload, File, Image, FileText, X, Download, Eye } from 'lucide-react';
import { useInvestigationStore } from '../../stores';
import type { Element, Asset } from '../../types';
import { fileService } from '../../services/fileService';

interface AssetsPanelProps {
  element: Element;
}

export function AssetsPanel({ element }: AssetsPanelProps) {
  const { assets, addAsset, removeAsset } = useInvestigationStore();
  const [isDragging, setIsDragging] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Get assets for this element
  const elementAssets = assets.filter((a) => element.assetIds.includes(a.id));

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
          // If the file doesn't have a name (clipboard images), give it one
          if (!file.name || file.name === 'image.png') {
            const ext = file.type.split('/')[1] || 'png';
            const blob = file.slice(0, file.size, file.type);
            const namedFile = new window.File([blob], `pasted-${Date.now()}.${ext}`, { type: file.type });
            await addAsset(element.id, namedFile);
          } else {
            await addAsset(element.id, file);
          }
        }
      } catch (error) {
        console.error('Error pasting files:', error);
      } finally {
        setIsUploading(false);
      }
    },
    [element.id, addAsset]
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
        }
      } catch (error) {
        console.error('Error uploading files:', error);
      } finally {
        setIsUploading(false);
      }
    },
    [element.id, addAsset]
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
        }
      } catch (error) {
        console.error('Error uploading files:', error);
      } finally {
        setIsUploading(false);
      }

      // Reset input
      e.target.value = '';
    },
    [element.id, addAsset]
  );

  const handleRemove = useCallback(
    async (assetId: string) => {
      await removeAsset(element.id, assetId);
    },
    [element.id, removeAsset]
  );

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
          {elementAssets.map((asset) => (
            <AssetItem
              key={asset.id}
              asset={asset}
              onRemove={() => handleRemove(asset.id)}
              onDownload={() => handleDownload(asset)}
              onPreview={() => setPreviewAsset(asset)}
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
  onRemove: () => void;
  onDownload: () => void;
  onPreview: () => void;
}

function AssetItem({ asset, onRemove, onDownload, onPreview }: AssetItemProps) {
  const isImage = asset.mimeType.startsWith('image/');
  const isPdf = asset.mimeType === 'application/pdf';

  const Icon = isImage ? Image : isPdf ? FileText : File;

  return (
    <div className="flex items-center gap-2 p-2 bg-bg-secondary rounded border border-border-default group">
      {/* Thumbnail or icon */}
      <div className="w-10 h-10 flex-shrink-0 rounded bg-bg-tertiary flex items-center justify-center overflow-hidden">
        {asset.thumbnailDataUrl ? (
          <img
            src={asset.thumbnailDataUrl}
            alt={asset.filename}
            className="w-full h-full object-cover"
          />
        ) : (
          <Icon size={16} className="text-text-tertiary" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-text-primary truncate">
          {asset.filename}
        </p>
        <p className="text-xs text-text-tertiary">
          {formatFileSize(asset.size)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {(isImage || isPdf) && (
          <button
            onClick={onPreview}
            className="p-1 text-text-tertiary hover:text-text-primary"
            title="Aperçu"
          >
            <Eye size={14} />
          </button>
        )}
        <button
          onClick={onDownload}
          className="p-1 text-text-tertiary hover:text-text-primary"
          title="Télécharger"
        >
          <Download size={14} />
        </button>
        <button
          onClick={onRemove}
          className="p-1 text-text-tertiary hover:text-error"
          title="Supprimer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

interface AssetPreviewModalProps {
  asset: Asset;
  onClose: () => void;
}

function AssetPreviewModal({ asset, onClose }: AssetPreviewModalProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Load image from OPFS
  useState(() => {
    const loadImage = async () => {
      try {
        const url = await fileService.getAssetUrl(asset);
        setImageUrl(url);
      } catch (error) {
        console.error('Error loading image:', error);
      }
    };

    if (asset.mimeType.startsWith('image/')) {
      loadImage();
    }
  });

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-bg-primary rounded shadow-lg max-w-4xl max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border-default">
          <h3 className="text-sm font-medium text-text-primary">
            {asset.filename}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={asset.filename}
              className="max-w-full max-h-[70vh] object-contain"
            />
          ) : asset.thumbnailDataUrl ? (
            <img
              src={asset.thumbnailDataUrl}
              alt={asset.filename}
              className="max-w-full max-h-[70vh] object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 py-8 text-text-tertiary">
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
