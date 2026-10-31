import { create } from 'zustand';
import type { Element, Link } from '../types';
import { analyzeLinkSuggestions, dismissalIds, evidenceOf, DEFAULT_MAX_PRESENCE_MS, type Suggestion, type SuggestionReason } from '../services/linkSuggestions';
import { DEFAULT_MERGE_RANK, MERGE_LEVELS } from '../services/dedup/candidates';
import { getPhoneParser } from '../services/dedup/phoneLib';
import { useDossierStore } from './dossierStore';
import { useHistoryStore } from './historyStore';
import { useViewStore } from './viewStore';
import { useQueryStore } from './queryStore';
import { useTabStore } from './tabStore';
import { getDimmedElementIds } from '../utils/filterUtils';
import { getEvaluationModel } from '../utils/evaluation';
import { datePropertyRules } from '../utils/temporalUtils';
import { getTabFilterIds } from '../hooks/useTabFilterIds';

/** Label of a created link, from the reason that justified it (translated by the panel) */
export type SuggestionLabeler = (reason: SuggestionReason) => string;


/** Bounds of the distance the places and meeting rules accept, in metres:
 *  the analyst types it */
export const RADIUS_BOUNDS = { min: 1, max: 100_000 } as const;
const NEARBY_RADIUS_KEY = 'zn:suggestions:radius';
const DEFAULT_NEARBY_RADIUS = 100;

/** Bounds of the meeting rule time window, in ms: the analyst types it */
export const WINDOW_BOUNDS = { min: 60_000, max: 365 * 86400_000 } as const;
const MEETING_WINDOW_KEY = 'zn:suggestions:meetingWindow';
const DEFAULT_MEETING_WINDOW = 3600_000;

const MEETING_RADIUS_KEY = 'zn:suggestions:meetingRadius';

/** Longest presence counted by the meeting rule, in ms (0 = no limit) */
export const MAX_STAYS = [86400_000, 7 * 86400_000, 30 * 86400_000, 0] as const;
const MAX_STAY_KEY = 'zn:suggestions:maxStay';

const VALUES_KEY = 'zn:suggestions:values';
const SOURCES_KEY = 'zn:suggestions:sources';
const ZONES_KEY = 'zn:suggestions:zones';
const PLACES_KEY = 'zn:suggestions:places';
const MEETINGS_KEY = 'zn:suggestions:meetings';
const DUPLICATES_KEY = 'zn:suggestions:duplicates';
const DUPLICATE_THRESHOLD_KEY = 'zn:suggestions:duplicateLevel';
/** Lowest level of a possible duplicate the analyst can pick, as its rank */
const DUPLICATE_RANKS = MERGE_LEVELS.map((l) => l.rank);
/** Property keys left out, per dossier (keys differ from one dossier to the next) */
const EXCLUDED_KEYS_PREFIX = 'zn:suggestions:excludedKeys:';

