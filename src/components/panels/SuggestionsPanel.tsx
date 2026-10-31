import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TagCombobox } from '../modals/TagCombobox';
import { revealElement } from '../../utils/revealElement';
import { ArrowDownUp, Check, ChevronDown, ChevronUp, Loader2, Merge, RotateCcw, Search, X } from 'lucide-react';
import { useDossierStore, useInsightsStore, useQueryStore, useSelectionStore, useSuggestionsStore, useTabStore, useUIStore, useViewStore } from '../../stores';
import { MAX_STAYS } from '../../stores/suggestionsStore';
import { loadPhoneParser } from '../../services/dedup/phoneLib';
import { MERGE_LEVELS } from '../../services/dedup/candidates';
import { MergeElementsModal } from '../modals/MergeElementsModal';
import { foldKey, suggestionElementIds, type MergeReason, type MergeSuggestion, type Suggestion, type SuggestionReason } from '../../services/linkSuggestions';
import type { Element } from '../../types';
import { useProgressStore } from '../../stores/progressStore';

/** Compact select of the settings row: same height as the checkbox labels */
const SELECT_CLASS = 'h-6 px-1.5 text-xs rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent disabled:opacity-50';

/** Rows rendered at once: enough to work through, light enough for big dossiers */
/** Rows rendered at once; the list grows by as many on demand */
const ROWS_STEP = 200;

/** Property keys the shared values rule can compare (text and links), most used first */
function comparableKeys(elements: Element[]): { key: string; label: string; count: number }[] {
  const byKey = new Map<string, { label: string; count: number }>();
  for (const el of elements) {
    const seen = new Set<string>();
    for (const prop of el.properties || []) {
      if (prop.type && prop.type !== 'text' && prop.type !== 'link') continue;
      if (String(prop.value ?? '').trim() === '') continue;
      const key = foldKey(prop.key);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const found = byKey.get(key);
      if (found) found.count++;
      else byKey.set(key, { label: prop.key.trim(), count: 1 });
    }
  }
  return [...byKey]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Lowercase without accents, for the list search */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const involvedIds = suggestionElementIds;

/** Reasons that speak against a merge: shown as a warning */
const isWarning = (r: MergeReason) => r.rule === 'conflict' || r.rule === 'differentNumbers';

/** Distance a suggestion is about, in metres: nearest place or meeting, 0 for
 *  a point in a zone; Infinity when it has none (values, sources, pivots) */
// Time of a meeting (its first one), or Infinity for an undated suggestion
function dateOf(sg: Suggestion): number {
  if (sg.kind !== 'link') return Infinity;
  let d = Infinity;
  for (const r of sg.reasons) {
    if (r.rule === 'meeting' && r.date) d = Math.min(d, new Date(r.date).getTime());
  }
  return d;
}

function distanceOf(sg: Suggestion): number {
  if (sg.kind !== 'link') return Infinity;
  let d = Infinity;
  for (const r of sg.reasons) {
    if (r.rule === 'inZone') d = 0;
    else if ((r.rule === 'nearby' || r.rule === 'meeting') && r.distance !== undefined) d = Math.min(d, r.distance);
  }
  return d;
}

interface AmountUnit { factor: number; label: string }

/** Amount typed by the analyst, with its unit; the value is in the smallest
 *  unit (metres, ms) and is committed on Enter or on leaving the field */
function AmountField({ value, units, onCommit, disabled, label, testId }: {
  value: number;
  units: AmountUnit[];
  onCommit: (value: number) => void;
  disabled: boolean;
  label: string;
  testId: string;
}) {
  const fit = useCallback((v: number) => [...units].reverse().find((u) => v % u.factor === 0) ?? units[0], [units]);
  const [factor, setFactor] = useState(() => fit(value).factor);
  const [text, setText] = useState(() => String(value / fit(value).factor));
  // A value changed elsewhere (bounds) is shown afresh; our own commit keeps
  // the unit and the text as typed
  const [committed, setCommitted] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    if (committed !== value) {
      const unit = fit(value);
      setFactor(unit.factor);
      setText(String(value / unit.factor));
    }
  }

  const commit = (amount: string, unitFactor: number) => {
    const n = Number(amount.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) {
      setText(String(value / unitFactor));
      return;
    }
    const next = Math.round(n * unitFactor);
    if (next === value) return;
    setCommitted(next);
    onCommit(next);
  };

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit(text, factor)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(text, factor); }}
        disabled={disabled}
        aria-label={label}
        title={label}
        data-testid={testId}
        className={`${SELECT_CLASS} w-12 text-right`}
      />
      <select
        value={factor}
        onChange={(e) => { const f = Number(e.target.value); setFactor(f); commit(text, f); }}
        disabled={disabled}
        aria-label={label}
        data-testid={`${testId}-unit`}
        className={SELECT_CLASS}
      >
        {units.map((u) => <option key={u.factor} value={u.factor}>{u.label}</option>)}
      </select>
    </span>
  );
}

