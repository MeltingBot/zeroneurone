/**
 * Start import placement mode from Mermaid text (paste on canvas, context
 * menu "Paste", import modal). The user then clicks where the diagram goes.
 */

import i18next from 'i18next';
import { useUIStore } from '../stores/uiStore';
import { toast } from '../stores/toastStore';
import { buildMermaidGraph, mermaidBoundingBox, mermaidErrorMessage, parseMermaid } from './importMermaid';

const tr = (key: string, options?: Record<string, unknown>): string =>
  i18next.t(`importData:mermaid.${key}`, options) as string;

/**
 * Parse, build and enter placement mode. Returns an error message instead of
 * throwing so callers can show it inline (modal) or as a toast (canvas).
 */
export function startMermaidPlacement(text: string, dossierId: string): { ok: true } | { ok: false; error: string } {
  try {
    const parsed = parseMermaid(text);
    if (parsed.nodes.length === 0) return { ok: false, error: tr('empty') };

    const { elements, links } = buildMermaidGraph(parsed, dossierId);
    useUIStore.getState().enterImportPlacementMode({
      boundingBox: mermaidBoundingBox(elements),
      prebuilt: { elements, links },
      dossierId,
    });

    const skipped = parsed.ignoredLines + parsed.droppedEdges;
    if (skipped > 0) toast.warning(tr('skippedLines', { count: skipped }));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: mermaidErrorMessage(error) };
  }
}
