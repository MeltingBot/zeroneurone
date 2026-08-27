import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useDossierStore } from './dossierStore';

const TUTORIAL_STATUS_KEY = 'zeroneurone:tutorial-status';

export interface TutorialBaseline {
  elements: number;
  links: number;
  properties: number;
  events: number;
  geo: number;
  tags: number;
  elementIds: string[];
}

interface TutorialState {
  active: boolean;
  stepIndex: number;
  tutorialDossierId: string | null;
  suggestedDossierName: string | null;
  baseline: TutorialBaseline | null;
  /** Ids des éléments présents à l'entrée dans le dossier tutoriel (jamais recapturé). */
  startElementIds: string[] | null;
  start: () => void;
  next: (totalSteps: number) => void;
  exit: () => void;
  complete: () => void;
  setTutorialDossierId: (id: string) => void;
  captureBaseline: () => void;
}

function randomSuffix(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function snapshotBaseline(): TutorialBaseline {
  const { elements, links } = useDossierStore.getState();
  const realElements = elements.filter((e) => !e.isGroup);
  return {
    elements: realElements.length,
    links: links.length,
    properties: elements.reduce((n, e) => n + (e.properties?.length ?? 0), 0),
    events: elements.reduce((n, e) => n + (e.events?.length ?? 0), 0),
    geo: elements.filter((e) => !!e.geo).length,
    tags: elements.reduce((n, e) => n + (e.tags?.length ?? 0), 0),
    elementIds: realElements.map((e) => e.id),
  };
}

export const useTutorialStore = create<TutorialState>()(
  persist(
    (set, get) => ({
  active: false,
  stepIndex: 0,
  tutorialDossierId: null,
  suggestedDossierName: null,
  baseline: null,
  startElementIds: null,

  start: () => {
    set({
      active: true,
      stepIndex: 0,
      tutorialDossierId: null,
      suggestedDossierName: `Tutoriel-${randomSuffix()}`,
      baseline: snapshotBaseline(),
      startElementIds: null,
    });
  },

  next: (totalSteps) => {
    const { stepIndex } = get();
    if (stepIndex + 1 >= totalSteps) {
      get().complete();
      return;
    }
    set({ stepIndex: stepIndex + 1, baseline: snapshotBaseline() });
  },

  exit: () => {
    try {
      localStorage.setItem(TUTORIAL_STATUS_KEY, 'exited');
    } catch {
      // localStorage indisponible : ignorer
    }
    set({ active: false, tutorialDossierId: null, suggestedDossierName: null, baseline: null, startElementIds: null });
  },

  complete: () => {
    try {
      localStorage.setItem(TUTORIAL_STATUS_KEY, 'completed');
    } catch {
      // localStorage indisponible : ignorer
    }
    set({ active: false, tutorialDossierId: null, suggestedDossierName: null, baseline: null, startElementIds: null });
  },

  setTutorialDossierId: (id) =>
    set({
      tutorialDossierId: id,
      startElementIds: useDossierStore
        .getState()
        .elements.filter((e) => !e.isGroup)
        .map((e) => e.id),
    }),

  captureBaseline: () => set({ baseline: snapshotBaseline() }),
    }),
    {
      // Persistance de la progression : un rechargement de page reprend le
      // tutoriel là où il en était (la carte « pause » guide le retour au
      // dossier tutoriel si besoin).
      name: 'zeroneurone-tutorial',
    }
  )
);

export function getTutorialStatus(): 'completed' | 'exited' | null {
  try {
    const value = localStorage.getItem(TUTORIAL_STATUS_KEY);
    return value === 'completed' || value === 'exited' ? value : null;
  } catch {
    return null;
  }
}