function readExcludedKeys(dossierId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(EXCLUDED_KEYS_PREFIX + dossierId) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function saveExcludedKeys(dossierId: string, keys: string[]): void {
  try {
    if (keys.length > 0) localStorage.setItem(EXCLUDED_KEYS_PREFIX + dossierId, JSON.stringify(keys));
    else localStorage.removeItem(EXCLUDED_KEYS_PREFIX + dossierId);
  } catch {
    // Per-viewer convenience only
  }
}

/** What this viewer picked last time (a convenience: storage may be unavailable) */
function readChoice(key: string, allowed: readonly number[], fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    const stored = Number(raw);
    return raw !== null && allowed.includes(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

/** A typed amount, within its bounds */
export function clampAmount(value: number, bounds: { min: number; max: number }): number {
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

function readAmount(key: string, bounds: { min: number; max: number }, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    const stored = Number(raw);
    return raw !== null && Number.isFinite(stored) && stored > 0 ? clampAmount(stored, bounds) : fallback;
  } catch {
    return fallback;
  }
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
}

function saveChoice(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Per-viewer convenience only
  }
}

/** A link a checked suggestion would draw */
export interface PreviewPair {
  id: string;
  fromId: string;
  toId: string;
}

interface SuggestionsState {
  /** Last analysis, null before any (computed on demand only, never in the background) */
  suggestions: Suggestion[] | null;
  /** What the last analysis found but the analyst had dismissed (to review, restore) */
  dismissedSuggestions: Suggestion[];
  /** Dossier the suggestions belong to (ignored once another dossier is open) */
  dossierId: string | null;
  /** Elements the analysis was restricted to, null for the whole dossier */
  scope: string[] | null;
  /** Radius of the places rule, in metres */
  nearbyRadius: number;
  /** Radius of the meeting rule, in metres */
  meetingRadius: number;
  /** Longest presence the meeting rule counts, in ms (0 = no limit) */
  maxStay: number;
  /** Shared property values, shared sources, zone containment rules on */
  valuesEnabled: boolean;
  sourcesEnabled: boolean;
  zonesEnabled: boolean;
  /** Possible duplicates rule on, and the lowest level it keeps (its rank) */
  duplicatesEnabled: boolean;
  duplicateThreshold: number;
  /** Places rule (points close to each other) on */
  placesEnabled: boolean;
  /** Meeting rule (same place, same time) on, and its time window in ms */
  meetingsEnabled: boolean;
  meetingWindow: number;
  /** Size of the shown set the last analysis was limited to, null when unrestricted */
  shownCount: number | null;
  /** The meeting rule stopped before the end (too many positions for radius and window) */
  meetingsTruncated: boolean;
  /** Elements left out as crowds by the last analysis (too many neighbours) */
  crowdedCount: number;
  /** Suggestions checked in the list: kept while the side panel shows another tab */
  checked: Set<string>;
  setChecked: (next: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  /** Links the checked suggestions would draw, shown on the canvas until accepted */
  previewPairs: PreviewPair[];
  setPreviewPairs: (pairs: PreviewPair[]) => void;
  /** Only suggestions joining an element of tag `a` to one of tag `b`; null for all */
  between: { a: string; b: string } | null;
  /** Property keys (folded) the shared values rule leaves out, for keysDossierId */
  excludedKeys: string[];
  keysDossierId: string | null;

  analyze: (scope?: string[] | null) => void;
  /** Run the last analysis again (after an undo/redo touching dismissals) */
  refresh: () => void;
  setNearbyRadius: (radius: number) => void;
  setMeetingRadius: (radius: number) => void;
  setMaxStay: (ms: number) => void;
  setRuleEnabled: (rule: 'values' | 'sources' | 'zones' | 'duplicates', on: boolean) => void;
  setDuplicateThreshold: (rank: number) => void;
  /** Merge a possible duplicate (one undo step); the suggestion leaves the list */
  merge: (suggestionId: string, targetId: string, sourceId: string) => Promise<void>;
  setPlacesEnabled: (on: boolean) => void;
  setMeetingsEnabled: (on: boolean) => void;
  setMeetingWindow: (window: number) => void;
  /** Restrict to suggestions between two tags (both set) and re-run the analysis shown */
  setBetween: (between: { a: string; b: string } | null) => void;
  /** Read this dossier's left-out property keys (once per dossier) */
  loadExcludedKeys: (dossierId: string | null) => void;
  /** Leave these property keys (folded) out of the shared values rule */
  setExcludedKeys: (keys: string[]) => void;
  /** Create the links (and pivot elements) of these suggestions, as one undo step */
  /** `describe` gives the full text of a reason, kept in the link's notes */
  accept: (ids: string[], labelFor: SuggestionLabeler, describe: SuggestionLabeler) => Promise<void>;
  /** Hide these suggestions for good (stored in the dossier, shared) */
  dismiss: (ids: string[]) => Promise<void>;
  /** Bring dismissed suggestions back (ids from dismissedSuggestions) */
  restore: (ids: string[]) => Promise<void>;
  reset: () => void;
}

/**
 * Elements the views currently show, or null when nothing narrows them: hidden
 * elements, the active tab, the view filters and a ZNQuery run as a filter
 * all take elements out of the analysis, as they take them out of sight.
 */
function shownElementIds(elements: Element[], evaluationModel: ReturnType<typeof getEvaluationModel>): Set<string> | null {
  const { filters, hiddenElementIds } = useViewStore.getState();
  const { isFilterActive, matchingElementIds } = useQueryStore.getState();
  const { activeTabId, memberSet } = useTabStore.getState();

  const filteredOut = getDimmedElementIds(elements, filters, hiddenElementIds, evaluationModel, getTabFilterIds());
  const queryNarrows = isFilterActive && matchingElementIds.size > 0;
  if (hiddenElementIds.size === 0 && filteredOut.size === 0 && !queryNarrows && activeTabId === null) return null;

  return new Set(elements
    .filter(el =>
      !hiddenElementIds.has(el.id) &&
      !filteredOut.has(el.id) &&
      (!queryNarrows || matchingElementIds.has(el.id)) &&
      (activeTabId === null || memberSet.has(el.id)))
    .map(el => el.id));
}

/** Where to put a new pivot: above the middle of its members */
function pivotPosition(members: Element[]): { x: number; y: number } {
  if (members.length === 0) return { x: 0, y: 0 };
  const x = members.reduce((sum, el) => sum + el.position.x, 0) / members.length;
  const y = Math.min(...members.map(el => el.position.y));
  return { x, y: y - 160 };
}

export const useSuggestionsStore = create<SuggestionsState>((set, get) => ({
  suggestions: null,
  dismissedSuggestions: [],
  dossierId: null,
  scope: null,
  nearbyRadius: readAmount(NEARBY_RADIUS_KEY, RADIUS_BOUNDS, DEFAULT_NEARBY_RADIUS),
  meetingWindow: readAmount(MEETING_WINDOW_KEY, WINDOW_BOUNDS, DEFAULT_MEETING_WINDOW),
  meetingRadius: readAmount(MEETING_RADIUS_KEY, RADIUS_BOUNDS, DEFAULT_NEARBY_RADIUS),
  maxStay: readChoice(MAX_STAY_KEY, MAX_STAYS, DEFAULT_MAX_PRESENCE_MS),
  valuesEnabled: readFlag(VALUES_KEY),
  sourcesEnabled: readFlag(SOURCES_KEY),
  zonesEnabled: readFlag(ZONES_KEY),
  placesEnabled: readFlag(PLACES_KEY),
  duplicatesEnabled: readFlag(DUPLICATES_KEY),
  duplicateThreshold: readChoice(DUPLICATE_THRESHOLD_KEY, DUPLICATE_RANKS, DEFAULT_MERGE_RANK),
  meetingsEnabled: readFlag(MEETINGS_KEY),
  shownCount: null,
  meetingsTruncated: false,
  crowdedCount: 0,
  checked: new Set(),
  setChecked: (next) => set({ checked: typeof next === 'function' ? next(get().checked) : next }),
  previewPairs: [],
  setPreviewPairs: (pairs) => {
    const current = get().previewPairs;
    const same = pairs.length === current.length && pairs.every((p, i) => p.id === current[i].id);
    if (!same) set({ previewPairs: pairs });
  },
  between: null,
  excludedKeys: [],
  keysDossierId: null,

  analyze: (scope = null) => {
    const { elements, links, assets, currentDossier, updateDossier } = useDossierStore.getState();
    get().loadExcludedKeys(currentDossier?.id ?? null);
    const dismissed = currentDossier?.dismissedSuggestions ?? [];
    const shown = shownElementIds(elements, getEvaluationModel(currentDossier));
    const { suggestions, dismissedSuggestions, staleDismissalIds, meetingsTruncated, crowdedCount } = analyzeLinkSuggestions(elements, links, assets, {
      dismissed: new Set(dismissed),
      scope: scope ? new Set(scope) : null,
      rules: { sharedValue: get().valuesEnabled, sharedSource: get().sourcesEnabled, inZone: get().zonesEnabled },
      nearbyRadius: get().placesEnabled ? get().nearbyRadius : null,
      meeting: get().meetingsEnabled
        ? {
          radius: get().meetingRadius, window: get().meetingWindow, maxPresence: get().maxStay || null,
          dateProperties: datePropertyRules(useViewStore.getState().filters),
        }
        : null,
      candidateIds: shown,
      // French numbers only until the phone library is loaded (the panel loads it)
      duplicates: get().duplicatesEnabled ? { minRank: get().duplicateThreshold, parsePhone: getPhoneParser() } : null,
      between: get().between,
      excludedKeys: new Set(get().excludedKeys),
    });
    set({
      suggestions, dismissedSuggestions, scope, meetingsTruncated, crowdedCount,
      dossierId: currentDossier?.id ?? null,
      shownCount: shown ? shown.size : null,
    });

    // Forget dismissals the data no longer produces (element deleted, value
    // gone): the dossier keeps no trace of what was removed from it. Only on
    // a complete analysis — a filtered or interrupted one doesn't see every pair.
    const kept = dismissed.filter(id => !staleDismissalIds.has(id));
    if (currentDossier && !shown && !get().between && !meetingsTruncated && kept.length < dismissed.length) {
      void updateDossier(currentDossier.id, { dismissedSuggestions: kept });
    }
  },

  refresh: () => {
    const { suggestions, dossierId, scope, analyze } = get();
    if (suggestions && dossierId === useDossierStore.getState().currentDossier?.id) analyze(scope);
  },

  setNearbyRadius: (radius) => {
    const value = clampAmount(radius, RADIUS_BOUNDS);
    set({ nearbyRadius: value });
    saveChoice(NEARBY_RADIUS_KEY, value);
  },

  setMaxStay: (ms) => {
    set({ maxStay: ms });
    saveChoice(MAX_STAY_KEY, ms);
  },

  setMeetingRadius: (radius) => {
    const value = clampAmount(radius, RADIUS_BOUNDS);
    set({ meetingRadius: value });
    saveChoice(MEETING_RADIUS_KEY, value);
  },

  setRuleEnabled: (rule, on) => {
    const key = { values: VALUES_KEY, sources: SOURCES_KEY, zones: ZONES_KEY, duplicates: DUPLICATES_KEY }[rule];
    set({ [`${rule}Enabled`]: on } as Partial<SuggestionsState>);
    saveChoice(key, on ? 1 : 0);
  },

  setDuplicateThreshold: (rank) => {
    set({ duplicateThreshold: rank });
    saveChoice(DUPLICATE_THRESHOLD_KEY, rank);
  },

  merge: async (suggestionId, targetId, sourceId) => {
    const snapshot = await useDossierStore.getState().mergeElements(targetId, sourceId);
    useHistoryStore.getState().pushAction({
      type: 'merge-elements',
      undo: { snapshot },
      redo: { snapshot },
    });
    set(state => ({ suggestions: state.suggestions?.filter(s => s.id !== suggestionId) ?? null }));
  },

  setPlacesEnabled: (on) => {
    set({ placesEnabled: on });
    saveChoice(PLACES_KEY, on ? 1 : 0);
  },

  setMeetingsEnabled: (on) => {
    set({ meetingsEnabled: on });
    saveChoice(MEETINGS_KEY, on ? 1 : 0);
  },

  setMeetingWindow: (window) => {
    const value = clampAmount(window, WINDOW_BOUNDS);
    set({ meetingWindow: value });
    saveChoice(MEETING_WINDOW_KEY, value);
  },

  loadExcludedKeys: (dossierId) => {
    if (dossierId === get().keysDossierId) return;
    set({ keysDossierId: dossierId, excludedKeys: dossierId ? readExcludedKeys(dossierId) : [] });
  },

  setExcludedKeys: (keys) => {
    const unique = [...new Set(keys)];
    set({ excludedKeys: unique });
    const { keysDossierId } = get();
    if (keysDossierId) saveExcludedKeys(keysDossierId, unique);
    get().refresh();
  },

  setBetween: (between) => {
    set({ between: between && between.a && between.b ? between : null });
    get().refresh();
  },

  accept: async (ids, labelFor, describe) => {
    // A merge is accepted one at a time, through the merge dialog (see merge)
    const chosen = (get().suggestions ?? []).filter(s => ids.includes(s.id) && s.kind !== 'merge');
    if (chosen.length === 0) return;
    const store = useDossierStore.getState();
    const elementById = new Map(store.elements.map(el => [el.id, el]));

    const pivots: Element[] = [];
    const specs: { fromId: string; toId: string; options?: Partial<Link> }[] = [];

    for (const s of chosen) {
      if (s.kind === 'merge') continue;
      if (s.kind === 'link') {
        specs.push({
          fromId: s.fromId,
          toId: s.toId,
          options: { label: labelFor(s.reasons[0]), ...evidenceOf(s.reasons, describe, store.assets) },
        });
        continue;
      }
      let pivotId = s.existingId;
      if (!pivotId) {
        const { reason } = s;
        const members = s.memberIds.map(id => elementById.get(id)).filter((el): el is Element => !!el);
        const pivot = await store.createElement(reason.value ?? '', pivotPosition(members), {
          ...(reason.key ? { tags: [reason.key] } : {}),
          ...(reason.assetId ? { assetIds: [reason.assetId] } : {}),
          ...(reason.url ? { source: reason.url } : {}),
        });
        pivots.push(pivot);
        pivotId = pivot.id;
      }
      // Member → pivot, labelled with what they share ("téléphone", "source")
      const label = s.reason.key ?? labelFor(s.reason);
      for (const memberId of s.memberIds) {
        specs.push({ fromId: memberId, toId: pivotId, options: { label } });
      }
    }

    const links = specs.length > 0 ? store.createLinks(specs) : [];
    useHistoryStore.getState().pushAction({
      type: 'create-elements',
      undo: {},
      redo: {
        elements: pivots,
        links,
        ...(pivots.length > 0 ? { elementIds: pivots.map(p => p.id) } : {}),
        linkIds: links.map(l => l.id),
      },
    });

    const accepted = new Set(chosen.map(s => s.id));
    set(state => ({ suggestions: state.suggestions?.filter(s => !accepted.has(s.id)) ?? null }));
  },

  dismiss: async (ids) => {
    const { currentDossier, updateDossier } = useDossierStore.getState();
    if (!currentDossier || ids.length === 0) return;
    const chosen = (get().suggestions ?? []).filter(s => ids.includes(s.id));
    const before = currentDossier.dismissedSuggestions ?? [];
    const after = [...new Set([...before, ...chosen.flatMap(dismissalIds)])];
    await updateDossier(currentDossier.id, { dismissedSuggestions: after });
    useHistoryStore.getState().pushAction({
      type: 'dismiss-suggestions',
      undo: { snapshot: { dossierId: currentDossier.id, dismissedSuggestions: before } },
      redo: { snapshot: { dossierId: currentDossier.id, dismissedSuggestions: after } },
    });
    get().refresh(); // the dismissed part moves to the review list
  },

  restore: async (ids) => {
    const { currentDossier, updateDossier } = useDossierStore.getState();
    const chosen = get().dismissedSuggestions.filter(s => ids.includes(s.id));
    if (!currentDossier || chosen.length === 0) return;
    const restored = new Set(chosen.flatMap(dismissalIds));
    const before = currentDossier.dismissedSuggestions ?? [];
    const after = before.filter(id => !restored.has(id));
    await updateDossier(currentDossier.id, { dismissedSuggestions: after });
    useHistoryStore.getState().pushAction({
      type: 'dismiss-suggestions',
      undo: { snapshot: { dossierId: currentDossier.id, dismissedSuggestions: before } },
      redo: { snapshot: { dossierId: currentDossier.id, dismissedSuggestions: after } },
    });
    get().refresh();
  },

  reset: () => set({ suggestions: null, dismissedSuggestions: [], scope: null, dossierId: null, shownCount: null, meetingsTruncated: false, crowdedCount: 0, checked: new Set(), previewPairs: [], between: null }),
}));
