import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, FileJson, AlertCircle } from 'lucide-react';
import { useDossierStore, useTagSetStore } from '../../stores';
import { useUIStore } from '../../stores/uiStore';
import type { Element, ElementVisual, Property, GeoData, Link } from '../../types';
import {
  findRecordSources,
  pickDefaultSource,
  recordsForSource,
  sourceKey,
  collectFields,
  childFieldsOf,
  detectReferenceFields,
  detectPolygonFields,
  guessCoordOrder,
  toLngLatCoords,
  guessLabelTemplate,
  guessTarget,
  lastSegment,
  applyTemplate,
  coerceForTarget,
  isBlank,
  valueToString,
  flattenRecord,
  type FieldMapping,
  type MappingTarget,
  type CoordOrder,
} from '../../utils/jsonMapping';
import { computePolygonCenter } from '../../utils/geo';
import { layoutService, type LayoutType } from '../../services/layoutService';

const LAYOUTS: LayoutType[] = ['force', 'clusters', 'hierarchy', 'circular', 'grid'];
const layoutLabel = (l: LayoutType): string => (l === 'hierarchy' ? 'Hiérarchie' : layoutService.getLayoutName(l));

/** Config for turning an array-of-objects field into linked child elements. */
interface ChildMapping {
  enabled: boolean;
  tag: string;
  labelTemplate: string;
  linkLabel: string;
}

interface JsonMappingImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fill and parse this JSON when the modal opens (e.g. from a paste). */
  initialJson?: string;
}

const TARGETS: MappingTarget[] = ['property', 'date', 'country', 'source', 'lat', 'lng', 'id', 'ref', 'polygon'];

