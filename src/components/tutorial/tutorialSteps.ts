import type { Element, Link, DisplayMode } from '../../types';
import type { TutorialBaseline } from '../../stores/tutorialStore';
import i18n from '../../i18n';
import { isTutorialTargetVisible } from './useTutorialTarget';

export interface StepContext {
  elements: Element[];
  links: Link[];
  currentDossierId: string | null;
  selectedCount: number;
  displayMode: DisplayMode;
  baseline: TutorialBaseline | null;
  tutorialDossierId: string | null;
  /** Ids present on entering the tutorial dossier (fixed reference). */
  startElementIds: string[] | null;
}

export interface TutorialStep {
  id: string;
  /**
   * CSS selector of the target (static or computed from the state).
   * null = centred card with no anchor.
   */
  target: string | ((ctx: StepContext) => string | null) | null;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  advanceOn: 'button' | 'auto';
  page: 'home' | 'dossier' | 'any';
  /** Action point marker on the canvas (creation steps). */
  marker?: 'canvas-center' | 'right-of-first-element';
  /**
   * Once isComplete is true, do not advance automatically: show the
   * `steps.<id>.explore` text and wait for "Next" (time to look around,
   * e.g. the Map/Timeline/Matrix views).
   */
  confirmAfter?: boolean;
  isComplete?: (ctx: StepContext) => boolean;
}

/** Elements created since entering the tutorial dossier. */
function newElements(ctx: StepContext): Element[] {
  const known = new Set(ctx.startElementIds ?? ctx.baseline?.elementIds ?? []);
  return ctx.elements.filter((e) => !e.isGroup && !known.has(e.id));
}

function totalEvents(elements: Element[]): number {
  return elements.reduce((n, e) => n + (e.events?.length ?? 0), 0);
}

/** Target: nth element created since the baseline, else null. */
function nodeSelector(ctx: StepContext, index: number): string | null {
  const created = newElements(ctx);
  const el = created[index];
  return el ? `.react-flow__node[data-id="${el.id}"]` : null;
}

/** The link created during the tutorial (between two tutorial elements). */
function tutorialLink(ctx: StepContext): Link | undefined {
  const ids = new Set(newElements(ctx).map((e) => e.id));
  return ctx.links.find((l) => ids.has(l.fromId) && ids.has(l.toId));
}

/** Has the element been renamed (label other than the default creation label)? */
function isRenamed(el: Element | undefined): boolean {
  if (!el) return false;
  const label = el.label.trim();
  return label !== '' && label !== i18n.t('common:labels.newElement');
}