export function SuggestionsPanel() {
  const { t, i18n } = useTranslation('panels');
  const elements = useDossierStore((s) => s.elements);
  const links = useDossierStore((s) => s.links);
  const currentDossierId = useDossierStore((s) => s.currentDossier?.id ?? null);
  const {
    suggestions, dismissedSuggestions, dossierId, scope, nearbyRadius, meetingRadius, maxStay, placesEnabled, meetingsEnabled, meetingWindow,
    valuesEnabled, sourcesEnabled, zonesEnabled, setRuleEnabled, duplicatesEnabled, duplicateThreshold, setDuplicateThreshold, merge,
    shownCount, meetingsTruncated, crowdedCount, between, setBetween, excludedKeys, setExcludedKeys, loadExcludedKeys,
    analyze, refresh, setNearbyRadius, setMeetingRadius, setMaxStay, setPlacesEnabled, setMeetingsEnabled, setMeetingWindow, accept, dismiss, restore,
  } = useSuggestionsStore();
  const highlightSuggestion = useInsightsStore((s) => s.highlightSuggestion);
  const clearHighlight = useInsightsStore((s) => s.clearHighlight);
  const selectElements = useSelectionStore((s) => s.selectElements);
  // In the store: the checks and their links on the canvas outlive a switch
  // to another tab of the side panel
  const checked = useSuggestionsStore((s) => s.checked);
  const setChecked = useSuggestionsStore((s) => s.setChecked);
  const [busy, setBusy] = useState(false);
  /** Reviewing the dismissed suggestions instead of the pending ones */
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [search, setSearch] = useState('');
  // Rows shown of a given list; another list (search, new analysis) starts over
  const [rowsShown, setRowsShown] = useState<{ list: unknown; limit: number }>({ list: null, limit: ROWS_STEP });
  // Tags typed for the between filter, applied once picked
  const [betweenA, setBetweenA] = useState(between?.a ?? '');
  // One tag compares it with itself: the second field then stays empty
  const [betweenB, setBetweenB] = useState(between && between.b !== between.a ? between.b : '');
  const applyBetween = (a: string, b: string) => {
    const first = a.trim() || b.trim();
    const next = first ? { a: first, b: b.trim() && a.trim() ? b.trim() : first } : null;
    if ((next?.a ?? '') !== (between?.a ?? '') || (next?.b ?? '') !== (between?.b ?? '')) setBetween(next);
  };

  // Property keys compared by the shared values rule (left-out ones are per dossier)
  useEffect(() => { loadExcludedKeys(currentDossierId); }, [currentDossierId, loadExcludedKeys]);
  const propertyKeys = useMemo(() => comparableKeys(elements), [elements]);
  const excludedSet = useMemo(() => new Set(excludedKeys), [excludedKeys]);
  const keptCount = propertyKeys.filter((k) => !excludedSet.has(k.key)).length;
  const [keysOpen, setKeysOpen] = useState(false);
  const [keySearch, setKeySearch] = useState('');
  const listedKeys = useMemo(() => {
    const query = fold(keySearch.trim());
    return query ? propertyKeys.filter((k) => fold(k.label).includes(query)) : propertyKeys;
  }, [propertyKeys, keySearch]);
  const setKeysKept = (keys: string[], kept: boolean) => {
    const touched = new Set(keys);
    setExcludedKeys(kept ? excludedKeys.filter((k) => !touched.has(k)) : [...excludedKeys, ...keys]);
  };

  // Leaving the tab must not leave the canvas dimmed
  useEffect(() => () => {
    if (useInsightsStore.getState().highlightType === 'suggestion') clearHighlight();
  }, [clearHighlight]);

  // Follow what the views show: a filter, a ZNQuery filter, hidden elements or
  // another tab re-run the analysis already on screen (nothing is created)
  const filters = useViewStore((s) => s.filters);
  const hiddenElementIds = useViewStore((s) => s.hiddenElementIds);
  const queryFilterActive = useQueryStore((s) => s.isFilterActive);
  const queryMatchElementIds = useQueryStore((s) => s.matchingElementIds);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabMemberSet = useTabStore((s) => s.memberSet);
  // Tags offered by the filter: those carried in the open tab (any other finds nothing)
  const tabTags = useMemo(() => {
    const set = new Set<string>();
    for (const el of elements) {
      if (activeTabId !== null && !tabMemberSet.has(el.id)) continue;
      for (const tag of el.tags) set.add(tag);
    }
    return [...set];
  }, [elements, activeTabId, tabMemberSet]);

  useEffect(() => {
    refresh();
  }, [filters, hiddenElementIds, queryFilterActive, queryMatchElementIds, activeTabId, tabMemberSet, refresh]);

  const elementById = useMemo(() => new Map(elements.map((el) => [el.id, el])), [elements]);

  // Drop what the dossier made obsolete since the analysis (element deleted,
  // pair linked by hand, undo of an acceptance is fine: it comes back on the next analysis)
  const prune = useCallback((list: Suggestion[]) => {
    const linked = new Set(links.map((l) => (l.fromId < l.toId ? `${l.fromId}|${l.toId}` : `${l.toId}|${l.fromId}`)));
    return list.filter((s) => {
      if (!involvedIds(s).every((id) => elementById.has(id))) return false;
      if (s.kind === 'link') {
        return !linked.has(s.fromId < s.toId ? `${s.fromId}|${s.toId}` : `${s.toId}|${s.fromId}`);
      }
      return true;
    });
  }, [links, elementById]);

  const analyzed = !!suggestions && dossierId === currentDossierId;
  const pending = useMemo(() => (analyzed ? prune(suggestions!) : null), [analyzed, suggestions, prune]);
  const dismissedList = useMemo(() => (analyzed ? prune(dismissedSuggestions) : []), [analyzed, dismissedSuggestions, prune]);
  const visible = reviewDismissed ? (analyzed ? dismissedList : null) : pending;

  const label = useCallback((id: string) => elementById.get(id)?.label || t('insights.noName'), [elementById, t]);

  // One formatter each, reused: toLocaleString builds a new one per call,
  // which thousands of rows (and the search index) can't afford
  const kmFormat = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }), [i18n.language]);
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }), [i18n.language]);

  const formatDistance = useCallback((metres: number) => (
    metres < 1000 ? `${metres} m` : `${kmFormat.format(metres / 1000)} km`
  ), [kmFormat]);

  const formatWindow = useCallback((ms: number) => {
    if (ms < 3600_000) return t('suggestions.window.minutes', { count: ms / 60_000 });
    if (ms < 86400_000) return t('suggestions.window.hours', { count: ms / 3600_000 });
    return t('suggestions.window.days', { count: ms / 86400_000 });
  }, [t]);

  const formatDate = useCallback((iso?: string) => (iso ? dateFormat.format(new Date(iso)) : ''), [dateFormat]);

  const distanceUnits = useMemo<AmountUnit[]>(() => [{ factor: 1, label: 'm' }, { factor: 1000, label: 'km' }], []);
  // Unit names from the window labels, without their number
  const windowUnits = useMemo<AmountUnit[]>(() => {
    const name = (key: string) => t(`suggestions.window.${key}`, { count: 2 }).replace(/\d+/, '').trim();
    return [
      { factor: 60_000, label: name('minutes') },
      { factor: 3600_000, label: name('hours') },
      { factor: 86400_000, label: name('days') },
    ];
  }, [t]);

  const reasonText = useCallback((reason: SuggestionReason) => {
    switch (reason.rule) {
      case 'sharedValue': return t('suggestions.reason.sharedValue', { key: reason.key, value: reason.value });
      case 'sharedSource': return t('suggestions.reason.sharedSource', { value: reason.value });
      case 'inZone': return t('suggestions.reason.inZone');
      case 'nearby': return t('suggestions.reason.nearby', { distance: formatDistance(reason.distance ?? 0) });
      case 'meeting': {
        // Same minute: "together"; otherwise both times, the window allowed the gap
        const apart = !!reason.date && !!reason.dateOther &&
          Math.abs(new Date(reason.dateOther).getTime() - new Date(reason.date).getTime()) >= 60_000;
        return t(apart ? 'suggestions.reason.meetingApart' : 'suggestions.reason.meeting', {
          count: reason.count ?? 1,
          distance: formatDistance(reason.distance ?? 0),
          date: formatDate(reason.date),
          dateOther: formatDate(reason.dateOther),
        });
      }
    }
  }, [t, formatDistance, formatDate]);

  const mergeReasonText = useCallback((reason: MergeReason) => {
    switch (reason.rule) {
      case 'sameIdentifier': return t('suggestions.merge.reason.sameIdentifier', { kind: t(`suggestions.merge.kind.${reason.kind}`), value: reason.value });
      case 'sameName': return t('suggestions.merge.reason.sameName');
      case 'phonetic': return t('suggestions.merge.reason.phonetic');
      case 'similarName': return t('suggestions.merge.reason.similarName', { value: Math.round(reason.similarity * 100) });
      case 'sharedTags': return t('suggestions.merge.reason.sharedTags', { count: reason.count });
      case 'conflict': return t('suggestions.merge.reason.conflict', { kind: t(`suggestions.merge.kind.${reason.kind}`) });
      case 'differentNumbers': return t('suggestions.merge.reason.differentNumbers');
    }
  }, [t]);

  // Possible duplicate being merged (the dialog picks the element kept)
  const [merging, setMerging] = useState<MergeSuggestion | null>(null);

  const linkLabel = useCallback((reason: SuggestionReason) => {
    switch (reason.rule) {
      case 'sharedValue': return t('suggestions.linkLabel.sharedValue', { key: reason.key });
      case 'sharedSource': return t('suggestions.linkLabel.sharedSource');
      case 'inZone': return t('suggestions.linkLabel.inZone');
      case 'nearby': return t('suggestions.linkLabel.nearby');
      case 'meeting': return t('suggestions.linkLabel.meeting');
    }
  }, [t]);

  const run = useCallback(async (fn: () => Promise<void>, ids: string[]) => {
    setBusy(true);
    try {
      await fn();
      setChecked((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      clearHighlight();
    } finally {
      setBusy(false);
    }
  }, [clearHighlight, setChecked]);

  const handleAccept = useCallback(
    (ids: string[]) => run(() => accept(ids, linkLabel, reasonText), ids),
    [run, accept, linkLabel, reasonText]
  );
  const handleDismiss = useCallback((ids: string[]) => run(() => dismiss(ids), ids), [run, dismiss]);
  const handleRestore = useCallback((ids: string[]) => run(() => restore(ids), ids), [run, restore]);

  // Checking a suggestion brings its elements on the canvas
  const toggle = (s: Suggestion) => {
    if (!checked.has(s.id) && useViewStore.getState().displayMode === 'canvas') {
      useViewStore.getState().requestFitView(involvedIds(s));
    }
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
      return next;
    });
  };

  // List search: element names and reason texts, accents and case aside
  // Searchable text of each suggestion, built once per list (and only once the
  // analyst types), so a keystroke only scans strings
  const searching = search.trim() !== '';
  const searchIndex = useMemo(() => {
    if (!visible || !searching) return null;
    return visible.map((s) => {
      const parts = involvedIds(s).map(label);
      if (s.kind === 'link') parts.push(...s.reasons.map(reasonText));
      else if (s.kind === 'merge') parts.push(...s.reasons.map(mergeReasonText));
      else parts.push(s.reason.value ?? '', s.reason.key ?? '', reasonText(s.reason));
      return fold(parts.join(' '));
    });
  }, [visible, searching, label, reasonText, mergeReasonText]);

  const searched = useMemo(() => {
    const query = fold(search.trim());
    if (!visible || !query || !searchIndex) return visible;
    return visible.filter((_, i) => searchIndex[i].includes(query));
  }, [visible, search, searchIndex]);

  // Sorted by distance: places, meetings and zones first, nearest first (a
  // point in a zone is at 0 m). By date: dated meetings first, latest first.
  // The others keep their order after them. The reverse button flips the
  // order of the sorted ones (or of the whole list by relevance).
  const [sortBy, setSortBy] = useState<'relevance' | 'distance' | 'date'>('relevance');
  const [reversed, setReversed] = useState(false);
  const hasDistances = !!searched?.some((sg) => distanceOf(sg) !== Infinity);
  const hasDates = !!searched?.some((sg) => dateOf(sg) !== Infinity);
  const sortKey = (sortBy === 'distance' && hasDistances) ? distanceOf : (sortBy === 'date' && hasDates) ? dateOf : null;
  const sorted = useMemo(() => {
    if (!searched) return searched;
    if (!sortKey) return reversed ? [...searched].reverse() : searched;
    const descending = (sortKey === dateOf) !== reversed;
    return [...searched].sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      if (ka === kb) return 0;
      if (ka === Infinity) return 1;
      if (kb === Infinity) return -1;
      return descending ? kb - ka : ka - kb;
    });
  }, [searched, sortKey, reversed]);
  const rowLimit = rowsShown.list === sorted ? rowsShown.limit : ROWS_STEP;

  // An element name in a row: selects it alone, brings it on screen and shows
  // its summary under the row (a second click hides it)
  const [focus, setFocus] = useState<{ row: string; id: string } | null>(null);
  // Pivot rows whose members are listed
  const [openPivots, setOpenPivots] = useState<Set<string>>(new Set());
  const togglePivot = (id: string) => setOpenPivots((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setSidePanelTab = useUIStore((s) => s.setSidePanelTab);
  const nameButton = (row: string, id: string) => (
    <button
      type="button"
      onClick={() => {
        if (focus?.row === row && focus.id === id) { setFocus(null); return; }
        selectElements([id]);
        revealElement(id);
        setFocus({ row, id });
      }}
      className={`text-left hover:underline ${focus?.row === row && focus.id === id ? 'text-accent' : ''}`}
    >
      {label(id)}
    </button>
  );
  // Between two tags, the element of the first tag comes first on every row
  const orderedPair = (fromId: string, toId: string): [string, string] => {
    const first = between ? elementById.get(toId)?.tags.includes(between.a) && !elementById.get(fromId)?.tags.includes(between.a) : false;
    return first ? [toId, fromId] : [fromId, toId];
  };
  const propertyText = (value: unknown) => (value instanceof Date ? dateFormat.format(value) : String(value ?? ''));
  const preview = (el: Element) => (
    <div className="mt-1.5 p-2 rounded border border-border-default bg-bg-primary space-y-1" data-testid="suggestion-preview">
      {el.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {el.tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded bg-bg-tertiary text-text-secondary">{tag}</span>
          ))}
        </div>
      )}
      {el.properties.slice(0, 6).map((p, i) => (
        <p key={i} className="text-xs text-text-secondary break-words">
          <span className="text-text-tertiary">{p.key} :</span> {propertyText(p.value)}
        </p>
      ))}
      <button
        type="button"
        onClick={() => setSidePanelTab('detail')}
        className="text-xs text-text-secondary hover:text-text-primary underline"
      >
        {t('suggestions.openDetail')}
      </button>
    </div>
  );
  const shown = sorted?.slice(0, rowLimit) ?? [];
  // The analysis runs on the main thread: paint the busy state first, then
  // compute. Two frames: the first schedules the paint, the second runs after it.
  const [analyzing, setAnalyzing] = useState(false);
  const runAnalysis = useCallback(() => {
    setChecked(new Set());
    setAnalyzing(true);
    useProgressStore.getState().start('suggestions', 'activity.suggestions');
    // Duplicates read phone numbers with libphonenumber: loaded on first use
    const ready = useSuggestionsStore.getState().duplicatesEnabled ? loadPhoneParser() : Promise.resolve(null);
    void ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        analyze(null);
      } finally {
        setAnalyzing(false);
        useProgressStore.getState().end('suggestions');
      }
    })));
  }, [analyze, setChecked]);

  const checkedIds = shown.filter((s) => checked.has(s.id)).map((s) => s.id);
  // Merges go one by one through their dialog: the bulk accept leaves them out
  const acceptableIds = shown.filter((s) => checked.has(s.id) && s.kind !== 'merge').map((s) => s.id);

  // The checked suggestions draw their links on the canvas, until unchecked,
  // accepted or dismissed (they then leave the list), the panel open or not;
  // the hovered one too, while hovered
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const previewPairs = shown.filter((s) => checked.has(s.id) || s.id === hoveredId).flatMap((s) => {
    if (s.kind === 'link') return [{ id: s.id, fromId: s.fromId, toId: s.toId }];
    if (s.kind === 'merge') return [];
    const hub = s.existingId;
    return hub ? s.memberIds.map((m) => ({ id: `${s.id}:${m}`, fromId: hub, toId: m })) : [];
  });
  const setPreviewPairs = useSuggestionsStore((st) => st.setPreviewPairs);
  // Every render: the store only changes when the pairs do
  useEffect(() => { setPreviewPairs(previewPairs); });
  const allChecked = shown.length > 0 && checkedIds.length === shown.length;
  // Bulk buttons from two rows on: a single row already has its own buttons
  const bulk = checkedIds.length >= 2;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 border-b border-border-default">
        <button
          onClick={runAnalysis}
          disabled={elements.length < 2 || analyzing}
          aria-busy={analyzing}
          data-testid="suggestions-analyze"
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded border border-border-default text-text-primary bg-bg-secondary hover:bg-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {analyzing && <Loader2 size={14} className="animate-spin" />}
          {analyzing ? t('suggestions.analyzing') : t('suggestions.analyze')}
        </button>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
          {([
            ['values', valuesEnabled, 'suggestions.rules.values', 'suggestions.rules.valuesHint'],
            ['sources', sourcesEnabled, 'suggestions.rules.sources', 'suggestions.rules.sourcesHint'],
            ['zones', zonesEnabled, 'suggestions.rules.zones', 'suggestions.rules.zonesHint'],
          ] as const).map(([rule, on, labelKey, hintKey]) => (
            <label key={rule} className="flex items-center gap-1.5 h-6" title={t(hintKey)}>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => { setRuleEnabled(rule, e.target.checked); refresh(); }}
                data-testid={`suggestions-rule-${rule}`}
                className="rounded border-border-default"
              />
              {t(labelKey)}
              {rule === 'values' && propertyKeys.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setKeysOpen((v) => !v); }}
                  disabled={!valuesEnabled}
                  title={t('suggestions.keys.hint')}
                  aria-expanded={keysOpen}
                  data-testid="suggestions-keys-toggle"
                  className="inline-flex items-center gap-0.5 px-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-50"
                >
                  {keptCount === propertyKeys.length ? t('suggestions.keys.all') : `${keptCount}/${propertyKeys.length}`}
                  {keysOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              )}
            </label>
          ))}
        </div>
        {keysOpen && valuesEnabled && propertyKeys.length > 0 && (
          <div className="rounded border border-border-default bg-bg-primary" data-testid="suggestions-keys">
            <div className="flex items-center gap-2 px-2 py-1 border-b border-border-default text-xs">
              {propertyKeys.length > 8 ? (
                <input
                  type="text"
                  value={keySearch}
                  onChange={(e) => setKeySearch(e.target.value)}
                  placeholder={t('suggestions.keys.search')}
                  aria-label={t('suggestions.keys.search')}
                  className="flex-1 min-w-0 px-1.5 py-0.5 text-xs rounded border border-border-default bg-bg-primary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
                />
              ) : (
                <span className="flex-1" />
              )}
              <button
                type="button"
                onClick={() => setKeysKept(listedKeys.map((k) => k.key), true)}
                className="text-text-secondary hover:text-text-primary underline"
              >
                {t('suggestions.keys.selectAll')}
              </button>
              <button
                type="button"
                onClick={() => setKeysKept(listedKeys.map((k) => k.key), false)}
                className="text-text-secondary hover:text-text-primary underline"
              >
                {t('suggestions.keys.selectNone')}
              </button>
            </div>
            <ul className="max-h-40 overflow-y-auto py-0.5">
              {listedKeys.map((k) => (
                <li key={k.key}>
                  <label className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-text-primary hover:bg-bg-secondary">
                    <input
                      type="checkbox"
                      checked={!excludedSet.has(k.key)}
                      onChange={(e) => setKeysKept([k.key], e.target.checked)}
                      className="rounded border-border-default"
                    />
                    <span className="flex-1 min-w-0 truncate" title={k.label}>{k.label}</span>
                    <span className="text-text-tertiary">{k.count}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* Rules with a setting: one per row, their settings in one column */}
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-xs text-text-secondary">
          <label className="flex items-center gap-1.5 h-6" title={t('suggestions.rules.duplicatesHint')}>
            <input
              type="checkbox"
              checked={duplicatesEnabled}
              onChange={(e) => {
                setRuleEnabled('duplicates', e.target.checked);
                if (e.target.checked) void loadPhoneParser().then(() => refresh());
                else refresh();
              }}
              data-testid="suggestions-rule-duplicates"
              className="rounded border-border-default"
            />
            {t('suggestions.rules.duplicates')}
          </label>
          <div className="flex items-center gap-1.5">
            <select
              value={duplicateThreshold}
              onChange={(e) => { setDuplicateThreshold(Number(e.target.value)); refresh(); }}
              disabled={!duplicatesEnabled}
              aria-label={t('suggestions.merge.threshold')}
              title={t('suggestions.merge.threshold')}
              data-testid="suggestions-duplicate-threshold"
              className={SELECT_CLASS}
            >
              {MERGE_LEVELS.map((l) => <option key={l.rank} value={l.rank}>{t(`suggestions.merge.minLevel.${l.level}`)}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-1.5 h-6" title={t('suggestions.placesHint')}>
            <input
              type="checkbox"
              checked={placesEnabled}
              onChange={(e) => { setPlacesEnabled(e.target.checked); refresh(); }}
              data-testid="suggestions-places"
              className="rounded border-border-default"
            />
            {t('suggestions.places')}
          </label>
          <div className="flex items-center gap-1.5">
            <AmountField
              value={nearbyRadius}
              units={distanceUnits}
              onCommit={(v) => { setNearbyRadius(v); refresh(); }}
              disabled={!placesEnabled}
              label={t('suggestions.nearbyRadius')}
              testId="suggestions-nearby-radius"
            />
          </div>
          <label className="flex items-center gap-1.5 h-6" title={t('suggestions.meetingsHint')}>
            <input
              type="checkbox"
              checked={meetingsEnabled}
              onChange={(e) => { setMeetingsEnabled(e.target.checked); refresh(); }}
              data-testid="suggestions-meetings"
              className="rounded border-border-default"
            />
            {t('suggestions.meetings')}
          </label>
          <div className="flex items-center gap-1.5">
            <AmountField
              value={meetingRadius}
              units={distanceUnits}
              onCommit={(v) => { setMeetingRadius(v); refresh(); }}
              disabled={!meetingsEnabled}
              label={t('suggestions.nearbyRadius')}
              testId="suggestions-meeting-radius"
            />
            <span className={meetingsEnabled ? '' : 'opacity-50'}>{t('suggestions.and')} ±</span>
            <AmountField
              value={meetingWindow}
              units={windowUnits}
              onCommit={(v) => { setMeetingWindow(v); refresh(); }}
              disabled={!meetingsEnabled}
              label={t('suggestions.meetingWindow')}
              testId="suggestions-meeting-window"
            />
          </div>
          <span className={`pl-5 ${meetingsEnabled ? '' : 'opacity-50'}`} title={t('suggestions.maxStayHint')}>
            {t('suggestions.maxStay')}
          </span>
          <div className="flex items-center gap-1.5">
            <select
              value={maxStay}
              onChange={(e) => { setMaxStay(Number(e.target.value)); refresh(); }}
              disabled={!meetingsEnabled}
              aria-label={t('suggestions.maxStay')}
              title={t('suggestions.maxStayHint')}
              data-testid="suggestions-max-stay"
              className={SELECT_CLASS}
            >
              {MAX_STAYS.map((ms) => (
                <option key={ms} value={ms}>{ms === 0 ? t('suggestions.noLimit') : formatWindow(ms)}</option>
              ))}
            </select>
          </div>
          <span>{t('suggestions.between')}</span>
          <div className="flex items-center gap-1.5 min-w-0" data-testid="suggestions-between">
            <TagCombobox
              value={betweenA}
              onChange={setBetweenA}
              onPick={(a) => applyBetween(a, betweenB)}
              allowNew={false}
              options={tabTags}
              aria-label={t('suggestions.betweenFirst')}
              className={`${SELECT_CLASS} w-28`}
            />
            <span className="shrink-0">{t('suggestions.and')}</span>
            <TagCombobox
              value={betweenB}
              onChange={setBetweenB}
              onPick={(b) => applyBetween(betweenA, b)}
              allowNew={false}
              options={tabTags}
              placeholder={between && between.a === between.b ? t('suggestions.betweenSame') : undefined}
              aria-label={t('suggestions.betweenSecond')}
              className={`${SELECT_CLASS} w-28`}
            />
            {between && (
              <button
                onClick={() => { setBetweenA(''); setBetweenB(''); setBetween(null); }}
                title={t('suggestions.betweenClear')}
                aria-label={t('suggestions.betweenClear')}
                className="p-0.5 rounded text-text-tertiary hover:text-text-primary"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        {visible && !between && crowdedCount > 0 && (
          <p className="text-xs text-text-tertiary" data-testid="suggestions-crowded">{t('suggestions.crowded', { count: crowdedCount })}</p>
        )}
        {visible && meetingsTruncated && (
          <p className="text-xs text-warning">{t('suggestions.meetingsTruncated')}</p>
        )}
        {visible && scope && (
          <p className="text-xs text-text-tertiary">
            {t('suggestions.scope')}
            {' · '}
            <button onClick={() => analyze(null)} className="text-text-secondary hover:text-text-primary underline">
              {t('suggestions.wholeDossier')}
            </button>
          </p>
        )}
      </div>

      {visible && (visible.length > 0 || search) && (
        <div className="relative px-3 py-1.5 border-b border-border-default">
          <Search size={12} className="absolute left-5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setChecked(new Set()); }}
            placeholder={t('suggestions.search')}
            aria-label={t('suggestions.search')}
            data-testid="suggestions-search"
            className="w-full pl-6 pr-6 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              aria-label={t('suggestions.clearSearch')}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {visible && searched && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-default bg-bg-secondary min-h-9">
          {searched.length > 0 && (
            <input
              type="checkbox"
              checked={allChecked}
              onChange={() => setChecked(allChecked ? new Set() : new Set(shown.map((s) => s.id)))}
              aria-label={t('suggestions.checkAll')}
              className="rounded border-border-default"
            />
          )}
          <span className="flex-1 min-w-0 truncate text-xs text-text-secondary">
            {t('suggestions.count', { count: searched.length })}
            {shownCount !== null && ` · ${t('suggestions.shownShort', { count: shownCount })}`}
          </span>
          {(hasDistances || hasDates) && (
            <select
              value={sortKey ? sortBy : 'relevance'}
              onChange={(e) => { setSortBy(e.target.value as 'relevance' | 'distance' | 'date'); setReversed(false); }}
              aria-label={t('suggestions.sortLabel')}
              title={t('suggestions.sortLabel')}
              data-testid="suggestions-sort"
              className={SELECT_CLASS}
            >
              <option value="relevance">{t('suggestions.sortRelevance')}</option>
              {hasDistances && <option value="distance">{t('suggestions.sortDistance')}</option>}
              {hasDates && <option value="date">{t('suggestions.sortDate')}</option>}
            </select>
          )}
          <button
            onClick={() => setReversed((r) => !r)}
            aria-pressed={reversed}
            aria-label={t('suggestions.sortReverse')}
            title={t('suggestions.sortReverse')}
            data-testid="suggestions-sort-reverse"
            className={`p-1 rounded ${reversed ? 'bg-bg-tertiary text-text-primary' : 'text-text-secondary hover:bg-bg-tertiary'}`}
          >
            <ArrowDownUp size={14} />
          </button>
          {bulk && reviewDismissed && (
            <button
              onClick={() => handleRestore(checkedIds)}
              disabled={busy}
              data-testid="suggestions-restore-checked"
              className="px-2 py-0.5 text-xs rounded border border-border-default text-text-primary bg-bg-primary hover:bg-bg-tertiary disabled:opacity-50"
            >
              {t('suggestions.restoreN', { count: checkedIds.length })}
            </button>
          )}
          {bulk && !reviewDismissed && (
            <>
              <button
                onClick={() => handleDismiss(checkedIds)}
                disabled={busy}
                className="px-2 py-0.5 text-xs rounded border border-border-default text-text-primary bg-bg-primary hover:bg-bg-tertiary disabled:opacity-50"
              >
                {t('suggestions.dismissN', { count: checkedIds.length })}
              </button>
              {acceptableIds.length > 0 && (
                <button
                  onClick={() => handleAccept(acceptableIds)}
                  disabled={busy}
                  data-testid="suggestions-accept-checked"
                  className="px-2 py-0.5 text-xs font-medium rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {t('suggestions.acceptN', { count: acceptableIds.length })}
                </button>
              )}
            </>
          )}
          {!bulk && (reviewDismissed || dismissedList.length > 0) && (
            <button
              onClick={() => { setReviewDismissed((v) => !v); setChecked(new Set()); }}
              data-testid="suggestions-review-dismissed"
              className="shrink-0 text-xs text-text-secondary hover:text-text-primary underline"
            >
              {reviewDismissed ? t('suggestions.backToPending') : t('suggestions.reviewDismissed', { count: dismissedList.length })}
            </button>
          )}
        </div>
      )}

      {searched && searched.length === 0 && (
        <p className="text-center py-8 px-4 text-sm text-text-tertiary">
          {t(search ? 'suggestions.noMatch' : reviewDismissed ? 'suggestions.noneDismissed' : 'suggestions.none')}
        </p>
      )}

      {searched && searched.length > 0 && (
        <ul className="flex-1 overflow-y-auto divide-y divide-border-default">
          {shown.map((s) => (
            <li
              key={s.id}
              onMouseEnter={() => { highlightSuggestion(involvedIds(s)); setHoveredId(s.id); }}
              onMouseLeave={() => { clearHighlight(); setHoveredId(null); }}
              className="group flex items-start gap-2 px-3 py-2 hover:bg-bg-secondary"
            >
              <input
                type="checkbox"
                checked={checked.has(s.id)}
                onChange={() => toggle(s)}
                className="mt-0.5 rounded border-border-default"
              />
              <div className="flex-1 min-w-0">
                {s.kind === 'link' ? (
                  <>
                    {orderedPair(s.fromId, s.toId).map((id, i) => (
                      <span key={id} className={`block text-sm break-words line-clamp-2 ${i === 0 ? 'text-text-primary' : 'text-text-secondary'}`} title={label(id)}>
                        {nameButton(s.id, id)}
                      </span>
                    ))}
                    {s.reasons.map((reason, i) => (
                      <span key={i} className="block text-xs text-text-tertiary break-words">
                        {reasonText(reason)}
                      </span>
                    ))}
                  </>
                ) : s.kind === 'merge' ? (
                  <>
                    {s.elementIds.map((id, i) => (
                      <span key={id} className={`block text-sm break-words line-clamp-2 ${i === 0 ? 'text-text-primary' : 'text-text-secondary'}`} title={label(id)}>
                        {i === 1 && <span className="text-text-tertiary">≈ </span>}
                        {nameButton(s.id, id)}
                      </span>
                    ))}
                    <span className="block text-xs text-text-tertiary break-words" data-testid="suggestion-merge-reasons">
                      <span className="font-medium text-text-secondary">{t(`suggestions.merge.level.${s.level}`)}</span>
                      {s.reasons.map((r, i) => (
                        <Fragment key={i}>
                          {' · '}
                          <span className={isWarning(r) ? 'text-warning' : undefined}>{mergeReasonText(r)}</span>
                        </Fragment>
                      ))}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block text-sm text-text-primary truncate" title={s.existingId ? label(s.existingId) : s.reason.value}>
                      {s.existingId ? nameButton(s.id, s.existingId) : s.reason.value}
                    </span>
                    <span className="block text-xs text-text-tertiary break-words">
                      <button
                        type="button"
                        onClick={() => togglePivot(s.id)}
                        aria-expanded={openPivots.has(s.id)}
                        data-testid="suggestion-pivot-members"
                        className="inline-flex items-center gap-0.5 hover:text-text-primary hover:underline"
                      >
                        {t(s.existingId ? 'suggestions.pivotExisting' : 'suggestions.pivotNew', { count: s.memberIds.length })}
                        {openPivots.has(s.id) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      {' · '}
                      {s.reason.rule === 'sharedValue' ? s.reason.key : reasonText(s.reason)}
                    </span>
                    {openPivots.has(s.id) && (
                      <ul className="mt-1 pl-2 border-l border-border-default space-y-0.5">
                        {s.memberIds.map((id) => (
                          <li key={id} className="text-xs text-text-secondary break-words" title={label(id)}>
                            {nameButton(s.id, id)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {focus?.row === s.id && elementById.get(focus.id) && preview(elementById.get(focus.id)!)}
              </div>
              <div className="flex gap-0.5 opacity-60 group-hover:opacity-100">
                {reviewDismissed ? (
                  <button
                    onClick={() => handleRestore([s.id])}
                    disabled={busy}
                    title={t('suggestions.restore')}
                    aria-label={t('suggestions.restore')}
                    className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-50"
                  >
                    <RotateCcw size={14} />
                  </button>
                ) : (
                  <>
                    {s.kind === 'merge' ? (
                      <button
                        onClick={() => setMerging(s)}
                        disabled={busy}
                        title={t('suggestions.merge.action')}
                        aria-label={t('suggestions.merge.action')}
                        data-testid="suggestion-merge"
                        className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-50"
                      >
                        <Merge size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleAccept([s.id])}
                        disabled={busy}
                        title={t('suggestions.accept')}
                        aria-label={t('suggestions.accept')}
                        className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-50"
                      >
                        <Check size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDismiss([s.id])}
                      disabled={busy}
                      title={t('suggestions.dismiss')}
                      aria-label={t('suggestions.dismiss')}
                      className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-50"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
          {searched.length > rowLimit && (
            <li className="px-3 py-2">
              <button
                onClick={() => setRowsShown({ list: sorted, limit: rowLimit + ROWS_STEP })}
                data-testid="suggestions-more"
                className="text-xs text-text-secondary hover:text-text-primary underline"
              >
                {t('suggestions.more', { count: Math.min(ROWS_STEP, searched.length - rowLimit) })}
              </button>
            </li>
          )}
        </ul>
      )}

      {merging && merging.elementIds.every((id) => elementById.has(id)) && (
        <MergeElementsModal
          isOpen={true}
          onClose={() => setMerging(null)}
          elements={merging.elementIds.map((id) => elementById.get(id)!)}
          onMerge={async (targetId, [sourceId]) => {
            await merge(merging.id, targetId, sourceId);
            clearHighlight();
          }}
        />
      )}
    </div>
  );
}
