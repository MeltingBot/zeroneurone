/**
 * Chronology for the phone: one vertical list of everything dated in the
 * dossier (element dates and periods, element events, dated links), grouped
 * under sticky period headers. Tapping an entry opens its element.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Element, Link } from '../types';
import { dateLocale, formatPreciseDate } from '../utils/dates';
import { timelineEntries, type TimelineEntry } from './timeline';

/** Group heading: the day, or the month / year for coarser dates */
function groupKey(entry: TimelineEntry): string {
  const d = entry.date;
  if (entry.precision === 'year') return `${d.getFullYear()}`;
  if (entry.precision === 'month') return `${d.getFullYear()}-${d.getMonth()}`;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function groupLabel(entry: TimelineEntry, locale: string): string {
  const d = entry.date;
  if (entry.precision === 'year') return String(d.getFullYear());
  if (entry.precision === 'month') return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function CompanionTimeline({ elements, links, onOpen }: {
  elements: Element[];
  links: Link[];
  onOpen: (id: string) => void;
}) {
  const { t, i18n } = useTranslation('companion');
  const locale = dateLocale(i18n.language);
  const groups = useMemo(() => {
    const result: { key: string; label: string; entries: TimelineEntry[] }[] = [];
    for (const entry of timelineEntries(elements, links, t('element.untitled'))) {
      const key = groupKey(entry);
      const last = result[result.length - 1];
      if (last && last.key === key) last.entries.push(entry);
      else result.push({ key, label: groupLabel(entry, locale), entries: [entry] });
    }
    return result;
  }, [elements, links, locale, t]);

  if (groups.length === 0) {
    return <p className="text-sm text-text-tertiary text-center px-8 pt-16">{t('timeline.empty')}</p>;
  }

  return (
    <div className="pb-4">
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="sticky top-0 z-10 px-4 py-1.5 text-xs font-medium text-text-secondary bg-bg-secondary border-y border-border-default">
            {g.label}
          </h2>
          <ul className="px-4">
            {g.entries.map((entry) => (
              <li key={entry.key} className="relative pl-5 border-l border-border-strong ml-1">
                <span className="absolute -left-[5px] top-4 w-[9px] h-[9px] rounded-full bg-bg-primary border-2 border-accent" />
                <button
                  type="button"
                  onClick={() => onOpen(entry.elementId)}
                  className="w-full min-h-12 py-2 text-left active:bg-bg-secondary"
                >
                  <span className="flex items-baseline gap-2">
                    {entry.precision === 'minute' && (
                      <span className="text-xs tabular-nums text-text-tertiary flex-shrink-0">
                        {entry.date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <span className="text-sm truncate">{entry.approximate ? `~${entry.label}` : entry.label}</span>
                  </span>
                  {(entry.context || entry.end) && (
                    <span className="block text-xs text-text-tertiary truncate">
                      {[entry.context, entry.end ? `→ ${formatPreciseDate(entry.end, entry.precision, false, i18n.language)}` : null].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