/** First selector with an actually visible occurrence (not inside a collapsed accordion). */
const firstMounted = (selectors: string[]): string | null => {
  for (const sel of selectors) {
    const candidates = document.querySelectorAll<HTMLElement>(sel);
    for (const el of candidates) {
      if (isTutorialTargetVisible(el)) return sel;
    }
  }
  return selectors[selectors.length - 1] ?? null;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'intro',
    target: null,
    advanceOn: 'button',
    page: 'any',
  },
  {
    id: 'createDossier',
    target: '[data-tutorial="new-dossier"]',
    placement: 'bottom',
    advanceOn: 'auto',
    page: 'home',
    isComplete: () => !!document.querySelector('[data-tutorial="dossier-name"]'),
  },
  {
    id: 'nameDossier',
    target: '[data-tutorial="dossier-name"]',
    placement: 'bottom',
    advanceOn: 'auto',
    // 'any': validation happens when the creation navigates to
    // /dossier/:id — a 'home' guard would block it just before advancing.
    page: 'any',
    isComplete: (ctx) => ctx.currentDossierId !== null,
  },
  {
    id: 'firstElement',
    target: '[data-tutorial="canvas"]',
    marker: 'canvas-center',
    advanceOn: 'auto',
    page: 'dossier',
    isComplete: (ctx) => newElements(ctx).length >= 1,
  },
  {
    id: 'nameFirstElement',
    target: (ctx) => nodeSelector(ctx, 0) ?? '[data-tutorial="canvas"]',
    placement: 'top',
    advanceOn: 'auto',
    page: 'dossier',
    isComplete: (ctx) => isRenamed(newElements(ctx)[0]),
  },
  {
    id: 'secondElement',
    target: (ctx) => nodeSelector(ctx, 0) ?? '[data-tutorial="canvas"]',
    marker: 'right-of-first-element',
    placement: 'top',
    advanceOn: 'auto',
    page: 'dossier',
    isComplete: (ctx) => newElements(ctx).length >= 2,
  },
  {
    id: 'nameSecondElement',
    target: (ctx) => nodeSelector(ctx, 1) ?? '[data-tutorial="canvas"]',
    placement: 'top',
    advanceOn: 'auto',
    page: 'dossier',
    isComplete: (ctx) => isRenamed(newElements(ctx)[1]),
  },
  {
    id: 'createLink',
    target: (ctx) => nodeSelector(ctx, 0) ?? '[data-tutorial="canvas"]',
    placement: 'top',
    advanceOn: 'auto',
    page: 'dossier',
    isComplete: (ctx) =>
      ctx.baseline !== null && ctx.links.length >= ctx.baseline.links + 1,
  },
  {
    id: 'nameLink',
    target: (ctx) => {
      const link = tutorialLink(ctx);
      return link
        ? `[data-testid="rf__edge-${link.id}"]`
        : nodeSelector(ctx, 0) ?? '[data-tutorial="canvas"]';
    },
    placement: 'top',
    advanceOn: 'auto',
    page: 'dossier',
    isComplete: (ctx) => (tutorialLink(ctx)?.label.trim() ?? '') !== '',
  },
  {
    id: 'selectElement',
    target: (ctx) => nodeSelector(ctx, 1) ?? nodeSelector(ctx, 0) ?? '[data-tutorial="canvas"]',
    placement: 'top',
    advanceOn: 'auto',
    page: 'dossier',
    isComplete: (ctx) => ctx.selectedCount > 0,
  },
  {
    id: 'addTag',
    target: () =>
      firstMounted(['[data-tutorial="element-tags"]', '[data-tutorial="detail-panel"]']),
    placement: 'left',
    advanceOn: 'auto',
    page: 'dossier',
    isComplete: (ctx) =>
      ctx.baseline !== null &&
      ctx.elements.reduce((n, e) => n + (e.tags?.length ?? 0), 0) >= ctx.baseline.tags + 1,
  },
  {
    id: 'addProperty',
    target: () =>
      firstMounted([
        '[data-tutorial="add-property"]',
        '[data-tutorial="properties-section"]',
        '[data-tutorial="detail-panel"]',
      ]),
    placement: 'left',
    advanceOn: 'auto',
    page: 'dossier',
    // Completes as soon as a FILLED-IN property exists on a tutorial element:
    // tags (TagSets) can pre-create properties with a null value — filling
    // them in counts as much as adding a new one.
    isComplete: (ctx) =>
      newElements(ctx).some((e) =>
        e.properties?.some(
          (p) => p.value !== null && p.value !== undefined && String(p.value).trim() !== ''
        )
      ),
  },
  {
    id: 'addEvent',
    // Clicking "Add event" creates the event immediately:
    // once an event card is mounted, the bubble moves to its label.
    target: () =>
      firstMounted([
        '[data-tutorial="event-label"]',
        '[data-tutorial="add-event"]',
        '[data-tutorial="events-section"]',
        '[data-tutorial="detail-panel"]',
      ]),
    placement: 'left',
    advanceOn: 'auto',
    page: 'dossier',
    isComplete: (ctx) =>
      ctx.baseline !== null &&
      totalEvents(ctx.elements) >= ctx.baseline.events + 1 &&
      ctx.elements.some((e) => e.events?.some((ev) => ev.label.trim() !== '')),
  },
  {
    id: 'addGeo',
    target: () =>
      firstMounted([
        '[data-tutorial="pick-on-map"]',
        '[data-tutorial="location-section"]',
        '[data-tutorial="detail-panel"]',
      ]),
    placement: 'left',
    advanceOn: 'auto',
    page: 'dossier',
    isComplete: (ctx) =>
      ctx.baseline !== null &&
      ctx.elements.filter((e) => !!e.geo).length >= ctx.baseline.geo + 1,
  },
  {
    id: 'viewMap',
    target: '[data-tutorial="view-map"]',
    placement: 'bottom',
    advanceOn: 'auto',
    confirmAfter: true,
    page: 'dossier',
    isComplete: (ctx) => ctx.displayMode === 'map',
  },
  {
    id: 'viewTimeline',
    target: '[data-tutorial="view-timeline"]',
    placement: 'bottom',
    advanceOn: 'auto',
    confirmAfter: true,
    page: 'dossier',
    isComplete: (ctx) => ctx.displayMode === 'timeline',
  },
  {
    id: 'viewMatrix',
    target: '[data-tutorial="view-matrix"]',
    placement: 'bottom',
    advanceOn: 'auto',
    confirmAfter: true,
    page: 'dossier',
    isComplete: (ctx) => ctx.displayMode === 'matrix',
  },
  {
    id: 'done',
    target: null,
    advanceOn: 'button',
    page: 'any',
  },
];
