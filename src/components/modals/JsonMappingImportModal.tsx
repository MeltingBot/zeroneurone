import { useState, useMemo, useEffect, useCallback, useRef, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileJson, AlertCircle, Save, FolderOpen, Check } from 'lucide-react';
import { useDossierStore, useTagSetStore, useJsonMappingStore, toast } from '../../stores';
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
  type TableConfig,
  type FilterCond,
  type FilterOp,
  type EventMapping,
  buildEvent,
  recordDate,
  guessEventFields,
} from '../../utils/jsonMapping';
import { computePolygonCenter, parseLatLngPair } from '../../utils/geo';
import { layoutService, CIRCULAR_MAX_ELEMENTS, type LayoutType } from '../../services/layoutService';
import { JsonMappingManagerModal } from './JsonMappingManagerModal';
import { TagCombobox } from './TagCombobox';
import { JsonTablesDiagram, type DiagramTable } from './JsonTablesDiagram';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { csvToRecords } from '../../utils/csv';

const LAYOUTS: LayoutType[] = ['force', 'clusters', 'hierarchy', 'circular', 'grid'];
const layoutLabel = (l: LayoutType): string => (l === 'hierarchy' ? 'Hiérarchie' : layoutService.getLayoutName(l));

interface JsonMappingImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fill and parse this JSON or CSV when the modal opens (e.g. from a paste). */
  initialJson?: string;
  /** File name of the initial content: a .csv/.tsv name reads it as CSV and names its table */
  initialName?: string;
}

/**
 * Records of a CSV, as one table named after the file: the mapping then
 * works on it as on a JSON array. Null when the text is not a CSV with a
 * header and at least one row (a pasted text needs two columns at least).
 */
function csvAsTable(raw: string, name: string | undefined): Record<string, Record<string, string>[]> | null {
  const isCsvName = !!name && /\.(csv|tsv)$/i.test(name);
  const { headers, records } = csvToRecords(raw);
  if (records.length === 0 || (!isCsvName && headers.length < 2)) return null;
  const table = name ? name.replace(/\.[^.]+$/, '') : 'csv';
  return { [table || 'csv']: records };
}

const TARGETS: MappingTarget[] = ['property', 'number', 'date', 'country', 'link', 'asset', 'notes', 'source', 'lat', 'lng', 'latlng', 'id', 'ref', 'pivot', 'polygon'];

// Large-file handling: sample records for the UI (detection/preview), but import them all.
const SAMPLE = 2000;           // records used for field detection / preview
const LAYOUT_CAP = 3000;       // skip auto-layout above this element count (force layout too slow)
const LARGE_TEXT = 1_000_000;  // chars: above this, don't render the JSON in the textarea


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
  /** Reference field whose target element receives the records (no element per record) */
  mergeField?: string;
  /** Records are events of an element rather than elements */
  events?: EventMapping;
}

/**
 * The table a table's records are folded into, when its merge field is a
 * reference to another imported table; null otherwise (one element per record).
 */
