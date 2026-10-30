/**
 * [[Label|id]]: a reference to an element or a link inside report text.
 * One pattern for everything that reads or rewrites report content.
 *
 * Ids are UUIDs, in any case; the short ids some hand-written archives use
 * are matched too. They are kept to word characters and hyphens, so an id is
 * safe to put in a URL (#element:id) or an HTML attribute.
 */
export const REPORT_REF_SOURCE = String.raw`\[\[([^\]|]+)\|([\w-]+)\]\]`;

/** Older form, still found in some content: [Label](#element:id) */
export const LEGACY_ELEMENT_LINK_SOURCE = String.raw`\[([^\]]+)\]\(#element:([\w-]+)\)`;

/** A fresh global regex: label in group 1, id in group 2 */
export function reportRefRegex(): RegExp {
  return new RegExp(REPORT_REF_SOURCE, 'g');
}

export function replaceReportRefs(content: string, replace: (label: string, id: string) => string): string {
  return content.replace(reportRefRegex(), (_match, label: string, id: string) => replace(label, id));
}

/** The labels alone, references dropped */
export function stripReportRefs(content: string): string {
  return replaceReportRefs(content, (label) => label);
}
