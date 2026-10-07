import { useState, useMemo, useRef, useId, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { X } from 'lucide-react';
import { useUIStore, type MetadataImportItem } from '../../stores/uiStore';
import { useDossierStore } from '../../stores';
import type { Property, Element } from '../../types';
import { useDialogA11y } from '../../hooks/useDialogA11y';

function formatPropertyValue(prop: Property, t: TFunction): string {
  if (prop.value == null) return '';
  if (prop.value instanceof Date) {
    return prop.value.toLocaleDateString() + ' ' + prop.value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (typeof prop.value === 'boolean') {
    return prop.value ? t('metadataImport.yes') : t('metadataImport.no');
  }
  return String(prop.value);
}

/** Choice made once for the rest of a batch of files */
interface BatchChoice {
  action: 'import' | 'ignore';
  /** null = every key, including keys the first file did not have */
  keys: Set<string> | null;
  geo: boolean;
}

/** Writes the chosen metadata of a file into its element */
async function applyMetadata(item: MetadataImportItem, keys: Set<string> | null, geo: boolean): Promise<void> {
  const { elements, updateElement } = useDossierStore.getState();
  const element = elements.find((e) => e.id === item.elementId);
  if (!element) return;

  const { metadata } = item;
  const selectedProperties = metadata.properties.filter((p) => !keys || keys.has(p.key));
  const withGeo = geo && !!metadata.geo;
  if (selectedProperties.length === 0 && !withGeo) return;

  // Merge properties: overwrite existing keys, add new ones
  const existingMap = new Map(element.properties.map((p) => [p.key, p]));
  for (const prop of selectedProperties) {
    existingMap.set(prop.key, prop);
  }
  const changes: Partial<Element> = {
    properties: Array.from(existingMap.values()),
  };
  if (withGeo && metadata.geo) {
    changes.geo = { type: 'point', lat: metadata.geo.lat, lng: metadata.geo.lng };
  }
  await updateElement(item.elementId, changes);
}

export function MetadataImportModal() {
  const { t } = useTranslation('modals');
  const queue = useUIStore((s) => s.metadataImportQueue);
  const shiftMetadataImport = useUIStore((s) => s.shiftMetadataImport);

  const current = queue[0];

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [geoSelected, setGeoSelected] = useState(false);
  const [applyToBatch, setApplyToBatch] = useState(false);
  const [initialized, setInitialized] = useState<string | null>(null);

  // Choices made for a whole batch, by batch id. Files of that batch are then
  // handled without showing the modal, including those still loading.
  const [batchChoices, setBatchChoices] = useState<ReadonlyMap<string, BatchChoice>>(new Map());
  const handledItems = useRef(new WeakSet<MetadataImportItem>());
  const batchChoice = current?.batch ? batchChoices.get(current.batch.id) : undefined;

  useEffect(() => {
    if (!current || !batchChoice || handledItems.current.has(current)) return;
    handledItems.current.add(current);
    const run = batchChoice.action === 'import'
      ? applyMetadata(current, batchChoice.keys, batchChoice.geo)
      : Promise.resolve();
    run
      .catch((err) => console.error('Metadata import failed:', err))
      .finally(() => shiftMetadataImport());
  }, [current, batchChoice, shiftMetadataImport]);

  // Initialize selections when a new item appears
  const itemId = current
    ? `${current.elementId}-${current.filename}`
    : null;

  if (itemId && initialized !== itemId) {
    const allKeys = new Set(current!.metadata.properties.map((p) => p.key));
    setSelectedKeys(allKeys);
    setGeoSelected(!!current!.metadata.geo);
    setApplyToBatch(false);
    setInitialized(itemId);
  }

  const allSelected = useMemo(() => {
    if (!current) return false;
    const allProps = current.metadata.properties.length === selectedKeys.size;
    const allGeo = !current.metadata.geo || geoSelected;
    return allProps && allGeo;
  }, [current, selectedKeys, geoSelected]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Appele inconditionnellement : les hooks doivent preceder tout return.
  // Echap revient a ignorer l'element courant de la file.
  useDialogA11y(Boolean(current && !batchChoice), dialogRef, shiftMetadataImport);

  if (!current || batchChoice) return null;

  const { metadata, elementLabel, filename, batch } = current;
  // Other files of the same import may still come: offer to reuse this choice
  const canApplyToBatch = !!batch && batch.index < batch.size - 1;

  const rememberBatchChoice = (action: BatchChoice['action']) => {
    if (!applyToBatch || !batch) return;
    // The current file is handled here, not by the batch effect
    handledItems.current.add(current);
    const choice: BatchChoice = {
      action,
      keys: allSelected ? null : new Set(selectedKeys),
      geo: allSelected || geoSelected,
    };
    setBatchChoices((prev) => new Map(prev).set(batch.id, choice));
  };

  const handleToggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedKeys(new Set());
      setGeoSelected(false);
    } else {
      setSelectedKeys(new Set(metadata.properties.map((p) => p.key)));
      if (metadata.geo) setGeoSelected(true);
    }
  };

  const handleIgnore = () => {
    rememberBatchChoice('ignore');
    shiftMetadataImport();
  };

  const handleImport = async () => {
    rememberBatchChoice('import');
    try {
      await applyMetadata(current, selectedKeys, geoSelected);
    } catch (err) {
      console.error('Metadata import failed:', err);
    }
    shiftMetadataImport();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleIgnore}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-bg-primary rounded shadow-lg w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-default">
          <div className="min-w-0">
            <h3 id={titleId} className="text-sm font-semibold text-text-primary">
              {t('metadataImport.detected')}
            </h3>
            <p className="text-xs text-text-secondary mt-0.5 truncate">
              {filename} &rarr; {elementLabel}
            </p>
          </div>
          <button
            onClick={handleIgnore}
            aria-label={t('common:actions.close')}
            title={t('common:actions.close')}
            className="p-1 text-text-tertiary hover:text-text-primary flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Toggle all */}
        <div className="px-4 py-2 border-b border-border-default">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-text-secondary hover:text-text-primary">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleToggleAll}
              className="rounded border-border-default"
            />
            {t('common:actions.selectAll')}
          </label>
        </div>

        {/* Properties list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {metadata.properties.map((prop) => (
            <label
              key={prop.key}
              className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-bg-secondary"
            >
              <input
                type="checkbox"
                checked={selectedKeys.has(prop.key)}
                onChange={() => handleToggleKey(prop.key)}
                className="rounded border-border-default flex-shrink-0"
              />
              <span className="text-xs font-medium text-text-primary flex-shrink-0">
                {prop.key}
              </span>
              {prop.type && prop.type !== 'text' && (
                <span className="text-[10px] text-text-tertiary bg-bg-tertiary px-1 rounded flex-shrink-0 lowercase">
                  {t(`common:propertyTypes.${prop.type}`, { defaultValue: prop.type })}
                </span>
              )}
              <span className="text-xs text-text-secondary truncate">
                {formatPropertyValue(prop, t)}
              </span>
            </label>
          ))}

          {/* GPS checkbox */}
          {metadata.geo && (
            <label className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-bg-secondary border-t border-border-default mt-2 pt-3">
              <input
                type="checkbox"
                checked={geoSelected}
                onChange={() => setGeoSelected(!geoSelected)}
                className="rounded border-border-default flex-shrink-0"
              />
              <span className="text-xs font-medium text-text-primary">
                {t('metadataImport.gps')}
              </span>
              <span className="text-xs text-text-secondary">
                {metadata.geo.lat.toFixed(5)}, {metadata.geo.lng.toFixed(5)}
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border-default">
          {canApplyToBatch && (
            <label className="mr-auto flex items-center gap-2 cursor-pointer text-xs text-text-secondary hover:text-text-primary">
              <input
                type="checkbox"
                checked={applyToBatch}
                onChange={(e) => setApplyToBatch(e.target.checked)}
                className="rounded border-border-default"
              />
              {t('metadataImport.applyToBatch')}
            </label>
          )}
          <button
            onClick={handleIgnore}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary border border-border-default rounded"
          >
            {t('metadataImport.ignore')}
          </button>
          <button
            onClick={handleImport}
            className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/90 rounded"
          >
            {t('common:actions.import')}
          </button>
        </div>
      </div>
    </div>
  );
}
