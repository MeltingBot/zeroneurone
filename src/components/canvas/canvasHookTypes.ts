/** Store slices the canvas hooks receive from the Canvas component */

import type { RefObject } from 'react';
import type { useDossierStore, useSelectionStore, useTabStore, useHistoryStore, useViewStore, useUIStore } from '../../stores';
import type { Asset, Element } from '../../types';

export type DossierStore = ReturnType<typeof useDossierStore.getState>;
export type SelectionStore = ReturnType<typeof useSelectionStore.getState>;
export type TabStore = ReturnType<typeof useTabStore.getState>;
export type HistoryStore = ReturnType<typeof useHistoryStore.getState>;
export type ViewStore = ReturnType<typeof useViewStore.getState>;
export type UIStore = ReturnType<typeof useUIStore.getState>;

export type WrapperRef = RefObject<HTMLDivElement | null>;
export type MousePosRef = RefObject<{ x: number; y: number }>;

export type WriteClipboard = (elsToCopy: Element[], linkIds?: string[]) => void;
export type DeleteElementsWithHistory = (ids: string[]) => Promise<void>;

/** Right-click on empty canvas: screen point and the canvas point under it */
export interface CanvasMenuPosition {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
}

/** Right-click on an element */
export interface ContextMenuState {
  x: number;
  y: number;
  elementId: string;
  elementLabel: string;
  previewAsset: Asset | null;
}
