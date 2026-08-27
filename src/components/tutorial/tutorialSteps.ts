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
  /** Ids présents à l'entrée dans le dossier tutoriel (référence fixe). */
  startElementIds: string[] | null;
}

export interface TutorialStep {
  id: string;
  /**
   * Sélecteur CSS de la cible (statique ou calculé depuis l'état).
   * null = carte centrée sans ancrage.
   */
  target: string | ((ctx: StepContext) => string | null) | null;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  advanceOn: 'button' | 'auto';
  page: 'home' | 'dossier' | 'any';
  /** Marqueur de point d'action sur le canvas (étapes de création). */
  marker?: 'canvas-center' | 'right-of-first-element';
  /**
   * Une fois isComplete vrai, ne pas avancer automatiquement : afficher le
   * texte `steps.<id>.explore` et attendre « Suivant » (laisser le temps
   * d'observer, ex. les vues Carte/Chronologie/Matrice).
   */
  confirmAfter?: boolean;
  isComplete?: (ctx: StepContext) => boolean;
}

/** Éléments créés depuis l'entrée dans le dossier tutoriel. */
function newElements(ctx: StepContext): Element[] {
  const known = new Set(ctx.startElementIds ?? ctx.baseline?.elementIds ?? []);
  return ctx.elements.filter((e) => !e.isGroup && !known.has(e.id));
}

function totalEvents(elements: Element[]): number {
  return elements.reduce((n, e) => n + (e.events?.length ?? 0), 0);
}

/** Cible : nième élément créé depuis le baseline, sinon null. */
function nodeSelector(ctx: StepContext, index: number): string | null {
  const created = newElements(ctx);
  const el = created[index];
  return el ? `.react-flow__node[data-id="${el.id}"]` : null;
}

/** Le lien créé pendant le tutoriel (entre deux éléments du tutoriel). */
function tutorialLink(ctx: StepContext): Link | undefined {
  const ids = new Set(newElements(ctx).map((e) => e.id));
  return ctx.links.find((l) => ids.has(l.fromId) && ids.has(l.toId));
}

/** L'élément a-t-il été renommé (label différent du label de création par défaut) ? */
function isRenamed(el: Element | undefined): boolean {
  if (!el) return false;
  const label = el.label.trim();
  return label !== '' && label !== i18n.t('common:labels.newElement');
}

/** Premier sélecteur dont une occurrence est réellement visible (pas dans un accordéon replié). */
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
    // 'any' : la validation survient au moment où la création navigue vers
    // /dossier/:id — un garde 'home' la bloquerait juste avant l'avancement.
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
    // Valide dès qu'une propriété RENSEIGNÉE existe sur un élément du tutoriel :
    // les tags (TagSets) peuvent pré-créer des propriétés à valeur nulle — les
    // remplir compte autant qu'en ajouter une nouvelle.
    isComplete: (ctx) =>
      newElements(ctx).some((e) =>
        e.properties?.some(
          (p) => p.value !== null && p.value !== undefined && String(p.value).trim() !== ''
        )
      ),
  },
  {
    id: 'addEvent',
    // Le clic sur « Ajouter un événement » crée l'événement immédiatement :
    // dès qu'une carte d'événement est montée, la bulle bascule sur son libellé.
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
