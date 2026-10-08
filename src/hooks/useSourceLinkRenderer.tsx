/**
 * Clickable rendering of the links of a Source field, shared by the detail
 * panel (SourceField) and the matrix cells: web links open in a new tab,
 * attached documents in the preview, plugin schemes through their plugin.
 * A missing target or a failing plugin only greys its own link out.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDossierStore } from '../stores';
import type { Asset } from '../types';
import { AssetPreviewModal } from '../components/modals/AssetPreviewModal';
import {
  assetHashOf,
  findAssetByHash,
  isWebScheme,
  targetValue,
  type SourceSegment,
} from '../utils/sourceLinks';
import { useSourceSchemes } from '../plugins/sourceSchemes';

export function useSourceLinkRenderer() {
  const { t } = useTranslation('panels');
  const assets = useDossierStore((s) => s.assets);
  const dossierId = useDossierStore((s) => s.currentDossier?.id ?? '');
  const pluginSchemes = useSourceSchemes();
  const schemeNames = useMemo(() => new Set(pluginSchemes.keys()), [pluginSchemes]);
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null);

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
        onDoubleClick={(e) => e.stopPropagation()}
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
        console.warn(`[SourceLinks] resolve failed for scheme "${seg.scheme}"`, err);
      }
      if (!ext || !found) return missing(t('detail.labels.sourceTargetMissing'));
      return linkButton(seg.target, () => {
        Promise.resolve()
          .then(() => ext.open(linkValue, ctx))
          .catch((err) => console.warn(`[SourceLinks] open failed for scheme "${seg.scheme}"`, err));
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
        onDoubleClick={(e) => e.stopPropagation()}
        title={seg.target}
        className="text-accent hover:underline"
      >
        {seg.label}
      </a>
    );
  };

  const preview = previewAsset ? (
    <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
  ) : null;

  return { schemeNames, renderSegment, preview };
}
