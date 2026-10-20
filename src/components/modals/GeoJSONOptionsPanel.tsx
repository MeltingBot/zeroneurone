// ─── GeoJSON import options ──────────────────────────────────
//
// Shared options step for the GeoJSON import (new-dossier modal and
// import-into-current modal): the property used as label, the tag given
// to every element, and the properties kept on the elements.

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { TagCombobox } from './TagCombobox';

export interface PendingGeoJSON {
  fileName: string;
  content: string;
  featureCount: number;
  fields: Array<{ key: string; sample: string }>;
}

interface GeoJSONOptionsPanelProps {
  pending: PendingGeoJSON;
  labelField: string;
  onLabelFieldChange: (key: string) => void;
  fields: Set<string>;
  onFieldsChange: (fields: Set<string>) => void;
  /** Tag given to every imported feature (empty: none) */
  tag: string;
  onTagChange: (tag: string) => void;
}

export function GeoJSONOptionsPanel({ pending, labelField, onLabelFieldChange, fields, onFieldsChange, tag, onTagChange }: GeoJSONOptionsPanelProps) {
  const { t } = useTranslation('modals');
  const labelId = useId();

  const toggleField = (key: string) => {
    const next = new Set(fields);
    if (next.has(key)) next.delete(key); else next.add(key);
    onFieldsChange(next);
  };

  return (
    <>
      <p className="text-xs text-text-tertiary">
        <span className="font-mono">{pending.fileName}</span>
        {' · '}
        {t('import.geojson.featureCount', { count: pending.featureCount })}
      </p>
      <div>
        <label htmlFor={labelId} className="block text-xs font-medium text-text-primary mb-1">
          {t('import.geojson.labelField')}
        </label>
        <select
          id={labelId}
          value={labelField}
          onChange={(e) => onLabelFieldChange(e.target.value)}
          data-testid="geojson-label-field"
          className="w-full px-2 py-1.5 text-sm rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
        >
          {pending.fields.map((field) => (
            <option key={field.key} value={field.key}>
              {field.key} — {field.sample.length > 40 ? `${field.sample.slice(0, 40)}…` : field.sample}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="block text-xs font-medium text-text-primary mb-1">{t('importJsonMapping.tag')}</span>
        <TagCombobox
          value={tag}
          onChange={onTagChange}
          placeholder={t('importJsonMapping.tagPlaceholder')}
          aria-label={t('importJsonMapping.tag')}
          className="w-full px-2 py-1.5 text-sm rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
        />
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-text-primary">{t('import.geojson.fields')}</span>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => onFieldsChange(new Set(pending.fields.map((f) => f.key)))}
              className="text-text-secondary hover:text-text-primary"
            >
              {t('import.geojson.all')}
            </button>
            <button
              type="button"
              onClick={() => onFieldsChange(new Set())}
              className="text-text-secondary hover:text-text-primary"
            >
              {t('import.geojson.none')}
            </button>
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto border border-border-default rounded divide-y divide-border-default" data-testid="geojson-fields">
          {pending.fields.filter((field) => field.key !== labelField).map((field) => (
            <label key={field.key} className="flex items-center gap-2 px-2 py-1 text-xs cursor-pointer hover:bg-bg-secondary">
              <input
                type="checkbox"
                checked={fields.has(field.key)}
                onChange={() => toggleField(field.key)}
                className="rounded border-border-default"
              />
              <span className="font-mono text-text-primary shrink-0">{field.key}</span>
              <span className="text-text-tertiary truncate">{field.sample}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
