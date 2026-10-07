/**
 * Source field: shows the Markdown links of a source as links, edits the raw
 * text. See utils/sourceLinks for the accepted syntax.
 *
 * - no link in the text, or the whole field is one URL → the plain input, as
 *   before (with its "open" button for the URL)
 * - links → a read view, one source per line, the first
 *   three until expanded; a click outside a link (or focus) switches to the
 *   raw input, leaving it switches back
 *
 * Plugin schemes (slot `source:scheme`) are resolved and opened by their
 * plugin; a failing plugin only greys its own links out.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { useDossierStore } from '../../stores';
import type { Asset } from '../../types';
import { AssetPreviewModal } from '../modals/AssetPreviewModal';
import {
  assetHashOf,
  findAssetByHash,
  isWebScheme,
  parseSourceLinks,
  sourceToPlainText,
  splitSourceItems,
  targetValue,
  type SourceSegment,
} from '../../utils/sourceLinks';
import { useSourceSchemes } from '../../plugins/sourceSchemes';
import { isUrl, toUrl } from '../../utils';

/** Sources shown before "+N more" */
const MAX_COLLAPSED = 3;

interface SourceFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Classes of the input; the read view reuses them so both look alike */
  className: string;
}

export function SourceField({ value, onChange, onBlur, placeholder, className }: SourceFieldProps) {
  const { t } = useTranslation('panels');
  const assets = useDossierStore((s) => s.assets);
  const dossierId = useDossierStore((s) => s.currentDossier?.id ?? '');
  const pluginSchemes = useSourceSchemes();
  const schemeNames = useMemo(() => new Set(pluginSchemes.keys()), [pluginSchemes]);
  const [editing, setEditing] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const segments = useMemo(() => parseSourceLinks(value, schemeNames), [value, schemeNames]);
  const hasLinks = segments.some((s) => s.kind === 'link');
  // Several sources: one per line, the first ones only until expanded
  const items = useMemo(() => splitSourceItems(segments), [segments]);
  const [expanded, setExpanded] = useState(false);
  // The whole field is one URL: plain input with its open button, as before
  const singleUrl = isUrl(value) && !/\s/.test(value.trim());
  const showInput = editing || !hasLinks || singleUrl;
  const urlButton = showInput && singleUrl;

  useEffect(() => {
    const el = inputRef.current;
    if (!editing || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  // The raw text wraps: grow the field with its content
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const cs = getComputedStyle(el);
    el.style.height = `${el.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)}px`;
  }, [value, showInput]);

  const renderSegment = (seg: SourceSegment, i: number) => {
    if (seg.kind === 'text') return <span key={i}>{seg.text}</span>;
    const missing = (title: string) => (
      <span key={i} className="text-text-tertiary" title={title}>
        {seg.label}
      </span>
    );
    const linkButton = (title: string, onOpen: () => void) => (
      <button
        key={i}
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        title={title}
        className="text-accent hover:underline"
      >
        {seg.label}
      </button>
    );
    if (seg.scheme === 'asset') {
      const asset = findAssetByHash(assets, assetHashOf(seg.target));
      if (!asset) return missing(t('detail.labels.sourceDocumentMissing'));
      return linkButton(asset.filename, () => setPreviewAsset(asset));
    }
    if (!isWebScheme(seg.scheme)) {
      const ext = pluginSchemes.get(seg.scheme);
      const linkValue = targetValue(seg.target);
      const ctx = { dossierId };
      let found = false;
      try {
        found = !!ext?.resolve(linkValue, ctx);
      } catch (err) {
        console.warn(`[SourceField] resolve failed for scheme "${seg.scheme}"`, err);
      }
      if (!ext || !found) return missing(t('detail.labels.sourceTargetMissing'));
      return linkButton(seg.target, () => {
        Promise.resolve()
          .then(() => ext.open(linkValue, ctx))
          .catch((err) => console.warn(`[SourceField] open failed for scheme "${seg.scheme}"`, err));
      });
    }
    return (
      <a
        key={i}
        href={seg.target}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        title={seg.target}
        className="text-accent hover:underline"
      >
        {seg.label}
      </a>
    );
  };

  return (
    <div className="relative">
      {showInput ? (
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          // One source per line
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onBlur?.();
          }}
          placeholder={placeholder}
          className={`${className} block resize-none overflow-hidden ${urlButton ? 'pr-9' : ''}`}
        />
      ) : (
        <div
          role="textbox"
          tabIndex={0}
          aria-readonly="false"
          onClick={() => setEditing(true)}
          onFocus={(e) => {
            if (e.target === e.currentTarget) setEditing(true);
          }}
          title={sourceToPlainText(value, schemeNames)}
          className={`${className} cursor-text`}
        >
          {items.length <= 1 ? (
            <div className="truncate">{segments.map(renderSegment)}</div>
          ) : (
            <>
              {(expanded ? items : items.slice(0, MAX_COLLAPSED)).map((item, i) => (
                <div key={i} className="truncate">{item.map(renderSegment)}</div>
              ))}
              {items.length > MAX_COLLAPSED && (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((v) => !v);
                  }}
                  className="text-text-tertiary hover:text-text-secondary"
                >
                  {expanded
                    ? t('detail.labels.sourceShowLess')
                    : t('detail.labels.sourceShowMore', { count: items.length - MAX_COLLAPSED })}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {urlButton && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => window.open(toUrl(value), '_blank', 'noopener,noreferrer')}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-tertiary hover:text-accent transition-colors"
          title={t('detail.labels.openInNewTab')}
        >
          <ExternalLink size={14} />
        </button>
      )}
      {previewAsset && (
        <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
      )}
    </div>
  );
}
