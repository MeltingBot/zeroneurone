// ─── FEC import options ──────────────────────────────────────
//
// Shared options step for the FEC import (new-dossier modal and
// import-into-current modal). The file is parsed once (FECAggregate);
// every option change re-runs the pure filter pipeline for an instant
// element/link count preview.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  previewFECGraph,
  type FECAggregate,
  type FECImportOptions,
  type FECFamily,
} from '../../services/importFEC';

interface FECOptionsPanelProps {
  fileName: string;
  aggregate: FECAggregate;
  options: FECImportOptions;
  onChange: (options: FECImportOptions) => void;
}

const FAMILY_ORDER: FECFamily[] = [
  'clients',
  'suppliers',
  'otherThirdParties',
  'banks',
  'expenses',
  'revenues',
  'others',
];

function toInputDate(d: Date | null): string {
  if (!d) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function fromInputDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

export function FECOptionsPanel({ fileName, aggregate, options, onChange }: FECOptionsPanelProps) {
  const { t, i18n } = useTranslation('modals');

  const preview = useMemo(() => previewFECGraph(aggregate, options), [aggregate, options]);

  const formatDate = (d: Date | null) =>
    d ? d.toLocaleDateString(i18n.language) : '—';

  return (
    <div className="p-3 border border-border-default rounded bg-bg-secondary space-y-3">
      {/* Résumé du fichier */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-text-primary font-mono truncate">{fileName}</p>
        <p className="text-xs text-text-secondary">
          {t('import.fec.summary', {
            lines: aggregate.lineCount.toLocaleString(i18n.language),
            entries: aggregate.entryCount.toLocaleString(i18n.language),
            aux: aggregate.auxCount.toLocaleString(i18n.language),
            from: formatDate(aggregate.dateMin),
            to: formatDate(aggregate.dateMax),
          })}
        </p>
        {aggregate.unbalancedCount > 0 && (
          <p className="text-xs text-warning">
            {t('import.fec.unbalancedWarning', { count: aggregate.unbalancedCount })}
          </p>
        )}
      </div>

      {/* Plafond + seuil */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {t('import.fec.topN')}
          </label>
          <input
            type="number"
            min={1}
            value={options.topN}
            onChange={(e) => onChange({ ...options, topN: Math.max(1, Number(e.target.value) || 1) })}
            className="w-full px-2 py-1.5 text-sm rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {t('import.fec.minAmount')}
          </label>
          <input
            type="number"
            min={0}
            step={100}
            value={options.minLinkAmount}
            onChange={(e) =>
              onChange({ ...options, minLinkAmount: Math.max(0, Number(e.target.value) || 0) })
            }
            className="w-full px-2 py-1.5 text-sm rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Période */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {t('import.fec.dateFrom')}
          </label>
          <input
            type="date"
            value={toInputDate(options.dateFrom ?? aggregate.dateMin)}
            onChange={(e) => onChange({ ...options, dateFrom: fromInputDate(e.target.value) })}
            className="w-full px-2 py-1.5 text-sm rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            {t('import.fec.dateTo')}
          </label>
          <input
            type="date"
            value={toInputDate(options.dateTo ?? aggregate.dateMax)}
            onChange={(e) => onChange({ ...options, dateTo: fromInputDate(e.target.value) })}
            className="w-full px-2 py-1.5 text-sm rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Familles */}
      <div>
        <span className="block text-xs font-medium text-text-secondary mb-1">
          {t('import.fec.familiesTitle')}
        </span>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {FAMILY_ORDER.map((family) => (
            <label key={family} className="flex items-center gap-2 text-xs text-text-primary">
              <input
                type="checkbox"
                checked={options.families[family]}
                onChange={(e) =>
                  onChange({
                    ...options,
                    families: { ...options.families, [family]: e.target.checked },
                  })
                }
              />
              {t(`import.fec.families.${family}`)}
            </label>
          ))}
        </div>
      </div>

      {/* Flux techniques */}
      <label className="flex items-center gap-2 text-xs text-text-primary">
        <input
          type="checkbox"
          checked={options.includeGenToGen}
          onChange={(e) => onChange({ ...options, includeGenToGen: e.target.checked })}
        />
        {t('import.fec.includeGenToGen')}
      </label>

      {/* Aperçu */}
      <div className="pt-2 border-t border-border-default">
        <p className="text-xs font-medium text-text-primary">
          {t('import.fec.preview', {
            elements: preview.elementCount.toLocaleString(i18n.language),
            links: preview.linkCount.toLocaleString(i18n.language),
          })}
        </p>
        {preview.cappedAux > 0 && (
          <p className="text-xs text-text-tertiary">
            {t('import.fec.capped', { count: preview.cappedAux })}
          </p>
        )}
        <p className="text-xs text-text-tertiary mt-1">{t('import.fec.flowConvention')}</p>
      </div>
    </div>
  );
}
