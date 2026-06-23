import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileJson, AlertCircle } from 'lucide-react';
import { useDossierStore, useTagSetStore, useHistoryStore, useSelectionStore, useTabStore, useViewStore } from '../../stores';
import { useUIStore } from '../../stores/uiStore';
import type { Element, ElementVisual, Property, GeoData } from '../../types';
import {
  findRecordSources,
  pickDefaultSource,
  recordsForSource,
  sourceKey,
  collectFields,
  guessTarget,
  lastSegment,
  applyTemplate,
  coerceForTarget,
  isBlank,
  type FieldMapping,
  type MappingTarget,
} from '../../utils/jsonMapping';

interface JsonMappingImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fill and parse this JSON when the modal opens (e.g. from a paste). */
  initialJson?: string;
}

const TARGETS: MappingTarget[] = ['property', 'date', 'country', 'source', 'lat', 'lng'];

export function JsonMappingImportModal({ isOpen, onClose, initialJson }: JsonMappingImportModalProps) {
  const { t } = useTranslation('modals');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [srcKey, setSrcKey] = useState('');
  const [mapping, setMapping] = useState<Record<string, FieldMapping>>({});
  const [labelTemplate, setLabelTemplate] = useState('');
  const [tagName, setTagName] = useState('');
  const [ignoreEmpty, setIgnoreEmpty] = useState(true);
  const [creating, setCreating] = useState(false);

  const reset = useCallback(() => {
    setText(''); setParsed(null); setError(null); setSrcKey('');
    setMapping({}); setLabelTemplate(''); setTagName(''); setIgnoreEmpty(true); setCreating(false);
  }, []);

  const handleClose = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  // Possible record sources (arrays of objects + whole-object-as-single-record)
  const sources = useMemo(() => (parsed != null ? findRecordSources(parsed) : []), [parsed]);
  const selectedSource = useMemo(
    () => sources.find((s) => sourceKey(s) === srcKey) ?? pickDefaultSource(sources),
    [sources, srcKey],
  );

  // Flattened records for the chosen source
  const records = useMemo(() => recordsForSource(parsed, selectedSource), [parsed, selectedSource]);

  const fields = useMemo(() => collectFields(records), [records]);

  // Initialise mapping + label template whenever the field set changes
  const fieldSig = fields.map((f) => f.key).join('|');
  useEffect(() => {
    if (fields.length === 0) { setMapping({}); return; }
    const next: Record<string, FieldMapping> = {};
    for (const f of fields) {
      const g = guessTarget(f.key);
      // Noise fields (id, hash, score…) start disabled but keep a sane target if re-enabled.
      next[f.key] = { enabled: g !== 'ignore', target: g === 'ignore' ? 'property' : g, propKey: lastSegment(f.key) };
    }
    setMapping(next);
    // Guess a label template: first/last name (any depth, camelCase or snake_case),
    // else a name/username/title-like field, else the first text field.
    const findKey = (re: RegExp) => fields.find((f) => re.test(f.key))?.key;
    const fn = findKey(/(^|\.)first[_]?name$/i);
    const ln = findKey(/(^|\.)last[_]?name$/i);
    const nameKey = findKey(/(^|\.)(display_?name|full_?name|name|username|title|label)$/i);
    if (fn && ln) setLabelTemplate(`{${fn}} {${ln}}`);
    else if (fn) setLabelTemplate(`{${fn}}`);
    else if (nameKey) setLabelTemplate(`{${nameKey}}`);
    else {
      const firstText = fields.find((f) => guessTarget(f.key) === 'property' && f.sample);
      setLabelTemplate(firstText ? `{${firstText.key}}` : fields[0] ? `{${fields[0].key}}` : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldSig]);

  const parse = useCallback((raw: string) => {
    if (!raw.trim()) { setError(null); setParsed(null); return; }
    try {
      const data = JSON.parse(raw);
      setError(null);
      setParsed(data);
      const srcs = findRecordSources(data);
      const def = pickDefaultSource(srcs);
      setSrcKey(def ? sourceKey(def) : '');
      if (!def) setError(t('importJsonMapping.noArray'));
    } catch {
      setParsed(null);
      setError(t('importJsonMapping.invalidJson'));
    }
  }, [t]);

  const handleFile = useCallback(async (file: File) => {
    const content = await file.text();
    setText(content);
    parse(content);
  }, [parse]);

  // Pre-fill from a paste when the modal opens
  useEffect(() => {
    if (isOpen && initialJson) {
      setText(initialJson);
      parse(initialJson);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialJson]);

  // Preview of the first record's computed label
  const previewLabel = useMemo(() => {
    if (records.length === 0) return '';
    return applyTemplate(labelTemplate, records[0]) || t('importJsonMapping.noLabel');
  }, [records, labelTemplate, t]);

  const setFieldTarget = (key: string, target: MappingTarget) =>
    setMapping((m) => ({ ...m, [key]: { ...m[key], target } }));
  const setFieldKey = (key: string, propKey: string) =>
    setMapping((m) => ({ ...m, [key]: { ...m[key], propKey } }));
  const setFieldEnabled = (key: string, enabled: boolean) =>
    setMapping((m) => ({ ...m, [key]: { ...m[key], enabled } }));
  const allEnabled = fields.length > 0 && fields.every((f) => mapping[f.key]?.enabled);
  const toggleAll = () =>
    setMapping((m) => {
      const target = !allEnabled;
      const next = { ...m };
      for (const f of fields) if (next[f.key]) next[f.key] = { ...next[f.key], enabled: target };
      return next;
    });

  const handleImport = useCallback(async () => {
    const dossier = useDossierStore.getState().currentDossier;
    if (!dossier || records.length === 0) return;
    setCreating(true);
    try {
      // Ensure the tag exists (and capture its visual for the created elements)
      const tn = tagName.trim();
      let tagVisual: { color: string | null; shape: ElementVisual['shape'] | null; icon: string | null } | null = null;
      if (tn) {
        const tagStore = useTagSetStore.getState();
        let ts = tagStore.getByName(tn);
        if (!ts) {
          ts = await tagStore.create({
            name: tn,
            description: '',
            defaultVisual: { color: '#fcd34d', shape: 'circle', icon: null },
            suggestedProperties: [],
            isBuiltIn: false,
          });
        }
        tagVisual = ts.defaultVisual;
      }

      const baseVisual: ElementVisual = {
        color: '#ffffff', borderColor: '#e5e7eb', shape: 'rectangle', size: 'medium', icon: null, image: null,
      };
      if (tagVisual) {
        if (tagVisual.color) baseVisual.color = tagVisual.color;
        if (tagVisual.shape) baseVisual.shape = tagVisual.shape;
        if (tagVisual.icon) baseVisual.icon = tagVisual.icon;
      }

      const cols = Math.max(1, Math.ceil(Math.sqrt(records.length)));
      const now = new Date();
      const newElements: Element[] = records.map((flat, i) => {
        const properties: Property[] = [];
        let source = '';
        let lat: number | null = null;
        let lng: number | null = null;

        for (const f of fields) {
          const m = mapping[f.key];
          if (!m || !m.enabled) continue;
          const raw = flat[f.key];
          if (ignoreEmpty && isBlank(raw)) continue;
          const coerced = coerceForTarget(raw, m.target);
          if (coerced === null) continue;
          const propKey = m.propKey.trim() || lastSegment(f.key);
          switch (m.target) {
            case 'source': source = source ? `${source} | ${coerced}` : String(coerced); break;
            case 'lat': lat = coerced as number; break;
            case 'lng': lng = coerced as number; break;
            case 'date': properties.push({ key: propKey, value: coerced as Date, type: 'date' }); break;
            case 'country': properties.push({ key: propKey, value: coerced as string, type: 'country' }); break;
            default: properties.push({ key: propKey, value: coerced as string, type: 'text' });
          }
        }

        const geo: GeoData | null = lat != null && lng != null ? { type: 'point', lat, lng } : null;
        const label = applyTemplate(labelTemplate, flat) || t('importJsonMapping.noLabel');

        return {
          id: crypto.randomUUID(),
          dossierId: dossier.id,
          label,
          notes: '',
          tags: tn ? [tn] : [],
          properties,
          confidence: null,
          source,
          date: null,
          dateRange: null,
          position: { x: (i % cols) * 240, y: Math.floor(i / cols) * 150 },
          isPositionLocked: false,
          geo,
          events: [],
          visual: { ...baseVisual },
          assetIds: [],
          parentGroupId: null,
          isGroup: false,
          isAnnotation: false,
          childIds: [],
          createdAt: now,
          updatedAt: now,
        } as Element;
      });

      useDossierStore.getState().pasteElements(newElements, []);
      const ids = newElements.map((e) => e.id);

      const activeTabId = useTabStore.getState().activeTabId;
      if (activeTabId) await useTabStore.getState().addMembers(activeTabId, ids);

      useHistoryStore.getState().pushAction({
        type: 'create-elements',
        undo: {},
        redo: { elements: newElements, elementIds: ids, linkIds: [] },
      });

      useSelectionStore.getState().selectElements(ids);
      useViewStore.getState().requestFitView();
      useUIStore.getState().showToast('success', t('importJsonMapping.created', { count: ids.length }));
      handleClose();
    } catch (e) {
      console.error('JSON mapping import failed', e);
      setError(String(e));
      setCreating(false);
    }
  }, [records, fields, mapping, ignoreEmpty, labelTemplate, tagName, t, handleClose]);

  if (!isOpen) return null;

  const canImport = records.length > 0 && labelTemplate.trim().length > 0 && !creating;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40">
      <div className="bg-bg-primary border border-border-default sketchy-border-soft modal-shadow w-[92vw] max-w-3xl max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div className="flex items-center gap-2">
            <FileJson size={16} className="text-text-secondary" />
            <h2 className="text-sm font-semibold text-text-primary">{t('importJsonMapping.title')}</h2>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-bg-tertiary rounded transition-colors">
            <X size={18} className="text-text-secondary" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* JSON input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary">{t('importJsonMapping.pasteLabel')}</label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-text-secondary hover:text-accent"
              >
                {t('importJsonMapping.orFile')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json,.txt"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                className="hidden"
              />
            </div>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); parse(e.target.value); }}
              placeholder={t('importJsonMapping.pastePlaceholder')}
              spellCheck={false}
              className="w-full h-28 px-2 py-1.5 text-xs font-mono bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary resize-y"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2 rounded bg-error/10 border border-error/30">
              <AlertCircle size={14} className="text-error shrink-0" />
              <span className="text-xs text-error">{error}</span>
            </div>
          )}

          {records.length > 0 && (
            <>
              {/* Record source */}
              {sources.length > 1 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-text-secondary">{t('importJsonMapping.arrayRoot')}</label>
                  <select
                    value={selectedSource ? sourceKey(selectedSource) : ''}
                    onChange={(e) => setSrcKey(e.target.value)}
                    className="px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                  >
                    {sources.map((s) => (
                      <option key={sourceKey(s)} value={sourceKey(s)}>
                        {s.kind === 'single' ? t('importJsonMapping.wholeObject') : `${s.path || '(racine)'} — ${s.length}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Label template */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">{t('importJsonMapping.labelTemplate')}</label>
                <input
                  type="text"
                  value={labelTemplate}
                  onChange={(e) => setLabelTemplate(e.target.value)}
                  placeholder="{first_name} {last_name}"
                  className="w-full px-2 py-1.5 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary font-mono"
                />
                <p className="text-[10px] text-text-tertiary">{t('importJsonMapping.labelTemplateHint')}</p>
              </div>

              {/* Tag + options */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-text-secondary">{t('importJsonMapping.tag')}</label>
                  <input
                    type="text"
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value)}
                    placeholder={t('importJsonMapping.tagPlaceholder')}
                    className="px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input type="checkbox" checked={ignoreEmpty} onChange={(e) => setIgnoreEmpty(e.target.checked)} className="rounded border-border-default" />
                  {t('importJsonMapping.ignoreEmpty')}
                </label>
              </div>

              {/* Mapping table */}
              <div className="border border-border-default rounded overflow-hidden">
                <div className="grid grid-cols-[24px_1fr_1fr_130px_100px] gap-2 px-2 py-1.5 bg-bg-secondary text-[10px] font-medium text-text-secondary uppercase tracking-wider items-center">
                  <input
                    type="checkbox"
                    checked={allEnabled}
                    onChange={toggleAll}
                    className="rounded border-border-default"
                    title={t('importJsonMapping.toggleAll')}
                  />
                  <span>{t('importJsonMapping.field')}</span>
                  <span>{t('importJsonMapping.sample')}</span>
                  <span>{t('importJsonMapping.target')}</span>
                  <span>{t('importJsonMapping.propKey')}</span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-border-default">
                  {fields.map((f) => {
                    const m = mapping[f.key];
                    if (!m) return null;
                    const showKey = m.target === 'property' || m.target === 'date' || m.target === 'country';
                    return (
                      <div key={f.key} className={`grid grid-cols-[24px_1fr_1fr_130px_100px] gap-2 px-2 py-1 items-center ${m.enabled ? '' : 'opacity-45'}`}>
                        <input
                          type="checkbox"
                          checked={m.enabled}
                          onChange={(e) => setFieldEnabled(f.key, e.target.checked)}
                          className="rounded border-border-default"
                        />
                        <span className="text-xs font-mono text-text-primary truncate" title={f.key}>{f.key}</span>
                        <span className="text-xs text-text-tertiary truncate" title={f.sample}>{f.sample}</span>
                        <select
                          value={m.target}
                          disabled={!m.enabled}
                          onChange={(e) => setFieldTarget(f.key, e.target.value as MappingTarget)}
                          className="px-1 py-0.5 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary disabled:opacity-60"
                        >
                          {TARGETS.map((tg) => (
                            <option key={tg} value={tg}>{t(`importJsonMapping.targets.${tg}`)}</option>
                          ))}
                        </select>
                        {showKey && m.enabled ? (
                          <input
                            type="text"
                            value={m.propKey}
                            onChange={(e) => setFieldKey(f.key, e.target.value)}
                            className="px-1 py-0.5 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                          />
                        ) : <span />}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-[10px] text-text-tertiary">{t('importJsonMapping.enabledCount', { enabled: fields.filter((f) => mapping[f.key]?.enabled).length, total: fields.length })}</p>

              {/* Preview */}
              <div className="text-xs text-text-secondary">
                {t('importJsonMapping.willCreate', { count: records.length })}
                {previewLabel && (
                  <span className="text-text-tertiary"> — {t('importJsonMapping.previewLabel')} <span className="text-text-primary font-medium">{previewLabel}</span></span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-default bg-bg-secondary">
          <button onClick={handleClose} className="px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary rounded">
            {t('importJsonMapping.cancel')}
          </button>
          <button
            onClick={handleImport}
            disabled={!canImport}
            className="px-3 py-1.5 bg-accent text-white text-sm font-medium rounded hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? t('importJsonMapping.importing') : t('importJsonMapping.import')}
          </button>
        </div>
      </div>
    </div>
  );
}
