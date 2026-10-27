/**
 * Start import placement mode from DOT text (paste on canvas, context menu
 * "Paste", import into the open dossier). The user then clicks where the
 * graph goes.
 */

import i18next from 'i18next';
import { useUIStore } from '../stores/uiStore';
import { toast } from '../stores/toastStore';
import { buildDOTGraph, dotErrorMessage } from './importDOT';
import { mermaidBoundingBox } from './importMermaid';

/**
 * Parse, build and enter placement mode. Returns an error message instead of
 * throwing so callers can show it inline (modal) or as a toast (canvas).
 */
export function startDotPlacement(text: string, dossierId: string): { ok: true } | { ok: false; error: string } {
  try {
    const { elements, links, warnings } = buildDOTGraph(text, dossierId);
    if (elements.length === 0) return { ok: false, error: i18next.t('importData:dot.errors.empty') as string };
    useUIStore.getState().enterImportPlacementMode({
      boundingBox: mermaidBoundingBox(elements),
      prebuilt: { elements, links },
      dossierId,
    });
    for (const warning of warnings) toast.warning(warning);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: dotErrorMessage(error) };
  }
}