export function JsonMappingImportModal({ isOpen, onClose, initialJson }: JsonMappingImportModalProps) {
  const { t } = useTranslation('modals');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [srcKey, setSrcKey] = useState('');
  const [mapping, setMapping] = useState<Record<string, FieldMapping>>({});
  const [childMappings, setChildMappings] = useState<Record<string, ChildMapping>>({});
  const [labelTemplate, setLabelTemplate] = useState('');
  const [tagName, setTagName] = useState('');
  const [ignoreEmpty, setIgnoreEmpty] = useState(true);
  const [layout, setLayout] = useState<LayoutType>('force');
  const [creating, setCreating] = useState(false);

  const reset = useCallback(() => {
    setText(''); setParsed(null); setError(null); setSrcKey('');
    setMapping({}); setChildMappings({}); setLabelTemplate(''); setTagName(''); setIgnoreEmpty(true); setLayout('force'); setCreating(false);
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
  // Scalar fields map to the parent element; array-of-objects fields can become linked children.
  const scalarFields = useMemo(() => fields.filter((f) => f.kind === 'scalar'), [fields]);
  const childArrayFields = useMemo(() => fields.filter((f) => f.kind === 'objectArray'), [fields]);

  // Initialise mappings + label template whenever the field set changes
  const fieldSig = fields.map((f) => `${f.key}:${f.kind}`).join('|');
  useEffect(() => {
    if (fields.length === 0) { setMapping({}); setChildMappings({}); return; }
    // Auto-detect the id field, reference fields, and polygon fields.
    const idFieldKey = scalarFields.find((f) => guessTarget(f.key) === 'id')?.key;
    const refSet = detectReferenceFields(records, scalarFields, idFieldKey);
    const polySet = detectPolygonFields(records, scalarFields);
    const next: Record<string, FieldMapping> = {};
    for (const f of scalarFields) {
      const g = guessTarget(f.key);
      if (polySet.has(f.key)) {
        next[f.key] = { enabled: true, target: 'polygon', propKey: lastSegment(f.key), coordOrder: guessCoordOrder(records, f.key) };
      } else if (refSet.has(f.key)) {
        // Reference field → create links; empty label by default (cleaner than the field name).
        next[f.key] = { enabled: true, target: 'ref', propKey: '' };
      } else {
        // Noise fields (id, hash, score…) start disabled but keep a sane target if re-enabled.
        next[f.key] = { enabled: g !== 'ignore', target: g === 'ignore' ? 'property' : g, propKey: lastSegment(f.key) };
      }
    }
    setMapping(next);
    // Child (linked sub-element) config per array-of-objects field — disabled by default.
    const childNext: Record<string, ChildMapping> = {};
    for (const f of childArrayFields) {
      const sub = childFieldsOf(records, f.key);
      const tag = lastSegment(f.key);
      childNext[f.key] = { enabled: false, tag, labelTemplate: guessLabelTemplate(sub), linkLabel: tag };
    }
    setChildMappings(childNext);
    setLabelTemplate(guessLabelTemplate(scalarFields));
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
  const allEnabled = scalarFields.length > 0 && scalarFields.every((f) => mapping[f.key]?.enabled);
  const toggleAll = () =>
    setMapping((m) => {
      const target = !allEnabled;
      const next = { ...m };
      for (const f of scalarFields) if (next[f.key]) next[f.key] = { ...next[f.key], enabled: target };
      return next;
    });
  const setFieldOrder = (key: string, coordOrder: CoordOrder) =>
    setMapping((m) => ({ ...m, [key]: { ...m[key], coordOrder } }));
  const setChild = (key: string, patch: Partial<ChildMapping>) =>
    setChildMappings((c) => ({ ...c, [key]: { ...c[key], ...patch } }));

  const handleImport = useCallback(async () => {
    const dossier = useDossierStore.getState().currentDossier;
    if (!dossier || records.length === 0) return;
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

      const tn = tagName.trim();
      const parentVisual = await ensureVisual(tn);

      // Resolve visuals for each enabled child-array field's tag.
      const enabledChildren = childArrayFields.filter((f) => childMappings[f.key]?.enabled && childMappings[f.key]?.tag.trim());
      const childVisuals: Record<string, ElementVisual> = {};
      for (const f of enabledChildren) childVisuals[f.key] = await ensureVisual(childMappings[f.key].tag);

      const now = new Date();
      const cols = Math.max(1, Math.ceil(Math.sqrt(records.length)));
      const elements: Element[] = [];
      const links: Link[] = [];

      const buildProps = (flat: Record<string, unknown>, fieldList: typeof scalarFields, getMap: (k: string) => FieldMapping | undefined) => {
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
            case 'id': case 'ref': case 'polygon': break; // handled separately (key / links / geo zone)
            case 'source': source = source ? `${source} | ${coerced}` : String(coerced); break;
            case 'lat': lat = coerced as number; break;
            case 'lng': lng = coerced as number; break;
            case 'date': properties.push({ key: propKey, value: coerced as Date, type: 'date' }); break;
            case 'country': properties.push({ key: propKey, value: coerced as string, type: 'country' }); break;
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

      // Reference-link config: the field that holds each record's id, and the fields
      // whose value(s) are ids of other records (→ links between created elements).
      const idField = scalarFields.find((f) => mapping[f.key]?.enabled && mapping[f.key]?.target === 'id')?.key;
      const refFields = scalarFields.filter((f) => mapping[f.key]?.enabled && mapping[f.key]?.target === 'ref');
      const polyFieldKey = scalarFields.find((f) => mapping[f.key]?.enabled && mapping[f.key]?.target === 'polygon')?.key;
      const polyOrder: CoordOrder = polyFieldKey ? (mapping[polyFieldKey]?.coordOrder ?? 'latlng') : 'latlng';
      const idToElement = new Map<string, string>();
      const parentEls: Element[] = [];

      records.forEach((flat, i) => {
        const { properties, source, lat, lng } = buildProps(flat, scalarFields, (k) => mapping[k]);
        let geo: GeoData | null = null;
        if (polyFieldKey) {
          const coords = toLngLatCoords(flat[polyFieldKey], polyOrder);
          if (coords.length >= 3) geo = { type: 'polygon', coordinates: coords, center: computePolygonCenter(coords) };
        }
        if (!geo && lat != null && lng != null) geo = { type: 'point', lat, lng };
        const parent = mkElement({
          label: applyTemplate(labelTemplate, flat) || t('importJsonMapping.noLabel'),
          tags: tn ? [tn] : [], properties, source, geo,
          visual: { ...parentVisual },
          position: { x: (i % cols) * 380, y: Math.floor(i / cols) * 320 },
        });
        elements.push(parent);
        parentEls.push(parent);
        if (idField) {
          const idv = valueToString(flat[idField]).trim();
          if (idv && !idToElement.has(idv)) idToElement.set(idv, parent.id);
        }

        // Linked children from array-of-objects fields
        let childIdx = 0;
        for (const f of enabledChildren) {
          const cm = childMappings[f.key];
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

      // Second pass: resolve reference fields (ids of other records) into DIRECTED links.
      // Reciprocal references (A→B and B→A) collapse into a single bidirectional link.
      if (idField && refFields.length > 0) {
        const edgeSet = new Set<string>();
        const edges: { from: string; to: string; label: string }[] = [];
        records.forEach((flat, i) => {
          const fromId = parentEls[i].id;
          for (const rf of refFields) {
            const raw = flat[rf.key];
            const refVals = Array.isArray(raw) ? raw : (isBlank(raw) ? [] : [raw]);
            const label = (mapping[rf.key]?.propKey ?? '').trim();
            for (const rv of refVals) {
              const targetId = idToElement.get(valueToString(rv).trim());
              if (!targetId || targetId === fromId) continue;
              const key = `${fromId}|${targetId}`;
              if (edgeSet.has(key)) continue;
              edgeSet.add(key);
              edges.push({ from: fromId, to: targetId, label });
            }
          }
        });
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
      }

      // Lay the subgraph out properly (force/hierarchy/… respecting the links)
      // instead of the naive build-order grid.
      if (elements.length > 1) {
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
        prebuilt: { elements, links },
        dossierId: dossier.id,
      });
      handleClose();
    } catch (e) {
      console.error('JSON mapping import failed', e);
      setError(String(e));
      setCreating(false);
    }
  }, [records, scalarFields, childArrayFields, mapping, childMappings, ignoreEmpty, labelTemplate, tagName, layout, t, handleClose]);

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
                    const showKey = m.target === 'property' || m.target === 'date' || m.target === 'country' || m.target === 'ref';
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
              <p className="text-[10px] text-text-tertiary">{t('importJsonMapping.enabledCount', { enabled: scalarFields.filter((f) => mapping[f.key]?.enabled).length, total: scalarFields.length })}</p>

              {/* Linked sub-elements (array-of-objects fields) */}
              {childArrayFields.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-text-secondary">{t('importJsonMapping.subElements')}</label>
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
