import { create } from 'zustand';
import type { DossierId, Element, Link } from '../types';

/**
 * In-memory clipboard for copy/paste of canvas elements.
 *
 * Lives at module level (independent of component mounting), so copied
 * elements survive navigation between dossiers — enabling cross-dossier
 * paste. Deliberately NOT persisted to disk (localStorage/sessionStorage):
 * copied investigation data is cleared on reload/close, leaving no trace.
 *
 * The full element/link objects are captured at copy time (not rebuilt from
 * the live dossier at paste time), which is what makes cross-dossier paste
 * possible: the source dossier is no longer loaded when pasting into another.
 */
interface ClipboardState {
  elements: Element[];
  links: Link[];
  /** Dossier the elements were copied from (to detect cross-dossier paste) */
  sourceDossierId: DossierId | null;

  setClipboard: (elements: Element[], links: Link[], sourceDossierId: DossierId | null) => void;
  clear: () => void;
}

export const useClipboardStore = create<ClipboardState>((set) => ({
  elements: [],
  links: [],
  sourceDossierId: null,

  setClipboard: (elements, links, sourceDossierId) =>
    set({ elements, links, sourceDossierId }),

  clear: () => set({ elements: [], links: [], sourceDossierId: null }),
}));
