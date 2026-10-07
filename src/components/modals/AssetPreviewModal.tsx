import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, X } from 'lucide-react';
import type { Asset } from '../../types';
import { fileService } from '../../services/fileService';
import { PdfPreview } from '../common/PdfPreview';
import { ImagePreview } from '../common/ImagePreview';

interface AssetPreviewModalProps {
  asset: Asset;
  onClose: () => void;
}

export function AssetPreviewModal({ asset, onClose }: AssetPreviewModalProps) {
  const { t: tCommon } = useTranslation('common');
  const { t: tPanels } = useTranslation('panels');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isImage = asset.mimeType.startsWith('image/');
  const isPdf = asset.mimeType === 'application/pdf';
  const isEml = asset.mimeType === 'message/rfc822' || /\.eml$/i.test(asset.filename);
  const isText = !isEml && (asset.mimeType.startsWith('text/') || /\.(md|mdx|json|xml|csv|yaml|yml|toml|ini|conf|log)$/i.test(asset.filename));
  const isDoc = /\.(docx|odt)$/i.test(asset.filename);
  const hasPreview = isImage || isPdf || isText || isDoc || isEml;

  // Load file from OPFS
  useEffect(() => {
    let mounted = true;
    let url: string | null = null;

    const loadFile = async () => {
      try {
        setIsLoading(true);
        if (isText) {
          const file = await fileService.getAssetFile(asset);
          const text = await file.text();
          if (mounted) setTextContent(text);
        } else if (isEml) {
          const file = await fileService.getAssetFile(asset);
          const { parseEml, readFileAsLatin1 } = await import('../../services/emlParser');
          const rawLatin1 = await readFileAsLatin1(await file.arrayBuffer());
          if (mounted) setRawContent(rawLatin1);
          const eml = parseEml(rawLatin1);
          let body = eml.textBody;
          if (!body && eml.htmlBody) {
            const doc = new DOMParser().parseFromString(eml.htmlBody, 'text/html');
            body = doc.body?.textContent?.trim() || null;
          }
          const headerLines = [
            eml.from && `${tPanels('detail.files.emlFrom')} : ${eml.from}`,
            eml.to && `${tPanels('detail.files.emlTo')} : ${eml.to}`,
            eml.cc && `${tPanels('detail.files.emlCc')} : ${eml.cc}`,
            eml.date && `${tPanels('detail.files.emlDate')} : ${eml.date.toLocaleString()}`,
            eml.subject && `${tPanels('detail.files.emlSubject')} : ${eml.subject}`,
            eml.attachments.length > 0 &&
              `${tPanels('detail.files.emlAttachments')} : ${eml.attachments.map((a) => a.filename).join(', ')}`,
          ].filter(Boolean) as string[];
          const preview = [headerLines.join('\n'), body ?? ''].filter(Boolean).join('\n\n' + '─'.repeat(40) + '\n\n');
          if (mounted) setTextContent(preview || null);
        } else if (isDoc) {
          // Use extractedText if available, otherwise show notice
          if (mounted) setTextContent(asset.extractedText || null);
        } else if (isPdf) {
          const file = await fileService.getAssetFile(asset);
          if (mounted) setPdfFile(file);
        } else {
          url = await fileService.getAssetUrl(asset);
          if (mounted) setFileUrl(url);
        }
      } catch (error) {
        console.error('Error loading file:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    if (hasPreview) {
      loadFile();
    } else {
      setIsLoading(false);
    }

    return () => {
      mounted = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [asset, isImage, isPdf, isText, isDoc, isEml, hasPreview]);

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
          isPdf || isText || isDoc || isEml || isImage ? 'w-[90vw] h-[90vh] flex flex-col' : 'max-w-[90vw] max-h-[90vh] flex flex-col'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border-default flex-shrink-0">
          <h3 className="text-sm font-medium text-text-primary truncate pr-4">
            {asset.filename}
          </h3>
          <div className="flex items-center gap-1 flex-shrink-0">
          {isEml && rawContent !== null && (
            <button
              onClick={() => setShowRaw((v) => !v)}
              className={`px-2 py-1 text-xs rounded border ${
                showRaw
                  ? 'border-accent text-accent bg-accent-light'
                  : 'border-border-default text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
              }`}
              title={showRaw ? tPanels('detail.files.emlFormatted') : tPanels('detail.files.emlRaw')}
            >
              {showRaw ? tPanels('detail.files.emlFormatted') : tPanels('detail.files.emlRaw')}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 text-text-tertiary hover:text-text-primary flex-shrink-0"
            title={tPanels('detail.files.closeEsc')}
          >
            <X size={16} />
          </button>
          </div>
        </div>

        {/* Content */}
        <div className={isPdf || isText || isDoc || isEml || isImage ? 'flex-1 min-h-0 overflow-hidden' : 'overflow-auto'}>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-text-secondary">{tCommon('status.loading')}</span>
              </div>
            </div>
          ) : isPdf && pdfFile ? (
            <PdfPreview file={pdfFile} />
          ) : (isText || isDoc || isEml) && textContent !== null ? (
            <pre className="w-full h-full overflow-auto p-4 text-xs text-text-primary font-mono whitespace-pre-wrap leading-relaxed">
              {isEml && showRaw && rawContent !== null ? rawContent : textContent}
            </pre>
          ) : isDoc && textContent === null ? (
            <div className="flex flex-col items-center justify-center gap-4 py-8 text-text-tertiary">
              <FileText size={48} />
              <p className="text-sm">Extraire le texte pour afficher l'apercu</p>
            </div>
          ) : isImage && fileUrl ? (
            <ImagePreview key={fileUrl} url={fileUrl} alt={asset.filename} />
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

