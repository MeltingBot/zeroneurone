import type { Asset, CanvasTab, Comment, Dossier, Element, Link, Report, SavedQuery, View } from '../types';

/** What replaces a redacted text. */
export const REDACTED = '███';

/** Base name of a redacted export file: the dossier name would give it away. */
export const REDACTED_FILE_BASE = 'redacted';

export interface RedactableExport {
  dossier: Dossier;
  elements: Element[];
  links: Link[];
  assets?: Asset[];
  report?: Report | null;
  tabs?: CanvasTab[];
  views?: View[];
  queries?: SavedQuery[];
  queryHistory?: string[];
  comments?: Comment[];
}

/**
 * Copy of the export input with every free text and every location removed,
 * for an export the user marks as redacted. The structure stays: ids, links,
 * canvas positions, dates, appearance, tags, confidence and grading.
 *
 * Elements are numbered ("███ 1", "███ 2"…) rather than all named "███":
 * the redacted graph stays readable, and formats that use the label as a
 * key (ANX Identity, Obsidian note names) do not merge them.
 *
 * Gone entirely: attached files, comments, the report (its text and graph
 * snapshots), saved queries and query history (their text holds values).
 */
export function redactExport(input: RedactableExport): RedactableExport {
  const { dossier } = input;
  let n = 0;
  const elements = input.elements.map((el): Element => ({
    ...el,
    label: `${REDACTED} ${++n}`,
    notes: '',
    source: '',
    properties: [],
    geo: null,
    assetIds: [],
    visual: { ...el.visual, image: null },
    events: (el.events ?? []).map((ev) => ({
      ...ev,
      label: REDACTED,
      description: undefined,
      source: undefined,
      properties: undefined,
      geo: undefined,
    })),
  }));
  const links = input.links.map((link): Link => ({
    ...link,
    label: link.label ? REDACTED : '',
    notes: '',
    source: '',
    properties: [],
  }));

  return {
    dossier: {
      ...dossier,
      name: REDACTED,
      description: '',
      creator: '',
      tags: [],
      properties: [],
    },
    elements,
    links,
    assets: input.assets ? [] : undefined,
    report: input.report === undefined ? undefined : null,
    tabs: input.tabs?.map((tab, i) => ({ ...tab, name: `${REDACTED} ${i + 1}` })),
    views: input.views?.map((view, i) => ({
      ...view,
      name: `${REDACTED} ${i + 1}`,
      filters: { ...view.filters, textSearch: '' },
      query: view.query ? null : view.query,
    })),
    queries: input.queries ? [] : undefined,
    queryHistory: input.queryHistory ? [] : undefined,
    comments: input.comments ? [] : undefined,
  };
}
