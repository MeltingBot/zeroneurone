import { create } from 'zustand';
import type { Element, Link } from '../types';
import { analyzeLinkSuggestions, dismissalIds, evidenceOf, DEFAULT_MAX_PRESENCE_MS, type Suggestion, type SuggestionReason } from '../services/linkSuggestions';
import { useDossierStore } from './dossierStore';
import { useHistoryStore } from './historyStore';
import { useViewStore } from './viewStore';
import { useQueryStore } from './queryStore';
import { useTabStore } from './tabStore';
import { getDimmedElementIds } from '../utils/filterUtils';
import { getEvaluationModel } from '../utils/evaluation';

/** Label of a created link, from the reason that justified it (translated by the panel) */
export type SuggestionLabeler = (reason: SuggestionReason) => string;


/** Radii offered to the places and meeting rules, in metres */
export const NEARBY_RADII = [50, 100, 500, 1000, 5000] as const;
/** The places rule reaches further (sites of a sector, offences around a
 *  zone); meetings stop at 5 km, where "same place" means little */
export const PLACE_RADII = [...NEARBY_RADII, 10000, 20000, 50000] as const;
const NEARBY_RADIUS_KEY = 'zn:suggestions:radius';
const DEFAULT_NEARBY_RADIUS = 100;

/** Time windows offered for the meeting rule, in ms */
export const MEETING_WINDOWS = [15 * 60_000, 3600_000, 86400_000, 7 * 86400_000] as const;
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
  /** Places rule (points close to each other) on */
  placesEnabled: boolean;
  /** Meeting rule (same place, same time) on, and its time window in ms */
  meetingsEnabled: boolean;
  meetingWindow: number;
  /** Size of the shown set the last analysis was limited to, null when unrestricted */
  shownCount: number | null;
  /** The meeting rule stopped before the end (too many positions for radius and window) */
  meetingsTruncated: boolean;
  /** Only suggestions joining an element of tag `a` to one of tag `b`; null for all */
  between: { a: string; b: string } | null;

  analyze: (scope?: string[] | null) => void;
  /** Run the last analysis again (after an undo/redo touching dismissals) */
  refresh: () => void;
  setNearbyRadius: (radius: number) => void;
  setMeetingRadius: (radius: number) => void;
  setMaxStay: (ms: number) => void;
  setRuleEnabled: (rule: 'values' | 'sources' | 'zones', on: boolean) => void;
  setPlacesEnabled: (on: boolean) => void;
  setMeetingsEnabled: (on: boolean) => void;
  setMeetingWindow: (window: number) => void;
  /** Restrict to suggestions between two tags (both set) and re-run the analysis shown */
  setBetween: (between: { a: string; b: string } | null) => void;
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

  const filteredOut = getDimmedElementIds(elements, filters, hiddenElementIds, evaluationModel);
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
  nearbyRadius: readChoice(NEARBY_RADIUS_KEY, PLACE_RADII, DEFAULT_NEARBY_RADIUS),
  meetingWindow: readChoice(MEETING_WINDOW_KEY, MEETING_WINDOWS, DEFAULT_MEETING_WINDOW),
  meetingRadius: readChoice(MEETING_RADIUS_KEY, NEARBY_RADII, DEFAULT_NEARBY_RADIUS),
  maxStay: readChoice(MAX_STAY_KEY, MAX_STAYS, DEFAULT_MAX_PRESENCE_MS),
  valuesEnabled: readFlag(VALUES_KEY),
  sourcesEnabled: readFlag(SOURCES_KEY),
  zonesEnabled: readFlag(ZONES_KEY),
  placesEnabled: readFlag(PLACES_KEY),
  meetingsEnabled: readFlag(MEETINGS_KEY),
  shownCount: null,
  meetingsTruncated: false,
  between: null,

  analyze: (scope = null) => {
    const { elements, links, assets, currentDossier, updateDossier } = useDossierStore.getState();
    const dismissed = currentDossier?.dismissedSuggestions ?? [];
    const shown = shownElementIds(elements, getEvaluationModel(currentDossier));
    const { suggestions, dismissedSuggestions, staleDismissalIds, meetingsTruncated } = analyzeLinkSuggestions(elements, links, assets, {
      dismissed: new Set(dismissed),
      scope: scope ? new Set(scope) : null,
      rules: { sharedValue: get().valuesEnabled, sharedSource: get().sourcesEnabled, inZone: get().zonesEnabled },
      nearbyRadius: get().placesEnabled ? get().nearbyRadius : null,
      meeting: get().meetingsEnabled
        ? { radius: get().meetingRadius, window: get().meetingWindow, maxPresence: get().maxStay || null }
        : null,
      candidateIds: shown,
      between: get().between,
    });
    set({
      suggestions, dismissedSuggestions, scope, meetingsTruncated,
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
    set({ nearbyRadius: radius });
    saveChoice(NEARBY_RADIUS_KEY, radius);
  },

  setMaxStay: (ms) => {
    set({ maxStay: ms });
    saveChoice(MAX_STAY_KEY, ms);
  },

  setMeetingRadius: (radius) => {
    set({ meetingRadius: radius });
    saveChoice(MEETING_RADIUS_KEY, radius);
  },

  setRuleEnabled: (rule, on) => {
    const key = { values: VALUES_KEY, sources: SOURCES_KEY, zones: ZONES_KEY }[rule];
    set({ [`${rule}Enabled`]: on } as Partial<SuggestionsState>);
    saveChoice(key, on ? 1 : 0);
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
    set({ meetingWindow: window });
    saveChoice(MEETING_WINDOW_KEY, window);
  },

  setBetween: (between) => {
    set({ between: between && between.a && between.b ? between : null });
    get().refresh();
  },

  accept: async (ids, labelFor, describe) => {
    const chosen = (get().suggestions ?? []).filter(s => ids.includes(s.id));
    if (chosen.length === 0) return;
    const store = useDossierStore.getState();
    const elementById = new Map(store.elements.map(el => [el.id, el]));

    const pivots: Element[] = [];
    const specs: { fromId: string; toId: string; options?: Partial<Link> }[] = [];

    for (const s of chosen) {
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

    set(state => ({ suggestions: state.suggestions?.filter(s => !ids.includes(s.id)) ?? null }));
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

  reset: () => set({ suggestions: null, dismissedSuggestions: [], scope: null, dossierId: null, shownCount: null, meetingsTruncated: false, between: null }),
}));