function mergeTargetOf(key: string, cfg: Pick<SourceConfig, 'mergeField' | 'mapping'>, included: Set<string>): string | null {
  const m = cfg.mergeField ? cfg.mapping[cfg.mergeField] : undefined;
  if (!m?.enabled || m.target !== 'ref' || !m.refSource || m.refSource === key || !included.has(m.refSource)) return null;
  return m.refSource;
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

export function JsonMappingImportModal({ isOpen, onClose, initialJson, initialName }: JsonMappingImportModalProps) {
  const { t } = useTranslation('modals');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedInfo, setLoadedInfo] = useState<string | null>(null);
  // File the content came from: tells CSV from JSON and names the CSV table
  const [contentFile, setContentFile] = useState<string | undefined>(undefined);
  // The content is a CSV (one table; its templates apart from JSON ones)
  const [fromCsv, setFromCsv] = useState(false);
  // Source of what the import creates: the file name, or free text
  const [importSource, setImportSource] = useState('');
  const [srcKey, setSrcKey] = useState('');
  // Several tables: each keeps its own config, the checked ones are imported together
  const [configs, setConfigs] = useState<Record<string, SourceConfig>>({});
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [mapping, setMapping] = useState<Record<string, FieldMapping>>({});
  const [childMappings, setChildMappings] = useState<Record<string, ChildMapping>>({});
  const [labelTemplate, setLabelTemplate] = useState('');
  const [tagName, setTagName] = useState('');
  const [mergeField, setMergeField] = useState<string | undefined>(undefined);
  const [eventMapping, setEventMapping] = useState<EventMapping | undefined>(undefined);
  const [ignoreEmpty, setIgnoreEmpty] = useState(true);
  const [layout, setLayout] = useState<LayoutType>('force');
  const [creating, setCreating] = useState(false);

  // Import filter (multi-condition) + cap (to keep large datasets manageable)
  const [filters, setFilters] = useState<FilterCond[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'any'>('all');
  const [maxImport, setMaxImport] = useState(2000);

  // Saved templates (phase 2a)
  const allTemplates = useJsonMappingStore((s) => s.templates);
  const loadTemplates = useJsonMappingStore((s) => s.load);
  const saveTemplate = useJsonMappingStore((s) => s.save);
  const updateTemplate = useJsonMappingStore((s) => s.update);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  useEffect(() => { if (isOpen) loadTemplates(); }, [isOpen, loadTemplates]);

  const reset = useCallback(() => {
    setText(''); setParsed(null); setError(null); setLoadedInfo(null); setContentFile(undefined); setFromCsv(false); setImportSource(''); setSrcKey(''); setConfigs({}); setIncluded(new Set());
    setMapping({}); setChildMappings({}); setLabelTemplate(''); setTagName(''); setMergeField(undefined); setEventMapping(undefined); setIgnoreEmpty(true); setLayout('force'); setCreating(false);
    setSavingName(null); setSuggestionDismissed(false); setSelectedTemplateId('');
    setFilters([]); setFilterMode('all'); setMaxImport(2000);
  }, []);

  const handleClose = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  // Possible record sources (arrays of objects + whole-object-as-single-record)
  // A CSV is one table: the object wrapping it is no record of its own
  const sources = useMemo(
    () => (parsed != null ? findRecordSources(parsed).filter((src) => !(fromCsv && src.kind === 'single')) : []),
    [parsed, fromCsv],
  );
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
  // The cap keeps the canvas usable: events add no element, so it does not apply to them
  const importCount = maxImport > 0 && !eventMapping ? Math.min(matchedCount, maxImport) : matchedCount;

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
  const snapshot = (): SourceConfig => ({ fieldSig, mapping, childMappings, labelTemplate, tagName, filters, filterMode, maxImport, mergeField, events: eventMapping });

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
    setMergeField(cfg.mergeField);
    setEventMapping(cfg.events);
    setSuggestionDismissed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldSig, activeKey]);

  // Signature of the current shape + best-matching saved template (suggestion).
  const signature = useMemo(() => computeSignature(fields), [fields]);
  // Templates of the same format only: a CSV template is no use on JSON, and
  // back. One saved before formats were told apart was made on JSON (the
  // only format then), unless its fields match this CSV's columns.
  const templates = useMemo(() => allTemplates.filter((tpl) => {
    const format = fromCsv ? 'csv' : 'json';
    if (tpl.config.format) return tpl.config.format === format;
    return format === 'json' || signatureOverlap(tpl.signature, signature) >= 0.6;
  }), [allTemplates, fromCsv, signature]);
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
  // A multi-table template sets every table of the payload it knows, and the
  // tables to import together; an older one sets the open table only.
  const applyConfig = useCallback((cfg: MappingConfig) => {
    const keep = <T,>(current: Record<string, T>, saved: Record<string, T>) => {
      const nxt = { ...current };
      for (const k of Object.keys(saved)) if (nxt[k]) nxt[k] = saved[k];
      return nxt;
    };
    // A table is found by its name; a one-table payload (a CSV, named after
    // its file) takes the settings of the table open at save time whatever
    // its name, so that the template works on the next file of the same kind
    const own = cfg.tables?.[activeKey] ?? (!cfg.tables || tableSources.length === 1 ? cfg : null);
    setIgnoreEmpty(cfg.ignoreEmpty);
    setLayout((LAYOUTS.includes(cfg.layout as LayoutType) ? cfg.layout : 'force') as LayoutType);
    if (own) {
      setLabelTemplate(own.labelTemplate);
      setTagName(own.tagName);
      setMapping((prev) => keep(prev, own.mapping));
      setChildMappings((prev) => keep(prev, own.childMappings));
      if (own.filters) setFilters(own.filters);
      if (own.filterMode) setFilterMode(own.filterMode);
      if (own.maxImport !== undefined) setMaxImport(own.maxImport);
      setMergeField(own.mergeField);
      setEventMapping(own.events);
    }
    if (cfg.tables) {
      const present = new Set(sources.map((src) => sourceKey(src)));
      const others: Record<string, SourceConfig> = {};
      for (const [key, saved] of Object.entries(cfg.tables)) {
        if (key === activeKey || !present.has(key)) continue;
        const base = configs[key] ?? autoConfigFor(key);
        if (!base) continue;
        others[key] = {
          ...base,
          labelTemplate: saved.labelTemplate,
          tagName: saved.tagName,
          mapping: keep(base.mapping, saved.mapping),
          childMappings: keep(base.childMappings, saved.childMappings),
          filters: saved.filters ?? base.filters,
          filterMode: saved.filterMode ?? base.filterMode,
          maxImport: saved.maxImport ?? base.maxImport,
          mergeField: saved.mergeField,
          events: saved.events,
        };
      }
      setConfigs((c) => ({ ...c, ...others }));
      const inc = (cfg.included ?? []).filter((key) => present.has(key));
      if (inc.length > 0) setIncluded(new Set(inc));
    }
    setSuggestionDismissed(true);
  }, [activeKey, sources, tableSources, configs, autoConfigFor]);

  // With a template selected, saving updates it; otherwise it asks for a name
  // and creates one (`name`).
  const handleSaveTemplate = useCallback(async (name: string | null) => {
    const selected = templates.find((x) => x.id === selectedTemplateId);
    const n = name?.trim() ?? '';
    if (!selected && !n) return;
    // Every checked table, the open one as being edited
    const all: Record<string, SourceConfig> = { ...configs, [activeKey]: snapshot() };
    const tables: Record<string, TableConfig> = {};
    for (const key of new Set([activeKey, ...included])) {
      const c = all[key] ?? autoConfigFor(key);
      if (!c) continue;
      tables[key] = {
        labelTemplate: c.labelTemplate, tagName: c.tagName, mapping: c.mapping, childMappings: c.childMappings,
        filters: c.filters, filterMode: c.filterMode, maxImport: c.maxImport, mergeField: c.mergeField,
        events: c.events,
      };
    }
    // Updating: keep the template's tables this payload does not have
    const present = new Set(sources.map((src) => sourceKey(src)));
    const kept = Object.entries(selected?.config.tables ?? {}).filter(([key]) => !present.has(key));
    const config: MappingConfig = {
      labelTemplate, tagName, ignoreEmpty, layout, mapping, childMappings,
      filters, filterMode, maxImport, mergeField, events: eventMapping,
      format: fromCsv ? 'csv' : 'json',
      tables: { ...Object.fromEntries(kept), ...tables }, included: [...included],
    };
    try {
      if (selected) {
        await updateTemplate(selected.id, { signature, config });
        setTemplateSaved(true);
        setTimeout(() => setTemplateSaved(false), 1500);
      } else {
        const tpl = await saveTemplate(n, signature, config);
        setSelectedTemplateId(tpl.id);
      }
      setSavingName(null);
      setError(null);
    } catch (e) {
      console.error('Save mapping template failed', e);
      setError(t('importJsonMapping.saveTemplateError'));
    }
    // snapshot() reads the edited state listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelTemplate, tagName, ignoreEmpty, layout, mapping, childMappings, signature, saveTemplate, t,
    configs, activeKey, included, autoConfigFor, fieldSig, filters, filterMode, maxImport, mergeField, eventMapping, fromCsv,
    templates, selectedTemplateId, sources, updateTemplate]);

  const parse = useCallback((raw: string, name?: string) => {
    if (!raw.trim()) { setError(null); setParsed(null); return; }
    try {
      // JSON first, unless the file says CSV; a text that is not JSON may be CSV
      let data: unknown;
      const csvFirst = !!name && /\.(csv|tsv)$/i.test(name);
      if (!csvFirst) {
        try { data = JSON.parse(raw); } catch { data = undefined; }
      }
      setFromCsv(data === undefined);
      if (data === undefined) {
        data = csvAsTable(raw, name);
        if (data === null) throw new Error('not JSON nor CSV');
      }
      setError(null);
      setParsed(data);
      const srcs = findRecordSources(data);
      const def = pickDefaultSource(srcs);
      setSrcKey(def ? sourceKey(def) : '');
      setConfigs({});
      setIncluded(new Set(def ? [sourceKey(def)] : []));
      setSelectedTemplateId('');
      if (!def) setError(t('importJsonMapping.noArray'));
    } catch {
      setParsed(null);
      setError(t('importJsonMapping.invalidJson'));
    }
  }, [t]);

  // Load content: above LARGE_TEXT, keep it OUT of the textarea (10 MB in a
  // controlled textarea freezes the UI) — show an info banner instead.
  const loadContent = useCallback((content: string, label: string | null, name?: string) => {
    if (content.length > LARGE_TEXT) {
      setText('');
      setLoadedInfo(label ?? `${(content.length / 1048576).toFixed(1)} Mo`);
    } else {
      setText(content);
      setLoadedInfo(null);
    }
    setContentFile(name);
    setImportSource(name ?? '');
    parse(content, name);
  }, [parse]);

  const handleFile = useCallback(async (file: File) => {
    const content = await file.text();
    loadContent(content, `${file.name} — ${(file.size / 1048576).toFixed(1)} Mo`, file.name);
  }, [loadContent]);

  // Pre-fill from a paste when the modal opens
  useEffect(() => {
    if (isOpen && initialJson) {
      // A file shows its name rather than its content
      loadContent(initialJson, initialName ? `${initialName} — ${(initialJson.length / 1048576).toFixed(1)} Mo` : null, initialName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialJson, initialName]);

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
    const capped = cfg.maxImport > 0 && !cfg.events ? filtered.slice(0, cfg.maxImport) : filtered;
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
  // References of the open table to another checked table: each can carry
  // its records into the element they point to
  const mergeSelectId = useId();
  const recordAsId = useId();
  const importSourceId = useId();

  // Switching to events: the date is the first date field, the element the
  // first other field (both changed in the selects)
  const setRecordAs = (as: 'element' | 'event') => {
    if (as === 'element') { setEventMapping(undefined); return; }
    const isDate = (k: string) => mapping[k]?.target === 'date' || guessTarget(k) === 'date';
    const guess = guessEventFields(records, scalarFields, isDate);
    setEventMapping({ hostField: guess.hostField, dateField: guess.dateField });
    // The element's name labelled every record: an event wants its kind instead
    setLabelTemplate(guess.labelTemplate);
  };
  const mergeCandidates = useMemo(() => scalarFields
    .filter((f) => {
      const m = mapping[f.key];
      return m?.enabled && m.target === 'ref' && !!m.refSource && m.refSource !== activeKey && included.has(m.refSource);
    })
    .map((f) => {
      const src = sources.find((x) => sourceKey(x) === mapping[f.key].refSource);
      return { field: f.key, table: src ? sourceName(src, wholeObject) : String(mapping[f.key].refSource) };
    }), [scalarFields, mapping, activeKey, included, sources, wholeObject]);

  // Records of a table folded into another one create no element
  const mergedTables = useMemo(() => {
    const merged = new Set<string>();
    for (const key of included) {
      const cfg = key === activeKey ? { mapping, mergeField } : configs[key];
      if (cfg && mergeTargetOf(key, cfg, included)) merged.add(key);
    }
    return merged;
  }, [included, activeKey, mapping, mergeField, configs]);
  const totalImportCount = [...includedCounts.entries()].reduce((sum, [key, n]) => sum + (mergedTables.has(key) ? 0 : n), 0);

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
    // Tables folded into another one come after it: their records look up
    // the elements it created
    const mergeTargets = new Map(plans.map((p) => [p.key, mergeTargetOf(p.key, p.cfg, included)]));
    // Event tables last too: their element may be one of another table
    const rank = (p: (typeof plans)[number]) => (mergeTargets.get(p.key) || p.cfg.events ? 1 : 0);
    plans.sort((a, b) => rank(a) - rank(b));
    let skippedEvents = 0;
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
      const pivotLinked = new Set<string>();

      const buildProps = (flat: Record<string, unknown>, fieldList: FieldInfo[], getMap: (k: string) => FieldMapping | undefined) => {
        const properties: Property[] = [];
        let source = '';
        const notesParts: { key: string; text: string }[] = [];
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
            case 'notes': notesParts.push({ key: propKey, text: String(coerced) }); break;
            case 'lat': lat = coerced as number; break;
            case 'lng': lng = coerced as number; break;
            case 'date': properties.push({ key: propKey, value: coerced as Date, type: 'date' }); break;
            case 'number': properties.push({ key: propKey, value: coerced, type: typeof coerced === 'number' ? 'number' : 'text' }); break;
            case 'country': properties.push({ key: propKey, value: coerced as string, type: 'country' }); break;
            case 'link': properties.push({ key: propKey, value: coerced as string, type: 'link' }); break;
            default: properties.push({ key: propKey, value: coerced as string, type: 'text' });
          }
        }
        // Several fields mapped to the notes: each paragraph names its field,
        // on every element alike (even when a record fills only one of them).
        const notesFields = fieldList.filter((f) => { const m = getMap(f.key); return m?.enabled && m.target === 'notes'; }).length;
        const notes = notesParts
          .map((p) => (notesFields > 1 ? `**${p.key}** : ${p.text}` : p.text))
          .join('\n\n');
        return { properties, source, notes, lat, lng };
      };

      const mkElement = (partial: Partial<Element> & { label: string; visual: ElementVisual; position: { x: number; y: number } }): Element => ({
        id: crypto.randomUUID(), dossierId: dossier.id, label: partial.label, notes: partial.notes ?? '', tags: partial.tags ?? [],
        properties: partial.properties ?? [], confidence: null, source: partial.source ?? '', date: null, dateRange: null,
        position: partial.position, isPositionLocked: false, geo: partial.geo ?? null, events: [],
        visual: partial.visual, assetIds: [], parentGroupId: null, isGroup: false, isAnnotation: false, childIds: [],
        createdAt: now, updatedAt: now,
      });

      // Per table: id value → element, and the parent element of each record
      const idMaps = new Map<string, Map<string, string>>();
      const elementById = new Map<string, Element>();
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
        // Records as events: the element and date fields are read apart, and
        // what only makes sense for an element of its own (id, references,
        // media) is left out; pivots still create and link their elements
        const ev = cfg.events?.hostField && cfg.events.dateField ? cfg.events : undefined;
        const hostRef = ev ? cfg.mapping[ev.hostField] : undefined;
        const hostRefIds = hostRef?.enabled && hostRef.target === 'ref' && hostRef.refSource && hostRef.refSource !== plan.key
          ? idMaps.get(hostRef.refSource) : undefined;
        if (ev) {
          for (const [k, m] of Object.entries(mapping)) {
            if (k === ev.hostField || k === ev.dateField || k === ev.endField || ['id', 'ref', 'asset'].includes(m.target)) {
              mapping[k] = { ...m, enabled: false };
            }
          }
        }
        // Event tables: one element per distinct value, whether the value is
        // the event's element or a pivot (a phone number calls and is called)
        const byValue = new Map<string, Element>();
        const withTag = (el: Element, tag: string) => { if (tag && !el.tags.includes(tag)) el.tags.push(tag); return el; };
        const flats = plan.raw.map((r) => flattenRecord(r));
        const { scalarFields: scalar, childArrayFields: childArrays } = fieldsOf(rawRecordsForSource(parsed, plan.src));
        const tn = cfg.tagName.trim();
        const parentVisual = await ensureVisual(tn);

        // Resolve visuals for each enabled child-array field's tag.
        const enabledChildren = childArrays.filter((f) => cfg.childMappings[f.key]?.enabled && (cfg.childMappings[f.key]?.asEvents || cfg.childMappings[f.key]?.tag.trim()));
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
        // Folded into another table: id value → element of that table
        const mergeKey = mergeTargets.get(plan.key);
        const hostIds = mergeKey ? idMaps.get(mergeKey) : undefined;

        // Pivot nodes: link a record's element to a dedup'd node per shared value
        const addPivots = (flat: Record<string, unknown>, parent: Element): Element[] => {
          const touched: Element[] = [];
          for (const pf of pivotFields) {
            const tag = pivotTagOf(pf.key);
            const raw = flat[pf.key];
            const vals = Array.isArray(raw) ? raw : (isBlank(raw) ? [] : [raw]);
            for (const v of vals) {
              const val = valueToString(v).trim();
              if (!val) continue;
              const key = `${tag}\u0000${val}`;
              let pivot = ev ? byValue.get(val) : pivotByKey.get(key);
              if (pivot) withTag(pivot, tag);
              if (!pivot) {
                pivot = mkElement({
                  label: val,
                  tags: tag ? [tag] : [],
                  visual: { ...pivotVisuals[pf.key] },
                  position: { x: -360, y: (pivotIdx++) * 130 },
                });
                elements.push(pivot);
                pivotByKey.set(key, pivot);
                if (ev) byValue.set(val, pivot);
              }
              if (pivot.id === parent.id) continue;
              touched.push(pivot);
              // One link per pair, in either direction, however many records
              // share it (A calls B, then B calls A: one link)
              const pair = [parent.id, pivot.id].sort().join('|');
              if (pivotLinked.has(pair)) continue;
              pivotLinked.add(pair);
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
          return touched;
        };

        // Linked children from array-of-objects fields, or events of the
        // record's element when the field is set to events
        const addChildren = (flat: Record<string, unknown>, parent: Element) => {
          let childIdx = 0;
          for (const f of enabledChildren) {
            const cm = cfg.childMappings[f.key];
            const arr = flat[f.key];
            if (!Array.isArray(arr)) continue;
            const subFields = childFieldsOf([flat], f.key);
            for (const item of arr) {
              if (item == null || typeof item !== 'object') continue;
              const childFlat = flattenRecord(item);
              if (cm.asEvents) {
                // Dated by its first field named like a date, else the first holding one
                const dateKey = Object.keys(childFlat).find((k) => guessTarget(k) === 'date' && recordDate(childFlat[k]))
                  ?? Object.keys(childFlat).find((k) => typeof childFlat[k] === 'string' && recordDate(childFlat[k]));
                if (!dateKey) { skippedEvents++; continue; }
                const others = subFields.filter((sf) => lastSegment(sf.key) !== dateKey && sf.key !== dateKey);
                const ep = buildProps(childFlat, others, (k) => ({ enabled: true, target: 'property', propKey: lastSegment(k) }));
                const event = buildEvent(childFlat, applyTemplate(cm.labelTemplate, childFlat) || lastSegment(f.key), { dateField: dateKey },
                  { properties: ep.properties.filter((pr) => pr.key !== dateKey), source: ep.source, notes: ep.notes, geo: null });
                if (event) parent.events.push(event); else skippedEvents++;
                continue;
              }
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
        };

        flats.forEach((flat, i) => {
          const { properties, source, notes, lat, lng } = buildProps(flat, scalar, (k) => mapping[k]);
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
          // Event record: dated, on the element its element field names
          // (another table's element for a reference, else one per value)
          if (ev) {
            const hostVal = valueToString(flat[ev.hostField]).trim();
            const label = applyTemplate(cfg.labelTemplate, flat) || tn || hostVal;
            const event = hostVal ? buildEvent(flat, label, ev, { properties, source, notes, geo }) : null;
            if (!event) { skippedEvents++; return; }
            let eventHost = hostRefIds ? elementById.get(hostRefIds.get(idKey(flat[ev.hostField])) ?? '') : undefined;
            if (!eventHost) {
              eventHost = byValue.get(hostVal);
              if (eventHost) withTag(eventHost, tn);
              if (!eventHost) {
                const n = byValue.size;
                eventHost = mkElement({
                  label: hostVal, tags: tn ? [tn] : [], visual: { ...parentVisual },
                  position: { x: (n % cols) * 380, y: originY + Math.floor(n / cols) * 320 },
                });
                elements.push(eventHost);
                elementById.set(eventHost.id, eventHost);
                byValue.set(hostVal, eventHost);
              }
            }
            eventHost.events.push(event);
            // The event also goes on the pivots (a call shows on both numbers)
            for (const pivot of addPivots(flat, eventHost)) {
              if (ev.alsoOnPivots !== false) pivot.events.push({ ...event, id: crypto.randomUUID() });
            }
            addChildren(flat, eventHost);
            return;
          }
          // Folded record: its fields go to the element it refers to, which
          // also takes its sub-elements, pivots and links below. Without a
          // match it stays an element of its own, so nothing is lost.
          const host = hostIds && cfg.mergeField
            ? elementById.get(hostIds.get(idKey(flat[cfg.mergeField])) ?? '')
            : undefined;
          let parent: Element;
          if (host) {
            host.properties.push(...properties);
            if (source) host.source = host.source ? `${host.source} | ${source}` : source;
            if (notes) host.notes = host.notes ? `${host.notes}\n\n${notes}` : notes;
            if (geo && !host.geo) host.geo = geo;
            parent = host;
          } else {
            parent = mkElement({
              label: applyTemplate(cfg.labelTemplate, flat) || t('importJsonMapping.noLabel'),
              tags: tn ? [tn] : [], properties, source, notes, geo,
              visual: { ...parentVisual },
              position: { x: (i % cols) * 380, y: originY + Math.floor(i / cols) * 320 },
            });
            elements.push(parent);
            elementById.set(parent.id, parent);
          }
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
        // One ring of that many elements cannot be seen whole: grid instead
        const applied = layout === 'circular' && elements.length > CIRCULAR_MAX_ELEMENTS ? 'grid' : layout;
        const { positions } = layoutService.applyLayout(applied, elements, links);
        for (const el of elements) {
          const p = positions.get(el.id);
          if (p) el.position = p;
        }
      }

      // The import's source on what has none of its own (a source column wins)
      const src = importSource.trim();
      if (src) {
        for (const el of elements) {
          if (!el.source) el.source = src;
          for (const ev of el.events) if (!ev.source) ev.source = src;
        }
        for (const l of links) if (!l.source) l.source = src;
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
      if (skippedEvents > 0) toast.warning(t('importJsonMapping.eventsSkipped', { count: skippedEvents }));
      handleClose();
    } catch (e) {
      console.error('JSON mapping import failed', e);
      setError(String(e));
      setCreating(false);
    }
    // snapshot() reads the edited state listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalImportCount, activeKey, configs, sources, included, autoConfigFor, planFor, parsed, ignoreEmpty, layout, t, handleClose,
    fieldSig, mapping, childMappings, labelTemplate, tagName, filters, filterMode, maxImport, mergeField, eventMapping, importSource]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogA11y(isOpen, dialogRef, handleClose);

  if (!isOpen) return null;

  // Every checked table needs a label template (the open one as edited)
  const labelsOk = [...included].every((key) => {
    const cfg = key === activeKey ? { labelTemplate, events: eventMapping } : configs[key];
    // An event takes the tag or the element's name when its template is empty
    if (cfg?.events) return !!cfg.events.hostField && !!cfg.events.dateField;
    return (cfg?.labelTemplate ?? '{}').trim().length > 0;
  });
  const canImport = totalImportCount > 0 && labelsOk && !creating;

  return (
    <>
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="json-mapping-modal"
        className="bg-bg-primary border border-border-default sketchy-border-soft modal-shadow w-[92vw] max-w-4xl max-h-[88vh] flex flex-col"
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
                accept=".json,application/json,.txt,.csv,text/csv,.tsv"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                className="hidden"
              />
            </div>
            {loadedInfo ? (
              <div className="flex items-center justify-between gap-2 px-2 py-2 text-xs bg-bg-secondary border border-border-default rounded">
                <span className="text-text-secondary truncate"><FileJson size={12} className="inline mr-1 text-text-tertiary" />{loadedInfo}</span>
                <button onClick={() => { setText(''); setParsed(null); setLoadedInfo(null); setContentFile(undefined); }} className="text-text-tertiary hover:text-text-secondary shrink-0">{t('importJsonMapping.clear')}</button>
              </div>
            ) : (
              <textarea
                value={text}
                onChange={(e) => { setText(e.target.value); parse(e.target.value, contentFile); }}
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
                  data-testid="json-mapping-template"
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
                  <button
                    onClick={() => (templates.some((x) => x.id === selectedTemplateId) ? handleSaveTemplate(null) : setSavingName(''))}
                    data-testid="json-mapping-save-template"
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded border border-border-default"
                  >
                    {templateSaved ? <Check size={12} className="text-success" /> : <Save size={12} />} {t('importJsonMapping.saveTemplate')}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="text" value={savingName} autoFocus
                      data-testid="json-mapping-template-name"
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

              {/* Each record: an element, or an event of an element */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label htmlFor={recordAsId} className="text-xs font-medium text-text-secondary">{t('importJsonMapping.recordAs')}</label>
                  <select
                    id={recordAsId}
                    value={eventMapping ? 'event' : 'element'}
                    onChange={(e) => setRecordAs(e.target.value as 'element' | 'event')}
                    data-testid="json-mapping-record-as"
                    className="px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                  >
                    <option value="element">{t('importJsonMapping.recordAsElement')}</option>
                    <option value="event">{t('importJsonMapping.recordAsEvent')}</option>
                  </select>
                </div>
                {eventMapping && ([
                  ['hostField', 'eventHost', false],
                  ['dateField', 'eventDate', false],
                  ['endField', 'eventEnd', true],
                ] as const).map(([key, labelKey, optional]) => (
                  <label key={key} className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-secondary">{t(`importJsonMapping.${labelKey}`)}</span>
                    <select
                      value={eventMapping[key] ?? ''}
                      onChange={(e) => setEventMapping({ ...eventMapping, [key]: e.target.value || undefined })}
                      data-testid={`json-mapping-${key}`}
                      className="max-w-[160px] px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                    >
                      {optional && <option value="">{t('importJsonMapping.eventEndNone')}</option>}
                      {scalarFields.map((f) => <option key={f.key} value={f.key}>{f.key}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {eventMapping && (
                <>
                  <label className="flex items-center gap-1.5 text-xs text-text-secondary -mt-1">
                    <input
                      type="checkbox"
                      checked={eventMapping.alsoOnPivots !== false}
                      onChange={(e) => setEventMapping({ ...eventMapping, alsoOnPivots: e.target.checked })}
                      data-testid="json-mapping-event-on-pivots"
                      className="rounded border-border-default"
                    />
                    {t('importJsonMapping.eventOnPivots')}
                  </label>
                  <p className="text-[10px] text-text-tertiary -mt-2">{t('importJsonMapping.recordAsEventHint')}</p>
                </>
              )}

              {/* Label template */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">{t(eventMapping ? 'importJsonMapping.eventLabelTemplate' : 'importJsonMapping.labelTemplate')}</label>
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
                  <TagCombobox
                    value={tagName}
                    onChange={setTagName}
                    placeholder={t('importJsonMapping.tagPlaceholder')}
                    aria-label={t('importJsonMapping.tag')}
                    className="px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor={importSourceId} className="text-xs font-medium text-text-secondary">{t('importJsonMapping.importSource')}</label>
                  <input
                    id={importSourceId}
                    type="text"
                    value={importSource}
                    onChange={(e) => setImportSource(e.target.value)}
                    placeholder={t('importJsonMapping.importSourcePlaceholder')}
                    data-testid="json-mapping-source"
                    className="w-48 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                  />
                </div>
                {mergeCandidates.length > 0 && !eventMapping && (
                  <div className="flex items-center gap-2">
                    <label htmlFor={mergeSelectId} className="text-xs font-medium text-text-secondary">{t('importJsonMapping.mergeInto')}</label>
                    <select
                      id={mergeSelectId}
                      value={mergeCandidates.some((c) => c.field === mergeField) ? mergeField : ''}
                      onChange={(e) => setMergeField(e.target.value || undefined)}
                      data-testid="json-mapping-merge"
                      className="px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                    >
                      <option value="">{t('importJsonMapping.mergeNone')}</option>
                      {mergeCandidates.map((c) => (
                        <option key={c.field} value={c.field}>{c.table} ({c.field})</option>
                      ))}
                    </select>
                  </div>
                )}
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
                  {!eventMapping && <div className="flex items-center gap-1.5 ml-auto">
                    <label className="text-xs font-medium text-text-secondary">{t('importJsonMapping.max')}</label>
                    <input
                      type="number" min={0} value={maxImport}
                      onChange={(e) => setMaxImport(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-20 px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary"
                      title={t('importJsonMapping.maxHint')}
                    />
                  </div>}
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
                    const showKey = m.target === 'property' || m.target === 'date' || m.target === 'country' || m.target === 'ref' || m.target === 'link' || m.target === 'pivot' || m.target === 'notes';
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
                          data-testid={`json-mapping-target-${f.key}`}
                          className="px-1 py-0.5 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary disabled:opacity-60"
                        >
                          {TARGETS.map((tg) => (
                            <option key={tg} value={tg} disabled={!!eventMapping && ['id', 'ref', 'asset'].includes(tg)}>{t(`importJsonMapping.targets.${tg}`)}</option>
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
                          <label className="flex items-center gap-2 pl-6 text-xs text-text-secondary">
                            <input type="checkbox" checked={!!cm.asEvents} onChange={(e) => setChild(f.key, { asEvents: e.target.checked })} className="rounded border-border-default" />
                            {t('importJsonMapping.childAsEvents')}
                          </label>
                        )}
                        {cm.enabled && cm.asEvents && (
                          <label className="flex flex-col gap-0.5 pl-6">
                            <span className="text-[10px] text-text-tertiary">{t('importJsonMapping.eventLabelTemplate')}</span>
                            <input type="text" value={cm.labelTemplate} onChange={(e) => setChild(f.key, { labelTemplate: e.target.value })} className="px-1 py-0.5 text-xs font-mono bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary" />
                          </label>
                        )}
                        {cm.enabled && !cm.asEvents && (
                          <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 pl-6">
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-text-tertiary">{t('importJsonMapping.childTag')}</span>
                              <TagCombobox value={cm.tag} onChange={(tag) => setChild(f.key, { tag })} aria-label={t('importJsonMapping.childTag')} className="w-full px-1 py-0.5 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary" />
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
                {eventMapping && included.size <= 1
                  ? t('importJsonMapping.willCreateEvents', { count: importCount })
                  : t('importJsonMapping.willCreate', { count: included.size > 1 ? totalImportCount : importCount })}
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
            data-testid="json-mapping-import"
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
