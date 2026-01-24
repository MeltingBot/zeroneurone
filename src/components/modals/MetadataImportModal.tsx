import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useInvestigationStore } from '../../stores';
import type { Property, GeoCoordinates } from '../../types';

function formatPropertyValue(prop: Property): string {
  if (prop.value == null) return '';
  if (prop.value instanceof Date) {
    return prop.value.toLocaleDateString() + ' ' + prop.value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (typeof prop.value === 'boolean') {
    return prop.value ? 'Oui' : 'Non';
  }
  return String(prop.value);
}

const TYPE_LABELS: Record<string, string> = {
  text: 'texte',
  number: 'nombre',
  datetime: 'date/heure',
  date: 'date',
  boolean: 'booléen',
};

export function MetadataImportModal() {
  const queue = useUIStore((s) => s.metadataImportQueue);
  const shiftMetadataImport = useUIStore((s) => s.shiftMetadataImport);
  const updateElement = useInvestigationStore((s) => s.updateElement);
  const elements = useInvestigationStore((s) => s.elements);

  const current = queue[0];

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [geoSelected, setGeoSelected] = useState(false);
  const [initialized, setInitialized] = useState<string | null>(null);

  // Initialize selections when a new item appears
  const itemId = current
    ? `${current.elementId}-${current.filename}`
    : null;

  if (itemId && initialized !== itemId) {
    const allKeys = new Set(current!.metadata.properties.map((p) => p.key));
    setSelectedKeys(allKeys);
    setGeoSelected(!!current!.metadata.geo);
    setInitialized(itemId);
  }

  const allSelected = useMemo(() => {
    if (!current) return false;
    const allProps = current.metadata.properties.length === selectedKeys.size;
    const allGeo = !current.metadata.geo || geoSelected;
    return allProps && allGeo;
  }, [current, selectedKeys, geoSelected]);

  if (!current) return null;

  const { metadata, elementId, elementLabel, filename } = current;

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
    shiftMetadataImport();
  };

  const handleImport = async () => {
    const element = elements.find((e) => e.id === elementId);
    if (!element) {
      shiftMetadataImport();
      return;
    }

    const selectedProperties = metadata.properties.filter((p) => selectedKeys.has(p.key));

    if (selectedProperties.length === 0 && !geoSelected) {
      shiftMetadataImport();
      return;
    }

    // Merge properties: overwrite existing keys, add new ones
    const existingMap = new Map(element.properties.map((p) => [p.key, p]));
    for (const prop of selectedProperties) {
      existingMap.set(prop.key, prop);
    }
    const mergedProperties = Array.from(existingMap.values());

    const changes: Partial<{ properties: Property[]; geo: GeoCoordinates | null }> = {
      properties: mergedProperties,
    };

    if (geoSelected && metadata.geo) {
      changes.geo = metadata.geo;
    }

    await updateElement(elementId, changes);
    shiftMetadataImport();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleIgnore}
    >
      <div
        className="bg-bg-primary rounded shadow-lg w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-default">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">
              Métadonnées détectées
            </h3>
            <p className="text-xs text-text-secondary mt-0.5 truncate">
              {filename} &rarr; {elementLabel}
            </p>
          </div>
          <button
            onClick={handleIgnore}
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
            Tout sélectionner
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
                <span className="text-[10px] text-text-tertiary bg-bg-tertiary px-1 rounded flex-shrink-0">
                  {TYPE_LABELS[prop.type] || prop.type}
                </span>
              )}
              <span className="text-xs text-text-secondary truncate">
                {formatPropertyValue(prop)}
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
                Coordonnées GPS
              </span>
              <span className="text-xs text-text-secondary">
                {metadata.geo.lat.toFixed(5)}, {metadata.geo.lng.toFixed(5)}
              </span>
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border-default">
          <button
            onClick={handleIgnore}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary border border-border-default rounded"
          >
            Ignorer
          </button>
          <button
            onClick={handleImport}
            className="px-3 py-1.5 text-xs font-medium text-white bg-accent hover:bg-accent/90 rounded"
          >
            Importer
          </button>
        </div>
      </div>
    </div>
  );
}
