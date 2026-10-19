import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, RotateCcw, Search, X } from 'lucide-react';
import { useDossierStore, useInsightsStore, useQueryStore, useSelectionStore, useSuggestionsStore, useTabStore, useViewStore } from '../../stores';
import { MAX_STAYS, MEETING_WINDOWS, NEARBY_RADII } from '../../stores/suggestionsStore';
import type { Suggestion, SuggestionReason } from '../../services/linkSuggestions';

/** Compact select of the settings row: same height as the checkbox labels */
const SELECT_CLASS = 'h-6 px-1.5 text-xs rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent disabled:opacity-50';

/** Rows rendered at once: enough to work through, light enough for big dossiers */
const MAX_ROWS = 200;

/** Lowercase without accents, for the list search */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function involvedIds(s: Suggestion): string[] {
  return s.kind === 'link' ? [s.fromId, s.toId] : [...s.memberIds, ...(s.existingId ? [s.existingId] : [])];
}

export function SuggestionsPanel() {
  const { t, i18n } = useTranslation('panels');
  const elements = useDossierStore((s) => s.elements);
  const links = useDossierStore((s) => s.links);
  const currentDossierId = useDossierStore((s) => s.currentDossier?.id ?? null);
  const {
    suggestions, dismissedSuggestions, dossierId, scope, nearbyRadius, meetingRadius, maxStay, placesEnabled, meetingsEnabled, meetingWindow,
    valuesEnabled, sourcesEnabled, zonesEnabled, setRuleEnabled,
    shownCount, meetingsTruncated,
    analyze, refresh, setNearbyRadius, setMeetingRadius, setMaxStay, setPlacesEnabled, setMeetingsEnabled, setMeetingWindow, accept, dismiss, restore,
  } = useSuggestionsStore();
  const highlightSuggestion = useInsightsStore((s) => s.highlightSuggestion);
  const clearHighlight = useInsightsStore((s) => s.clearHighlight);
  const selectElements = useSelectionStore((s) => s.selectElements);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  /** Reviewing the dismissed suggestions instead of the pending ones */
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const [search, setSearch] = useState('');

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
  }, [clearHighlight]);

  const handleAccept = useCallback(
    (ids: string[]) => run(() => accept(ids, linkLabel, reasonText), ids),
    [run, accept, linkLabel, reasonText]
  );
  const handleDismiss = useCallback((ids: string[]) => run(() => dismiss(ids), ids), [run, dismiss]);
  const handleRestore = useCallback((ids: string[]) => run(() => restore(ids), ids), [run, restore]);

  const toggle = (id: string) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // List search: element names and reason texts, accents and case aside
  // Searchable text of each suggestion, built once per list (and only once the
  // analyst types), so a keystroke only scans strings
  const searching = search.trim() !== '';
  const searchIndex = useMemo(() => {
    if (!visible || !searching) return null;
    return visible.map((s) => {
      const parts = involvedIds(s).map(label);
      if (s.kind === 'link') parts.push(...s.reasons.map(reasonText));
      else parts.push(s.reason.value ?? '', s.reason.key ?? '', reasonText(s.reason));
      return fold(parts.join(' '));
    });
  }, [visible, searching, label, reasonText]);

  const searched = useMemo(() => {
    const query = fold(search.trim());
    if (!visible || !query || !searchIndex) return visible;
    return visible.filter((_, i) => searchIndex[i].includes(query));
  }, [visible, search, searchIndex]);

  const shown = searched?.slice(0, MAX_ROWS) ?? [];
  const checkedIds = shown.filter((s) => checked.has(s.id)).map((s) => s.id);
  const allChecked = shown.length > 0 && checkedIds.length === shown.length;
  // Bulk buttons from two rows on: a single row already has its own buttons
  const bulk = checkedIds.length >= 2;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 border-b border-border-default">
        <button
          onClick={() => { setChecked(new Set()); analyze(null); }}
          disabled={elements.length < 2}
          data-testid="suggestions-analyze"
          className="w-full px-3 py-1.5 text-sm rounded border border-border-default text-text-primary bg-bg-secondary hover:bg-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('suggestions.analyze')}
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
            </label>
          ))}
        </div>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-xs text-text-secondary">
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
            <select
              value={nearbyRadius}
              onChange={(e) => { setNearbyRadius(Number(e.target.value)); refresh(); }}
              disabled={!placesEnabled}
              aria-label={t('suggestions.nearbyRadius')}
              title={t('suggestions.nearbyRadius')}
              data-testid="suggestions-nearby-radius"
              className={SELECT_CLASS}
            >
              {NEARBY_RADII.map((radius) => (
                <option key={radius} value={radius}>{formatDistance(radius)}</option>
              ))}
            </select>
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
            <select
              value={meetingRadius}
              onChange={(e) => { setMeetingRadius(Number(e.target.value)); refresh(); }}
              disabled={!meetingsEnabled}
              aria-label={t('suggestions.nearbyRadius')}
              title={t('suggestions.nearbyRadius')}
              data-testid="suggestions-meeting-radius"
              className={SELECT_CLASS}
            >
              {NEARBY_RADII.map((radius) => (
                <option key={radius} value={radius}>{formatDistance(radius)}</option>
              ))}
            </select>
            <span className={meetingsEnabled ? '' : 'opacity-50'}>{t('suggestions.and')}</span>
            <select
              value={meetingWindow}
              onChange={(e) => { setMeetingWindow(Number(e.target.value)); refresh(); }}
              disabled={!meetingsEnabled}
              aria-label={t('suggestions.meetingWindow')}
              title={t('suggestions.meetingWindow')}
              data-testid="suggestions-meeting-window"
              className={SELECT_CLASS}
            >
              {MEETING_WINDOWS.map((window) => (
                <option key={window} value={window}>±{formatWindow(window)}</option>
              ))}
            </select>
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
        </div>
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
              <button
                onClick={() => handleAccept(checkedIds)}
                disabled={busy}
                data-testid="suggestions-accept-checked"
                className="px-2 py-0.5 text-xs font-medium rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {t('suggestions.acceptN', { count: checkedIds.length })}
              </button>
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
              onMouseEnter={() => highlightSuggestion(involvedIds(s))}
              onMouseLeave={clearHighlight}
              className="group flex items-start gap-2 px-3 py-2 hover:bg-bg-secondary"
            >
              <input
                type="checkbox"
                checked={checked.has(s.id)}
                onChange={() => toggle(s.id)}
                className="mt-0.5 rounded border-border-default"
              />
              <button
                onClick={() => selectElements(involvedIds(s))}
                className="flex-1 min-w-0 text-left"
              >
                {s.kind === 'link' ? (
                  <>
                    <span className="block text-sm text-text-primary truncate" title={`${label(s.fromId)} — ${label(s.toId)}`}>
                      {label(s.fromId)} — {label(s.toId)}
                    </span>
                    {s.reasons.map((reason, i) => (
                      <span key={i} className="block text-xs text-text-tertiary break-words">
                        {reasonText(reason)}
                      </span>
                    ))}
                  </>
                ) : (
                  <>
                    <span className="block text-sm text-text-primary truncate" title={s.existingId ? label(s.existingId) : s.reason.value}>
                      {s.existingId ? label(s.existingId) : s.reason.value}
                    </span>
                    <span className="block text-xs text-text-tertiary break-words">
                      {t(s.existingId ? 'suggestions.pivotExisting' : 'suggestions.pivotNew', { count: s.memberIds.length })}
                      {' · '}
                      {s.reason.rule === 'sharedValue' ? s.reason.key : reasonText(s.reason)}
                    </span>
                  </>
                )}
              </button>
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
                    <button
                      onClick={() => handleAccept([s.id])}
                      disabled={busy}
                      title={t('suggestions.accept')}
                      aria-label={t('suggestions.accept')}
                      className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-tertiary disabled:opacity-50"
                    >
                      <Check size={14} />
                    </button>
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
          {searched.length > MAX_ROWS && (
            <li className="px-3 py-2 text-xs text-text-tertiary">
              {t('suggestions.more', { count: searched.length - MAX_ROWS })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
