import { useState, useMemo, useEffect, useCallback, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileJson, AlertCircle, Save, FolderOpen, Check } from 'lucide-react';
import { useDossierStore, useTagSetStore, useJsonMappingStore } from '../../stores';
import { useUIStore } from '../../stores/uiStore';
import type { Element, ElementVisual, Property, GeoData, Link } from '../../types';
import {
  findRecordSources,
  pickDefaultSource,
  rawRecordsForSource,
  getAtPath,
  sourceKey,
  collectFields,
  childFieldsOf,
  isUrl,
  toLngLatCoords,
  guessTarget,
  lastSegment,
  applyTemplate,
  coerceForTarget,
  isBlank,
  valueToString,
  flattenRecord,
  computeSignature,
  signatureOverlap,
  autoFieldMappings,
  detectCrossReferences,
  idValuesOf,
  idKey,
  findSharedIdHub,
  type FieldMapping,
  type FieldInfo,
  type RecordSource,
  type SourceIds,
  type MappingTarget,
  type CoordOrder,
  type ChildMapping,
  type MappingConfig,
} from '../../utils/jsonMapping';
import { computePolygonCenter, parseLatLngPair } from '../../utils/geo';
import { layoutService, type LayoutType } from '../../services/layoutService';
import { JsonMappingManagerModal } from './JsonMappingManagerModal';
import { JsonTablesDiagram, type DiagramTable } from './JsonTablesDiagram';
import { useDialogA11y } from '../../hooks/useDialogA11y';

const LAYOUTS: LayoutType[] = ['force', 'clusters', 'hierarchy', 'circular', 'grid'];
const layoutLabel = (l: LayoutType): string => (l === 'hierarchy' ? 'Hiérarchie' : layoutService.getLayoutName(l));

interface JsonMappingImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fill and parse this JSON when the modal opens (e.g. from a paste). */
  initialJson?: string;
}

const TARGETS: MappingTarget[] = ['property', 'date', 'country', 'link', 'asset', 'source', 'lat', 'lng', 'latlng', 'id', 'ref', 'pivot', 'polygon'];

// Large-file handling: sample records for the UI (detection/preview), but import them all.
const SAMPLE = 2000;           // records used for field detection / preview
const LAYOUT_CAP = 3000;       // skip auto-layout above this element count (force layout too slow)
const LARGE_TEXT = 1_000_000;  // chars: above this, don't render the JSON in the textarea

type FilterOp = 'contains' | 'equals' | 'nonempty';
interface FilterCond { field: string; op: FilterOp; value: string }

/** Everything the analyst sets for one table (record source) of the payload */
interface SourceConfig {
  fieldSig: string;
  mapping: Record<string, FieldMapping>;
  childMappings: Record<string, ChildMapping>;
  labelTemplate: string;
  tagName: string;
  filters: FilterCond[];
  filterMode: 'all' | 'any';
  maxImport: number;
}

/** Display name of a record source */
const sourceName = (s: RecordSource, wholeObject: string) => (s.kind === 'single' ? wholeObject : s.path || '(racine)');

/** Fields of a record source, from a flattened sample */
function fieldsOf(raw: Record<string, unknown>[]) {
  const records = raw.slice(0, SAMPLE).map((r) => flattenRecord(r));
  const fields = collectFields(records);
  return {
    records,
    fields,
    scalarFields: fields.filter((f) => f.kind === 'scalar'),
    childArrayFields: fields.filter((f) => f.kind === 'objectArray'),
    fieldSig: fields.map((f) => `${f.key}:${f.kind}`).join('|'),
  };
}

/** Whether a condition is usable (has a field, and a value unless 'nonempty'). */
const condActive = (c: FilterCond) => !!c.field && (c.op === 'nonempty' || c.value.trim() !== '');

/** Evaluate one filter condition against a raw record. */
function evalCond(raw: Record<string, unknown>, c: FilterCond): boolean {
  const v = getAtPath(raw, c.field);
  if (c.op === 'nonempty') return !isBlank(v);
  const s = valueToString(v).toLowerCase();
  const q = c.value.trim().toLowerCase();
  return c.op === 'equals' ? s === q : s.includes(q);
}

