/**
 * Entries of the companion's chronology (CompanionTimeline.tsx): element
 * periods and events, dated links. Element.date, the collection date, is left
 * out as on the desktop (temporalUtils.elementDateIntervals).
 */

import type { DatePrecision, Element, Link } from '../types';
import { effectivePrecision } from '../utils/dates';

export interface TimelineEntry {
  key: string;
  date: Date;
  end: Date | null;
  precision: DatePrecision;
  approximate: boolean;
  label: string;
  /** The element an event belongs to, or the two ends of a link */
  context: string | null;
  elementId: string;
}

export function timelineEntries(elements: Element[], links: Link[], untitled: string): TimelineEntry[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const out: TimelineEntry[] = [];
  for (const e of elements) {
    const label = e.label || untitled;
    // Element.date is the collection date, not a fact: left out, as on the desktop
    if (e.dateRange?.start) {
      const r = e.dateRange;
      out.push({ key: `e-${e.id}`, date: r.start!, end: r.end, precision: effectivePrecision(r.start!, r.precision), approximate: !!r.approximate, label, context: null, elementId: e.id });
    }
    for (const ev of e.events ?? []) {
      if (!(ev.date instanceof Date) || Number.isNaN(ev.date.getTime())) continue;
      out.push({
        key: `v-${e.id}-${ev.id}`, date: ev.date, end: ev.dateEnd ?? null,
        precision: effectivePrecision(ev.date, ev.precision), approximate: !!ev.approximate,
        label: ev.label || label, context: label, elementId: e.id,
      });
    }
  }
  for (const l of links) {
    const start = l.date ?? l.dateRange?.start ?? null;
    if (!start) continue;
    const from = byId.get(l.fromId);
    const to = byId.get(l.toId);
    if (!from) continue;
    const ends = `${from.label || untitled} — ${to?.label || untitled}`;
    out.push({
      key: `l-${l.id}`, date: start, end: l.date ? null : l.dateRange?.end ?? null,
      precision: effectivePrecision(start, l.date ? undefined : l.dateRange?.precision),
      approximate: !l.date && !!l.dateRange?.approximate,
      label: l.label || ends, context: l.label ? ends : null, elementId: from.id,
    });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