export function JsonMappingImportModal({ isOpen, onClose, initialJson }: JsonMappingImportModalProps) {
  const { t } = useTranslation('modals');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedInfo, setLoadedInfo] = useState<string | null>(null);
  const [srcKey, setSrcKey] = useState('');
  // Several tables: each keeps its own config, the checked ones are imported together
  const [configs, setConfigs] = useState<Record<string, SourceConfig>>({});
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [mapping, setMapping] = useState<Record<string, FieldMapping>>({});
  const [childMappings, setChildMappings] = useState<Record<string, ChildMapping>>({});
  const [labelTemplate, setLabelTemplate] = useState('');
  const [tagName, setTagName] = useState('');
  const [ignoreEmpty, setIgnoreEmpty] = useState(true);
  const [layout, setLayout] = useState<LayoutType>('force');
  const [creating, setCreating] = useState(false);

  // Import filter (multi-condition) + cap (to keep large datasets manageable)
  const [filters, setFilters] = useState<FilterCond[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'any'>('all');
  const [maxImport, setMaxImport] = useState(2000);

  // Saved templates (phase 2a)
  const templates = useJsonMappingStore((s) => s.templates);
  const loadTemplates = useJsonMappingStore((s) => s.load);
  const saveTemplate = useJsonMappingStore((s) => s.save);
  const [managerOpen, setManagerOpen] = useState(false);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  useEffect(() => { if (isOpen) loadTemplates(); }, [isOpen, loadTemplates]);

  const reset = useCallback(() => {
    setText(''); setParsed(null); setError(null); setLoadedInfo(null); setSrcKey(''); setConfigs({}); setIncluded(new Set());
    setMapping({}); setChildMappings({}); setLabelTemplate(''); setTagName(''); setIgnoreEmpty(true); setLayout('force'); setCreating(false);
    setSavingName(null); setSuggestionDismissed(false); setSelectedTemplateId('');
    setFilters([]); setFilterMode('all'); setMaxImport(2000);
  }, []);

  const handleClose = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  // Possible record sources (arrays of objects + whole-object-as-single-record)
  const sources = useMemo(() => (parsed != null ? findRecordSources(parsed) : []), [parsed]);
  const selectedSource = useMemo(
    () => sources.find((s) => sourceKey(s) === srcKey) ?? pickDefaultSource(sources),
    [sources, srcKey],
  );

  // Raw records (all, cheap) + a flattened SAMPLE for the UI (detection/preview).
  // The import flattens and processes ALL raw records.
  const rawRecords = useMemo(() => rawRecordsForSource(parsed, selectedSource), [parsed, selectedSource]);
  const recordCount = rawRecords.length;
  const records = useMemo(() => rawRecords.slice(0, SAMPLE).map((r) => flattenRecord(r)), [rawRecords]);

  // Import filter (multi-condition, ET/OU) + cap. Field discovery stays on the
  // unfiltered sample; only the records actually imported are filtered/capped.
  const filteredRaw = useMemo(() => {
    const active = filters.filter(condActive);
    if (active.length === 0) return rawRecords;
    return rawRecords.filter((raw) =>
      filterMode === 'all' ? active.every((c) => evalCond(raw, c)) : active.some((c) => evalCond(raw, c)),
    );
  }, [rawRecords, filters, filterMode]);
  const matchedCount = filteredRaw.length;
  const importCount = maxImport > 0 ? Math.min(matchedCount, maxImport) : matchedCount;

  const fields = useMemo(() => collectFields(records), [records]);
  // Scalar fields map to the parent element; array-of-objects fields can become linked children.
  const scalarFields = useMemo(() => fields.filter((f) => f.kind === 'scalar'), [fields]);
  const childArrayFields = useMemo(() => fields.filter((f) => f.kind === 'objectArray'), [fields]);
  const fieldSig = fields.map((f) => `${f.key}:${f.kind}`).join('|');

  // ── Several tables ────────────────────────────────────────────────────
  const activeKey = selectedSource ? sourceKey(selectedSource) : '';
  const defaultKey = useMemo(() => { const d = pickDefaultSource(sources); return d ? sourceKey(d) : ''; }, [sources]);
  // Tables other records can point into: arrays of objects
  const tableSources = useMemo(() => sources.filter((src) => src.kind === 'array'), [sources]);
  const wholeObject = t('importJsonMapping.wholeObject');

  /** The config being edited, as a snapshot */
  const snapshot = (): SourceConfig => ({ fieldSig, mapping, childMappings, labelTemplate, tagName, filters, filterMode, maxImport });

  /** Id field of a table: the one its config maps to 'id', else a top-level "id" */
  const idFieldOf = useCallback((key: string, scalar: FieldInfo[]) => {
    const cfg = key === activeKey ? { mapping } : configs[key];
    const mapped = cfg && Object.entries(cfg.mapping).find(([, m]) => m.enabled && m.target === 'id')?.[0];
    return mapped ?? scalar.find((f) => guessTarget(f.key) === 'id')?.key;
  }, [activeKey, mapping, configs]);

  // Ids of every table, so a field can be recognised as pointing into another one
  const tableIds = useMemo((): SourceIds[] => tableSources.map((src) => {
    const key = sourceKey(src);
    const raw = rawRecordsForSource(parsed, src);
    const { scalarFields: scalar } = fieldsOf(raw);
    return { key, name: src.path, ids: idValuesOf(raw, idFieldOf(key, scalar)) };
  }), [tableSources, parsed, idFieldOf]);

  // Tables all keyed by a shared id (e.g. the case number in every "id"):
  // the hub and the tables whose id points at it
  const sharedIdHub = useMemo(() => findSharedIdHub(tableSources.map((src) => {
    const raw = rawRecordsForSource(parsed, src);
    const idField = fieldsOf(raw).scalarFields.find((f) => guessTarget(f.key) === 'id')?.key;
    const ids = idValuesOf(raw, idField);
    const filled = idField ? raw.filter((r) => !isBlank(r[idField])).length : 0;
    return { key: sourceKey(src), ids, unique: ids.size > 0 && ids.size === filled };
  })), [tableSources, parsed]);

  /** Default config of a table, references to the other tables included */
  const autoConfigFor = useCallback((key: string): SourceConfig | null => {
    const src = sources.find((x) => sourceKey(x) === key);
    if (!src) return null;
    const f = fieldsOf(rawRecordsForSource(parsed, src));
    const own = tableIds.find((x) => x.key === key);
    const ownIdKey = f.scalarFields.find((x) => guessTarget(x.key) === 'id')?.key;
    const crossRefs = detectCrossReferences(f.records, f.scalarFields, ownIdKey, own?.ids ?? new Set(), tableIds.filter((x) => x.key !== key));
    const auto = autoFieldMappings(f.records, f.scalarFields, f.childArrayFields, crossRefs);
    // Its "id" is the hub's id (shared key): a reference to the hub, not its own identifier
    if (ownIdKey && sharedIdHub.hub && sharedIdHub.members.has(key)) {
      auto.mapping[ownIdKey] = { enabled: true, target: 'ref', propKey: '', refSource: sharedIdHub.hub };
    }
    return {
      fieldSig: f.fieldSig,
      ...auto,
      // Tables beyond the main one get their name as tag, to tell their elements apart
      tagName: key === defaultKey ? '' : (src.kind === 'array' ? lastSegment(src.path) : ''),
      filters: [],
      filterMode: 'all',
      maxImport: 2000,
    };
  }, [sources, parsed, tableIds, defaultKey, sharedIdHub]);

  /** Open another table: keep the current one's settings for later */
  const selectSource = (key: string) => {
    if (key === activeKey) return;
    if (activeKey) setConfigs((c) => ({ ...c, [activeKey]: snapshot() }));
    setSrcKey(key);
  };

  /** Change one field of a table's mapping, open or not */
  const updateTableField = (key: string, field: string, patch: Partial<FieldMapping>) => {
    if (key === activeKey) {
      setMapping((m) => (m[field] ? { ...m, [field]: { ...m[field], ...patch } } : m));
      return;
    }
    setConfigs((c) => {
      const cfg = c[key] ?? autoConfigFor(key);
      if (!cfg?.mapping[field]) return c;
      return { ...c, [key]: { ...cfg, mapping: { ...cfg.mapping, [field]: { ...cfg.mapping[field], ...patch } } } };
    });
  };

  /** From the diagram: point a field into a table, or make it a plain property again */
  const setTableRef = (key: string, field: string, target: string | null) =>
    updateTableField(key, field, target === null
      ? { target: 'property', refSource: undefined }
      : { enabled: true, target: 'ref', refSource: target === key ? undefined : target });

  const toggleIncluded = (key: string) => setIncluded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Initialise the table being opened: its saved settings, else the defaults
  useEffect(() => {
    if (fields.length === 0) { setMapping({}); setChildMappings({}); return; }
    // Saved settings are read, not watched: only opening a table re-runs this
    const saved = configs[activeKey];
    const cfg = saved && saved.fieldSig === fieldSig ? saved : autoConfigFor(activeKey);
    if (!cfg) return;
    setMapping(cfg.mapping);
    setChildMappings(cfg.childMappings);
    setLabelTemplate(cfg.labelTemplate);
    setTagName(cfg.tagName);
    setFilters(cfg.filters);
    setFilterMode(cfg.filterMode);
    setMaxImport(cfg.maxImport);
    setSuggestionDismissed(false);
    setSelectedTemplateId('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldSig, activeKey]);

  // Signature of the current shape + best-matching saved template (suggestion).
  const signature = useMemo(() => computeSignature(fields), [fields]);
  const suggestion = useMemo(() => {
    if (suggestionDismissed || fields.length === 0) return null;
    let best: typeof templates[number] | null = null;
    let score = 0;
    for (const tpl of templates) {
      const s = signatureOverlap(tpl.signature, signature);
      if (s > score) { score = s; best = tpl; }
    }
    return best && score >= 0.6 ? best : null;
  }, [templates, signature, fields.length, suggestionDismissed]);

  // Apply a saved config: only fields present in the current shape are overridden.
  const applyConfig = useCallback((cfg: MappingConfig) => {
    setLabelTemplate(cfg.labelTemplate);
    setTagName(cfg.tagName);
    setIgnoreEmpty(cfg.ignoreEmpty);
    setLayout((LAYOUTS.includes(cfg.layout as LayoutType) ? cfg.layout : 'force') as LayoutType);
    setMapping((prev) => {
      const nxt = { ...prev };
      for (const k of Object.keys(cfg.mapping)) if (nxt[k]) nxt[k] = cfg.mapping[k];
      return nxt;
    });
    setChildMappings((prev) => {
      const nxt = { ...prev };
      for (const k of Object.keys(cfg.childMappings)) if (nxt[k]) nxt[k] = cfg.childMappings[k];
      return nxt;
    });
    setSuggestionDismissed(true);
  }, []);

  const handleSaveTemplate = useCallback(async (name: string) => {
    const n = name.trim();
    if (!n) return;
    const config: MappingConfig = { labelTemplate, tagName, ignoreEmpty, layout, mapping, childMappings };
    try {
      const tpl = await saveTemplate(n, signature, config);
      setSelectedTemplateId(tpl.id);
      setSavingName(null);
      setError(null);
    } catch (e) {
      console.error('Save mapping template failed', e);
      setError(t('importJsonMapping.saveTemplateError'));
    }
  }, [labelTemplate, tagName, ignoreEmpty, layout, mapping, childMappings, signature, saveTemplate, t]);

  const parse = useCallback((raw: string) => {
    if (!raw.trim()) { setError(null); setParsed(null); return; }
    try {
      const data = JSON.parse(raw);
      setError(null);
      setParsed(data);
      const srcs = findRecordSources(data);
      const def = pickDefaultSource(srcs);
      setSrcKey(def ? sourceKey(def) : '');
      setConfigs({});
      setIncluded(new Set(def ? [sourceKey(def)] : []));
      if (!def) setError(t('importJsonMapping.noArray'));
    } catch {
      setParsed(null);
      setError(t('importJsonMapping.invalidJson'));
    }
  }, [t]);

  // Load content: above LARGE_TEXT, keep it OUT of the textarea (10 MB in a
  // controlled textarea freezes the UI) — show an info banner instead.
  const loadContent = useCallback((content: string, label: string | null) => {
    if (content.length > LARGE_TEXT) {
      setText('');
      setLoadedInfo(label ?? `${(content.length / 1048576).toFixed(1)} Mo`);
    } else {
      setText(content);
      setLoadedInfo(null);
    }
    parse(content);
  }, [parse]);

  const handleFile = useCallback(async (file: File) => {
    const content = await file.text();
    loadContent(content, `${file.name} — ${(file.size / 1048576).toFixed(1)} Mo`);
  }, [loadContent]);

  // Pre-fill from a paste when the modal opens
  useEffect(() => {
    if (isOpen && initialJson) {
      loadContent(initialJson, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialJson]);

  // Preview of the first record's computed label
  const previewLabel = useMemo(() => {
    if (filteredRaw.length === 0) return '';
    return applyTemplate(labelTemplate, flattenRecord(filteredRaw[0])) || t('importJsonMapping.noLabel');
  }, [filteredRaw, labelTemplate, t]);

  const setFieldTarget = (key: string, target: MappingTarget) =>
    setMapping((m) => ({ ...m, [key]: { ...m[key], target } }));
  const setFieldKey = (key: string, propKey: string) =>
    setMapping((m) => ({ ...m, [key]: { ...m[key], propKey } }));
  const setFieldEnabled = (key: string, enabled: boolean) =>
    setMapping((m) => ({ ...m, [key]: { ...m[key], enabled } }));
  const allEnabled = scalarFields.length > 0 && scalarFields.every((f) => mapping[f.key]?.enabled);
  const toggleAll = () =>
    setMapping((m) => {
      const target = !allEnabled;
      const next = { ...m };
      for (const f of scalarFields) if (next[f.key]) next[f.key] = { ...next[f.key], enabled: target };
      return next;
    });
  const setFieldRefSource = (key: string, refSource: string | undefined) =>
    setMapping((m) => ({ ...m, [key]: { ...m[key], refSource } }));
  const setFieldOrder = (key: string, coordOrder: CoordOrder) =>
    setMapping((m) => ({ ...m, [key]: { ...m[key], coordOrder } }));
  const setChild = (key: string, patch: Partial<ChildMapping>) =>
    setChildMappings((c) => ({ ...c, [key]: { ...c[key], ...patch } }));
  const addFilter = () => setFilters((f) => [...f, { field: '', op: 'contains', value: '' }]);
  const updateFilter = (i: number, patch: Partial<FilterCond>) =>
    setFilters((f) => f.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const removeFilter = (i: number) => setFilters((f) => f.filter((_, idx) => idx !== i));
  const allChildrenEnabled = childArrayFields.length > 0 && childArrayFields.every((f) => childMappings[f.key]?.enabled);
  const toggleAllChildren = () =>
    setChildMappings((c) => {
      const target = !allChildrenEnabled;
      const next = { ...c };
      for (const f of childArrayFields) if (next[f.key]) next[f.key] = { ...next[f.key], enabled: target };
      return next;
    });

  /** Records each checked table would import (its filters and cap applied) */
  const planFor = useCallback((key: string, cfg: SourceConfig) => {
    const src = sources.find((x) => sourceKey(x) === key);
    if (!src) return null;
    const raw = rawRecordsForSource(parsed, src);
    const active = cfg.filters.filter(condActive);
    const filtered = active.length === 0
      ? raw
      : raw.filter((r) => (cfg.filterMode === 'all' ? active.every((c) => evalCond(r, c)) : active.some((c) => evalCond(r, c))));
    const capped = cfg.maxImport > 0 ? filtered.slice(0, cfg.maxImport) : filtered;
    return { key, src, cfg, raw: capped };
  }, [sources, parsed]);

  // How many elements the checked tables give (the open one as edited)
  const includedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const key of included) {
      if (key === activeKey) { counts.set(key, importCount); continue; }
      const cfg = configs[key] ?? autoConfigFor(key);
      const plan = cfg ? planFor(key, cfg) : null;
      counts.set(key, plan?.raw.length ?? 0);
    }
    return counts;
  }, [included, activeKey, importCount, configs, autoConfigFor, planFor]);
  const totalImportCount = [...includedCounts.values()].reduce((sum, n) => sum + n, 0);

  // The checked tables and their references, for the diagram
  const diagramTables = useMemo((): DiagramTable[] => tableSources
    .filter((src) => included.has(sourceKey(src)))
    .map((src) => {
      const key = sourceKey(src);
      const m = key === activeKey ? mapping : (configs[key] ?? autoConfigFor(key))?.mapping ?? {};
      const raw = rawRecordsForSource(parsed, src);
      const scalar = key === activeKey ? scalarFields : fieldsOf(raw).scalarFields;
      const idField = scalar.find((f) => m[f.key]?.enabled && m[f.key]?.target === 'id')?.key;
      const flats = raw.slice(0, SAMPLE).map((r) => flattenRecord(r));
      const refs = scalar
        .filter((f) => m[f.key]?.enabled && m[f.key]?.target === 'ref')
        .map((f) => {
          const target = m[f.key].refSource || key;
          // Share of the field's values found among the target's ids: tells a sound link from a broken one
          const ids = tableIds.find((x) => x.key === target)?.ids ?? new Set<string>();
          let total = 0, found = 0;
          for (const r of flats) {
            const v = r[f.key];
            for (const x of Array.isArray(v) ? v : (isBlank(v) ? [] : [v])) {
              const k = idKey(x);
              if (!k) continue;
              total++;
              if (ids.has(k)) found++;
            }
          }
          return { field: f.key, target, matched: total > 0 ? found / total : 0 };
        });
      const candidates = scalar
        .filter((f) => f.key !== idField && !(m[f.key]?.enabled && m[f.key]?.target === 'ref'))
        .map((f) => f.key);
      return { key, name: src.path, count: includedCounts.get(key) ?? 0, idField, refs, candidates };
    }), [tableSources, included, activeKey, mapping, configs, autoConfigFor, scalarFields, parsed, includedCounts, tableIds]);

  const handleImport = useCallback(async () => {
    const dossier = useDossierStore.getState().currentDossier;
    if (!dossier || totalImportCount === 0) return;
    // Settings of every checked table — the open one as being edited
    const all: Record<string, SourceConfig> = { ...configs, [activeKey]: snapshot() };
    const plans = sources
      .map((src) => sourceKey(src))
      .filter((key) => included.has(key))
      .map((key) => { const cfg = all[key] ?? autoConfigFor(key); return cfg ? planFor(key, cfg) : null; })
      .filter((p): p is NonNullable<typeof p> => !!p && p.raw.length > 0);
    if (plans.length === 0) return;
    setCreating(true);
    try {
      const tagStore = useTagSetStore.getState();
      // Ensure a tag exists and return a base visual derived from it.
      const ensureVisual = async (name: string): Promise<ElementVisual> => {
        const base: ElementVisual = { color: '#ffffff', borderColor: '#e5e7eb', shape: 'rectangle', size: 'medium', icon: null, image: null };
        const tn = name.trim();
        if (!tn) return base;
        let ts = tagStore.getByName(tn);
        if (!ts) {
          ts = await tagStore.create({ name: tn, description: '', defaultVisual: { color: '#fcd34d', shape: 'circle', icon: null }, suggestedProperties: [], isBuiltIn: false });
        }
        const dv = ts.defaultVisual;
        if (dv.color) base.color = dv.color;
        if (dv.shape) base.shape = dv.shape;
        if (dv.icon) base.icon = dv.icon;
        return base;
      };

      const now = new Date();
      const elements: Element[] = [];
      const links: Link[] = [];
      const assetDownloads: { elementId: string; urls: string[] }[] = [];
      // Pivots are shared across tables: one node per tag and value
      const pivotByKey = new Map<string, Element>();
      let pivotIdx = 0;

      const buildProps = (flat: Record<string, unknown>, fieldList: FieldInfo[], getMap: (k: string) => FieldMapping | undefined) => {
        const properties: Property[] = [];
        let source = '';
        let lat: number | null = null, lng: number | null = null;
        for (const f of fieldList) {
          const m = getMap(f.key);
          if (!m || !m.enabled) continue;
          const raw = flat[f.key];
          if (ignoreEmpty && isBlank(raw)) continue;
          const coerced = coerceForTarget(raw, m.target);
          if (coerced === null) continue;
          const propKey = m.propKey.trim() || lastSegment(f.key);
          switch (m.target) {
            case 'id': case 'ref': case 'polygon': case 'latlng': case 'asset': case 'pivot': break; // handled separately
            case 'source': source = source ? `${source} | ${coerced}` : String(coerced); break;
            case 'lat': lat = coerced as number; break;
            case 'lng': lng = coerced as number; break;
            case 'date': properties.push({ key: propKey, value: coerced as Date, type: 'date' }); break;
            case 'country': properties.push({ key: propKey, value: coerced as string, type: 'country' }); break;
            case 'link': properties.push({ key: propKey, value: coerced as string, type: 'link' }); break;
            default: properties.push({ key: propKey, value: coerced as string, type: 'text' });
          }
        }
        return { properties, source, lat, lng };
      };

      const mkElement = (partial: Partial<Element> & { label: string; visual: ElementVisual; position: { x: number; y: number } }): Element => ({
        id: crypto.randomUUID(), dossierId: dossier.id, label: partial.label, notes: '', tags: partial.tags ?? [],
        properties: partial.properties ?? [], confidence: null, source: partial.source ?? '', date: null, dateRange: null,
        position: partial.position, isPositionLocked: false, geo: partial.geo ?? null, events: [],
        visual: partial.visual, assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
        createdAt: now, updatedAt: now,
      });

      // Per table: id value → element, and the parent element of each record
      const idMaps = new Map<string, Map<string, string>>();
      const built: { key: string; mapping: Record<string, FieldMapping>; scalar: FieldInfo[]; flats: Record<string, unknown>[]; parents: Element[] }[] = [];
      let originY = 0;

      for (const plan of plans) {
        const { cfg } = plan;
        // A reference into a table that is not imported keeps its value as a
        // property: no link can be made, the data must not be lost
        const mapping: Record<string, FieldMapping> = Object.fromEntries(Object.entries(cfg.mapping).map(([k, m]) => (
          m.target === 'ref' && m.refSource && !included.has(m.refSource)
            ? [k, { ...m, target: 'property' as const, propKey: lastSegment(k), refSource: undefined }]
            : [k, m]
        )));
        const flats = plan.raw.map((r) => flattenRecord(r));
        const { scalarFields: scalar, childArrayFields: childArrays } = fieldsOf(rawRecordsForSource(parsed, plan.src));
        const tn = cfg.tagName.trim();
        const parentVisual = await ensureVisual(tn);

        // Resolve visuals for each enabled child-array field's tag.
        const enabledChildren = childArrays.filter((f) => cfg.childMappings[f.key]?.enabled && cfg.childMappings[f.key]?.tag.trim());
        const childVisuals: Record<string, ElementVisual> = {};
        for (const f of enabledChildren) childVisuals[f.key] = await ensureVisual(cfg.childMappings[f.key].tag);

        // Pivot fields: a shared value → one dedup'd node linking every record that has it.
        const pivotFields = scalar.filter((f) => mapping[f.key]?.enabled && mapping[f.key]?.target === 'pivot');
        const pivotTagOf = (key: string) => (mapping[key]?.propKey.trim() || lastSegment(key));
        const pivotVisuals: Record<string, ElementVisual> = {};
        for (const f of pivotFields) pivotVisuals[f.key] = await ensureVisual(pivotTagOf(f.key));

        const idField = scalar.find((f) => mapping[f.key]?.enabled && mapping[f.key]?.target === 'id')?.key;
        const polyFieldKey = scalar.find((f) => mapping[f.key]?.enabled && mapping[f.key]?.target === 'polygon')?.key;
        const polyOrder: CoordOrder = polyFieldKey ? (mapping[polyFieldKey]?.coordOrder ?? 'latlng') : 'latlng';
        const latlngFieldKey = scalar.find((f) => mapping[f.key]?.enabled && mapping[f.key]?.target === 'latlng')?.key;
        const assetFields = scalar.filter((f) => mapping[f.key]?.enabled && mapping[f.key]?.target === 'asset');
        const idToElement = new Map<string, string>();
        const parents: Element[] = [];
        const cols = Math.max(1, Math.ceil(Math.sqrt(flats.length)));

        flats.forEach((flat, i) => {
          const { properties, source, lat, lng } = buildProps(flat, scalar, (k) => mapping[k]);
          let geo: GeoData | null = null;
          if (polyFieldKey) {
            const coords = toLngLatCoords(flat[polyFieldKey], polyOrder);
            if (coords.length >= 3) geo = { type: 'polygon', coordinates: coords, center: computePolygonCenter(coords) };
          }
          if (!geo && latlngFieldKey) {
            const p = parseLatLngPair(valueToString(flat[latlngFieldKey]));
            if (p) geo = { type: 'point', lat: p.lat, lng: p.lng };
          }
          if (!geo && lat != null && lng != null) geo = { type: 'point', lat, lng };
          const parent = mkElement({
            label: applyTemplate(cfg.labelTemplate, flat) || t('importJsonMapping.noLabel'),
            tags: tn ? [tn] : [], properties, source, geo,
            visual: { ...parentVisual },
            position: { x: (i % cols) * 380, y: originY + Math.floor(i / cols) * 320 },
          });
          elements.push(parent);
          parents.push(parent);
          if (idField) {
            const idv = idKey(flat[idField]);
            if (idv && !idToElement.has(idv)) idToElement.set(idv, parent.id);
          }
          // Collect media URLs to download + attach after the element is created.
          if (assetFields.length > 0) {
            const urls: string[] = [];
            for (const af of assetFields) {
              const raw = flat[af.key];
              const vals = Array.isArray(raw) ? raw : (isBlank(raw) ? [] : [raw]);
              for (const v of vals) { const s = valueToString(v).trim(); if (isUrl(s)) urls.push(s); }
            }
            if (urls.length) assetDownloads.push({ elementId: parent.id, urls });
          }

          // Pivot nodes: link this record to a dedup'd node per shared value.
          for (const pf of pivotFields) {
            const tag = pivotTagOf(pf.key);
            const raw = flat[pf.key];
            const vals = Array.isArray(raw) ? raw : (isBlank(raw) ? [] : [raw]);
            for (const v of vals) {
              const val = valueToString(v).trim();
              if (!val) continue;
              const key = `${tag}\u0000${val}`;
              let pivot = pivotByKey.get(key);
              if (!pivot) {
                pivot = mkElement({
                  label: val,
                  tags: tag ? [tag] : [],
                  visual: { ...pivotVisuals[pf.key] },
                  position: { x: -360, y: (pivotIdx++) * 130 },
                });
                elements.push(pivot);
                pivotByKey.set(key, pivot);
              }
              links.push({
                id: crypto.randomUUID(), dossierId: dossier.id, fromId: parent.id, toId: pivot.id,
                sourceHandle: null, targetHandle: null,
                label: '', notes: '', tags: [], properties: [],
                directed: false, direction: 'none', confidence: null, source: '', date: null, dateRange: null,
                visual: { color: '#9ca3af', style: 'dashed', thickness: 2 },
                curveOffset: { x: 0, y: 0 },
                createdAt: now, updatedAt: now,
              });
            }
          }

          // Linked children from array-of-objects fields
          let childIdx = 0;
          for (const f of enabledChildren) {
            const cm = cfg.childMappings[f.key];
            const arr = flat[f.key];
            if (!Array.isArray(arr)) continue;
            const subFields = childFieldsOf([flat], f.key);
            for (const item of arr) {
              if (item == null || typeof item !== 'object') continue;
              const childFlat = flattenRecord(item);
              const cp = buildProps(childFlat, subFields, (k) => ({ enabled: true, target: guessTarget(k) === 'date' ? 'date' : 'property', propKey: lastSegment(k) }));
              const child = mkElement({
                label: applyTemplate(cm.labelTemplate, childFlat) || t('importJsonMapping.noLabel'),
                tags: cm.tag.trim() ? [cm.tag.trim()] : [], properties: cp.properties, source: cp.source,
                visual: { ...childVisuals[f.key] },
                position: { x: parent.position.x + (childIdx % 3) * 175, y: parent.position.y + 160 + Math.floor(childIdx / 3) * 110 },
              });
              elements.push(child);
              links.push({
                id: crypto.randomUUID(), dossierId: dossier.id, fromId: parent.id, toId: child.id,
                sourceHandle: null, targetHandle: null,
                label: cm.linkLabel.trim(), notes: '', tags: [], properties: [],
                directed: true, direction: 'forward', confidence: null, source: '', date: null, dateRange: null,
                visual: { color: '#9ca3af', style: 'solid', thickness: 2 },
                curveOffset: { x: 0, y: 0 },
                createdAt: now, updatedAt: now,
              });
              childIdx++;
            }
          }
        });

        idMaps.set(plan.key, idToElement);
        built.push({ key: plan.key, mapping, scalar, flats, parents });
        // Next table below this one, before the layout rearranges everything
        originY += (Math.ceil(flats.length / cols) + 1) * 320;
      }

      // Second pass: resolve reference fields (ids of records of the same or
      // another table) into DIRECTED links. Reciprocal references (A→B and
      // B→A) collapse into a single bidirectional link.
      const edgeSet = new Set<string>();
      const edges: { from: string; to: string; label: string }[] = [];
      for (const b of built) {
        const refFields = b.scalar.filter((f) => b.mapping[f.key]?.enabled && b.mapping[f.key]?.target === 'ref');
        if (refFields.length === 0) continue;
        b.flats.forEach((flat, i) => {
          const fromId = b.parents[i].id;
          for (const rf of refFields) {
            const targetIds = idMaps.get(b.mapping[rf.key]?.refSource || b.key);
            if (!targetIds) continue;
            const raw = flat[rf.key];
            const refVals = Array.isArray(raw) ? raw : (isBlank(raw) ? [] : [raw]);
            const label = (b.mapping[rf.key]?.propKey ?? '').trim();
            for (const rv of refVals) {
              const targetId = targetIds.get(idKey(rv));
              if (!targetId || targetId === fromId) continue;
              const key = `${fromId}|${targetId}`;
              if (edgeSet.has(key)) continue;
              edgeSet.add(key);
              edges.push({ from: fromId, to: targetId, label });
            }
          }
        });
      }
      const donePairs = new Set<string>();
      for (const e of edges) {
        const pair = [e.from, e.to].sort().join('|');
        if (donePairs.has(pair)) continue; // emit one link per unordered pair
        donePairs.add(pair);
        const bidi = edgeSet.has(`${e.to}|${e.from}`);
        links.push({
          id: crypto.randomUUID(), dossierId: dossier.id, fromId: e.from, toId: e.to,
          sourceHandle: null, targetHandle: null,
          label: e.label, notes: '', tags: [], properties: [],
          directed: true, direction: bidi ? 'both' : 'forward', confidence: null, source: '', date: null, dateRange: null,
          visual: { color: '#6b7280', style: 'solid', thickness: 2 },
          curveOffset: { x: 0, y: 0 },
          createdAt: now, updatedAt: now,
        });
      }

      // Lay the subgraph out properly (force/hierarchy/… respecting the links)
      // instead of the naive build-order grid. Skipped for very large imports
      // (force layout would freeze) — the build-order grid is kept.
      if (elements.length > 1 && elements.length <= LAYOUT_CAP) {
        const { positions } = layoutService.applyLayout(layout, elements, links);
        for (const el of elements) {
          const p = positions.get(el.id);
          if (p) el.position = p;
        }
      }

      // Hand the built elements/links to placement mode: the user clicks on the
      // canvas to position the block (same UX as file import). Positions are
      // relative to the bounding box and shifted to the click point.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const el of elements) {
        const { x, y } = el.position;
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
      useUIStore.getState().enterImportPlacementMode({
        boundingBox: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, elementCount: elements.length },
        prebuilt: { elements, links, assets: assetDownloads },
        dossierId: dossier.id,
      });
      handleClose();
    } catch (e) {
      console.error('JSON mapping import failed', e);
      setError(String(e));
      setCreating(false);
    }
    // snapshot() reads the edited state listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalImportCount, activeKey, configs, sources, included, autoConfigFor, planFor, parsed, ignoreEmpty, layout, t, handleClose,
    fieldSig, mapping, childMappings, labelTemplate, tagName, filters, filterMode, maxImport]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogA11y(isOpen, dialogRef, handleClose);

  if (!isOpen) return null;

  // Every checked table needs a label template (the open one as edited)
  const labelsOk = [...included].every((key) => (key === activeKey ? labelTemplate : (configs[key]?.labelTemplate ?? '{}')).trim().length > 0);
  const canImport = totalImportCount > 0 && labelsOk && !creating;

  return (
    <>
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-bg-primary border border-border-default sketchy-border-soft modal-shadow w-[92vw] max-w-3xl max-h-[88vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <div className="flex items-center gap-2">
            <FileJson size={16} className="text-text-secondary" />
            <h2 id={titleId} className="text-sm font-semibold text-text-primary">{t('importJsonMapping.title')}</h2>
          </div>
          <button onClick={handleClose} aria-label={t('common:actions.close')} className="p-1 hover:bg-bg-tertiary rounded transition-colors">
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
            {loadedInfo ? (
              <div className="flex items-center justify-between gap-2 px-2 py-2 text-xs bg-bg-secondary border border-border-default rounded">
                <span className="text-text-secondary truncate"><FileJson size={12} className="inline mr-1 text-text-tertiary" />{loadedInfo}</span>
                <button onClick={() => { setText(''); setParsed(null); setLoadedInfo(null); }} className="text-text-tertiary hover:text-text-secondary shrink-0">{t('importJsonMapping.clear')}</button>
              </div>
            ) : (
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); parse(e.target.value); }}
                placeholder={t('importJsonMapping.pastePlaceholder')}
                spellCheck={false}
                className="w-full h-28 px-2 py-1.5 text-xs font-mono bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary resize-y"
              />
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2 rounded bg-error/10 border border-error/30">
              <AlertCircle size={14} className="text-error shrink-0" />
              <span className="text-xs text-error">{error}</span>
            </div>
          )}

          {records.length > 0 && (
            <>
              {/* Templates (save / load / manage) */}
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium text-text-secondary">{t('importJsonMapping.template')}</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => {
                    const tpl = templates.find((x) => x.id === e.target.value);
                    setSelectedTemplateId(e.target.value);
                    if (tpl) applyConfig(tpl.config);
                  }}
                  className="px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                >
                  <option value="">{templates.length ? t('importJsonMapping.loadTemplate') : t('importJsonMapping.noTemplates')}</option>
                  {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                </select>
                {savingName === null ? (
                  <button onClick={() => setSavingName('')} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded border border-border-default">
                    <Save size={12} /> {t('importJsonMapping.saveTemplate')}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="text" value={savingName} autoFocus
                      onChange={(e) => setSavingName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTemplate(savingName); if (e.key === 'Escape') setSavingName(null); }}
                      placeholder={t('importJsonMapping.templateName')}
                      className="px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                    />
                    <button onClick={() => handleSaveTemplate(savingName)} disabled={!savingName.trim()} className="p-1 text-success hover:bg-bg-tertiary rounded disabled:opacity-40"><Check size={14} /></button>
                    <button onClick={() => setSavingName(null)} className="p-1 text-text-tertiary hover:bg-bg-tertiary rounded"><X size={14} /></button>
                  </span>
                )}
                <button onClick={() => setManagerOpen(true)} className="inline-flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded border border-border-default">
                  <FolderOpen size={12} /> {t('importJsonMapping.manage')}
                </button>
              </div>

              {/* Suggestion banner */}
              {suggestion && (
                <div className="flex items-center gap-2 p-2 rounded bg-accent/10 border border-accent/30">
                  <span className="text-xs text-text-primary flex-1">{t('importJsonMapping.suggestion', { name: suggestion.name })}</span>
                  <button onClick={() => { applyConfig(suggestion.config); setSelectedTemplateId(suggestion.id); }} className="px-2 py-1 text-xs bg-accent text-white rounded hover:bg-accent-hover">{t('importJsonMapping.apply')}</button>
                  <button onClick={() => setSuggestionDismissed(true)} className="px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary rounded">{t('importJsonMapping.dismiss')}</button>
                </div>
              )}

              {/* Tables: tick the ones to import, click one to set its mapping */}
              {sources.length > 1 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-text-secondary">{t('importJsonMapping.tables')}</label>
                  <div className="flex flex-wrap gap-1.5" data-testid="json-mapping-tables">
                    {sources.map((src) => {
                      const key = sourceKey(src);
                      const active = key === activeKey;
                      const on = included.has(key);
                      return (
                        <div
                          key={key}
                          className={`flex items-center gap-1.5 pl-2 pr-1 py-0.5 text-xs rounded border ${active ? 'border-accent bg-accent/10' : 'border-border-default bg-bg-primary'}`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggleIncluded(key)}
                            aria-label={t('importJsonMapping.includeTable', { name: sourceName(src, wholeObject) })}
                            className="rounded border-border-default"
                          />
                          <button
                            onClick={() => selectSource(key)}
                            className={`px-1 ${active ? 'text-text-primary font-medium' : 'text-text-secondary hover:text-text-primary'}`}
                          >
                            {sourceName(src, wholeObject)}
                            <span className="text-text-tertiary"> — {on ? (includedCounts.get(key) ?? 0) : src.length}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {!included.has(activeKey) && (
                    <p className="text-[10px] text-text-tertiary">{t('importJsonMapping.tableNotIncluded')}</p>
                  )}
                  {diagramTables.length >= 2 && (
                    <JsonTablesDiagram
                      tables={diagramTables}
                      activeKey={activeKey}
                      onOpen={selectSource}
                      onSetRef={setTableRef}
                    />
                  )}
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
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-text-secondary">{t('importJsonMapping.layout')}</label>
                  <select
                    value={layout}
                    onChange={(e) => setLayout(e.target.value as LayoutType)}
                    className="px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                  >
                    {LAYOUTS.map((l) => (
                      <option key={l} value={l}>{layoutLabel(l)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Import filter (multi-condition) + cap */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-text-secondary">{t('importJsonMapping.filter')}</label>
                  {filters.length > 1 && (
                    <select
                      value={filterMode}
                      onChange={(e) => setFilterMode(e.target.value as 'all' | 'any')}
                      className="px-1 py-0.5 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                    >
                      <option value="all">{t('importJsonMapping.filterAll')}</option>
                      <option value="any">{t('importJsonMapping.filterAny')}</option>
                    </select>
                  )}
                  <button onClick={addFilter} className="text-xs text-text-secondary hover:text-accent">+ {t('importJsonMapping.addCondition')}</button>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <label className="text-xs font-medium text-text-secondary">{t('importJsonMapping.max')}</label>
                    <input
                      type="number" min={0} value={maxImport}
                      onChange={(e) => setMaxImport(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-20 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                      title={t('importJsonMapping.maxHint')}
                    />
                  </div>
                </div>
                {filters.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={c.field}
                      onChange={(e) => updateFilter(i, { field: e.target.value })}
                      className="px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary max-w-[180px]"
                    >
                      <option value="">{t('importJsonMapping.filterField')}</option>
                      {scalarFields.map((f) => <option key={f.key} value={f.key}>{f.key}</option>)}
                    </select>
                    <select
                      value={c.op}
                      onChange={(e) => updateFilter(i, { op: e.target.value as FilterOp })}
                      className="px-1 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                    >
                      <option value="contains">{t('importJsonMapping.filterContains')}</option>
                      <option value="equals">{t('importJsonMapping.filterEquals')}</option>
                      <option value="nonempty">{t('importJsonMapping.filterNonEmpty')}</option>
                    </select>
                    {c.op !== 'nonempty' && (
                      <input
                        type="text" value={c.value}
                        onChange={(e) => updateFilter(i, { value: e.target.value })}
                        placeholder={t('importJsonMapping.filterValue')}
                        className="flex-1 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                      />
                    )}
                    <button onClick={() => removeFilter(i)} className="p-1 text-text-tertiary hover:text-error shrink-0"><X size={14} /></button>
                  </div>
                ))}
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
                  {scalarFields.map((f) => {
                    const m = mapping[f.key];
                    if (!m) return null;
                    const showKey = m.target === 'property' || m.target === 'date' || m.target === 'country' || m.target === 'ref' || m.target === 'link' || m.target === 'pivot';
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
                        {m.enabled && m.target === 'polygon' ? (
                          <select
                            value={m.coordOrder ?? 'latlng'}
                            onChange={(e) => setFieldOrder(f.key, e.target.value as CoordOrder)}
                            className="px-1 py-0.5 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                            title={t('importJsonMapping.coordOrder')}
                          >
                            <option value="latlng">lat, lng</option>
                            <option value="lnglat">lng, lat</option>
                          </select>
                        ) : showKey && m.enabled ? (
                          <div className="flex flex-col gap-1">
                            {m.target === 'ref' && tableSources.length > 1 && (
                              <select
                                value={m.refSource || activeKey}
                                onChange={(e) => setFieldRefSource(f.key, e.target.value === activeKey ? undefined : e.target.value)}
                                title={t('importJsonMapping.refTable')}
                                aria-label={t('importJsonMapping.refTable')}
                                className="px-1 py-0.5 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                              >
                                {tableSources.map((src) => (
                                  <option key={sourceKey(src)} value={sourceKey(src)}>→ {sourceName(src, wholeObject)}</option>
                                ))}
                              </select>
                            )}
                            {m.target === 'ref' && m.refSource && !included.has(m.refSource) && (
                              <span className="text-[10px] text-warning leading-tight">{t('importJsonMapping.refTableNotIncluded')}</span>
                            )}
                            <input
                              type="text"
                              value={m.propKey}
                              onChange={(e) => setFieldKey(f.key, e.target.value)}
                              placeholder={m.target === 'ref' ? t('importJsonMapping.linkLabel') : undefined}
                              className="px-1 py-0.5 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                            />
                          </div>
                        ) : <span />}
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-[10px] text-text-tertiary">{t('importJsonMapping.enabledCount', { enabled: scalarFields.filter((f) => mapping[f.key]?.enabled).length, total: scalarFields.length })}</p>

              {/* Linked sub-elements (array-of-objects fields) */}
              {childArrayFields.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-text-secondary">{t('importJsonMapping.subElements')}</label>
                    {childArrayFields.length > 1 && (
                      <label className="flex items-center gap-1.5 text-[11px] text-text-secondary cursor-pointer">
                        <input type="checkbox" checked={allChildrenEnabled} onChange={toggleAllChildren} className="rounded border-border-default" />
                        {t('importJsonMapping.toggleAll')}
                      </label>
                    )}
                  </div>
                  <p className="text-[10px] text-text-tertiary">{t('importJsonMapping.subElementsHint')}</p>
                  {childArrayFields.map((f) => {
                    const cm = childMappings[f.key];
                    if (!cm) return null;
                    const count = records.reduce((n, r) => n + (Array.isArray(r[f.key]) ? (r[f.key] as unknown[]).length : 0), 0);
                    return (
                      <div key={f.key} className={`border border-border-default rounded p-2 space-y-2 ${cm.enabled ? '' : 'opacity-60'}`}>
                        <label className="flex items-center gap-2 text-xs">
                          <input type="checkbox" checked={cm.enabled} onChange={(e) => setChild(f.key, { enabled: e.target.checked })} className="rounded border-border-default" />
                          <span className="font-mono text-text-primary">{f.key}</span>
                          <span className="text-text-tertiary">— {t('importJsonMapping.subElementsCount', { count })}</span>
                        </label>
                        {cm.enabled && (
                          <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 pl-6">
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-text-tertiary">{t('importJsonMapping.childTag')}</span>
                              <input type="text" value={cm.tag} onChange={(e) => setChild(f.key, { tag: e.target.value })} className="px-1 py-0.5 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary" />
                            </label>
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-text-tertiary">{t('importJsonMapping.childLabel')}</span>
                              <input type="text" value={cm.labelTemplate} onChange={(e) => setChild(f.key, { labelTemplate: e.target.value })} className="px-1 py-0.5 text-xs font-mono bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary" />
                            </label>
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-text-tertiary">{t('importJsonMapping.linkLabel')}</span>
                              <input type="text" value={cm.linkLabel} onChange={(e) => setChild(f.key, { linkLabel: e.target.value })} className="px-1 py-0.5 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary" />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {recordCount > SAMPLE && (
                <p className="text-[10px] text-warning">{t('importJsonMapping.largeNotice', { sample: SAMPLE, count: recordCount })}</p>
              )}

              {/* Preview */}
              <div className="text-xs text-text-secondary">
                {t('importJsonMapping.willCreate', { count: included.size > 1 ? totalImportCount : importCount })}
                {included.size > 1 && <span className="text-text-tertiary"> ({t('importJsonMapping.fromTables', { count: included.size })})</span>}
                {matchedCount !== recordCount && <span className="text-text-tertiary"> ({t('importJsonMapping.matchedOf', { matched: matchedCount, total: recordCount })})</span>}
                {importCount < matchedCount && <span className="text-warning"> — {t('importJsonMapping.capped', { max: maxImport })}</span>}
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
    <JsonMappingManagerModal isOpen={managerOpen} onClose={() => setManagerOpen(false)} />
    </>
  );
}
