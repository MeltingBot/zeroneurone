/**
 * Chronology for the phone: one vertical list of everything dated in the
 * dossier (element periods, element events, dated links), grouped under
 * sticky period headers. Tapping an entry opens its element, on the event
 * when it is one.
 *
 * Above the list, a jump strip: the years (or months, for a span under two
 * years) with a bar for how many entries each holds. Tapping one brings it
 * into view; the period in view is marked and follows the scroll. Beside it,
 * the order (oldest or newest first) and a date picker to jump to a day.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, CalendarSearch } from 'lucide-react';
import type { Element, Link } from '../types';
import { dateLocale, formatPreciseDate } from '../utils/dates';
import { bucketKey, buckets, entryIndexFor, scaleOf, timelineEntries, type Bucket, type Scale, type TimelineEntry } from './timeline';

/** Height of the jump strip; the period headers stick under it */
const STRIP_HEIGHT = 68;
const ORDER_KEY = 'zeroneurone-companion-timeline-newest';

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

function dayInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function readNewestFirst(): boolean {
  try { return localStorage.getItem(ORDER_KEY) === '1'; } catch { return false; }
}

export function CompanionTimeline({ elements, links, onOpen, scroller }: {
  elements: Element[];
  links: Link[];
  onOpen: (id: string, eventId?: string) => void;
  /** The scrolling area holding the list */
  scroller: RefObject<HTMLElement | null>;
}) {
  const { t, i18n } = useTranslation('companion');
  const locale = dateLocale(i18n.language);
  const [newestFirst, setNewestFirst] = useState(readNewestFirst);
  const listRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<string | null>(null);
  /** Period jumped to: stays marked while the list cannot scroll further */
  const jumped = useRef<string | null>(null);

  const sorted = useMemo(() => timelineEntries(elements, links, t('element.untitled')), [elements, links, t]);
  const scale = useMemo(() => scaleOf(sorted), [sorted]);
  const periods = useMemo(() => buckets(sorted, scale), [sorted, scale]);
  const shown = useMemo(() => (newestFirst ? [...sorted].reverse() : sorted), [sorted, newestFirst]);
  const groups = useMemo(() => {
    const result: { key: string; label: string; entries: { entry: TimelineEntry; index: number }[] }[] = [];
    shown.forEach((entry, index) => {
      const key = groupKey(entry);
      const last = result[result.length - 1];
      if (last && last.key === key) last.entries.push({ entry, index });
      else result.push({ key, label: groupLabel(entry, locale), entries: [{ entry, index }] });
    });
    return result;
  }, [shown, locale]);

  // The period of the first entry under the headers, followed while scrolling
  useEffect(() => {
    const main = scroller.current;
    if (!main) return;
    const track = () => {
      const list = listRef.current;
      if (!list) return;
      // At the end, a late period cannot reach the top: the one jumped to stays
      const atEnd = main.scrollTop + main.clientHeight >= main.scrollHeight - 2;
      if (atEnd && jumped.current) {
        setCurrent(jumped.current);
        return;
      }
      if (!atEnd) jumped.current = null;
      const top = main.getBoundingClientRect().top + STRIP_HEIGHT + 32;
      for (const li of list.querySelectorAll<HTMLElement>('li[data-bucket]')) {
        if (li.getBoundingClientRect().bottom > top) {
          setCurrent(li.dataset.bucket ?? null);
          return;
        }
      }
    };
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(track);
    };
    main.addEventListener('scroll', onScroll, { passive: true });
    frame = requestAnimationFrame(track);
    return () => {
      main.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [scroller, groups]);

  // The marked period stays in sight on the strip
  useEffect(() => {
    const strip = stripRef.current;
    const button = current ? strip?.querySelector<HTMLElement>(`[data-period="${current}"]`) : null;
    if (!strip || !button) return;
    const left = button.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft || left + button.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: left - strip.clientWidth / 2 + button.offsetWidth / 2 });
    }
  }, [current]);

  /** Brings entry `index` (display order) under the strip */
  const scrollToEntry = (index: number) => {
    const main = scroller.current;
    const li = listRef.current?.querySelector<HTMLElement>(`li[data-index="${index}"]`);
    if (!main || !li) return;
    jumped.current = li.dataset.bucket ?? null;
    setCurrent(jumped.current);
    const section = li.closest('section');
    const first = section?.querySelector('li') === li;
    const target = first && section ? section : li;
    const offset = STRIP_HEIGHT + (first ? 0 : (section?.querySelector('h2')?.offsetHeight ?? 0));
    main.scrollBy({ top: target.getBoundingClientRect().top - main.getBoundingClientRect().top - offset });
  };

  const jumpToPeriod = (period: Bucket) => {
    const end = new Date(period.start);
    if (scale === 'year') end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
    const index = newestFirst
      ? shown.findIndex((e) => e.date < end)
      : shown.findIndex((e) => e.date >= period.start);
    scrollToEntry(index === -1 ? shown.length - 1 : index);
  };

  const toggleOrder = () => {
    const next = !newestFirst;
    setNewestFirst(next);
    try { localStorage.setItem(ORDER_KEY, next ? '1' : '0'); } catch { /* storage unavailable */ }
    scroller.current?.scrollTo(0, 0);
  };

  if (groups.length === 0) {
    return <p className="text-sm text-text-tertiary text-center px-8 pt-16">{t('timeline.empty')}</p>;
  }

  const most = Math.max(...periods.map((p) => p.count));
  const OrderIcon = newestFirst ? ArrowUpNarrowWide : ArrowDownWideNarrow;

  return (
    <div className="pb-4">
      <div
        className="sticky top-0 z-20 flex bg-bg-primary border-b border-border-default"
        style={{ height: STRIP_HEIGHT }}
      >
        <div ref={stripRef} className="flex-1 min-w-0 flex items-stretch gap-0.5 px-1 overflow-x-auto zn-no-scrollbar">
          {(newestFirst ? [...periods].reverse() : periods).map((p, i, all) => (
            <PeriodButton
              key={p.key}
              period={p}
              scale={scale}
              locale={locale}
              ratio={most > 0 ? p.count / most : 0}
              active={p.key === current}
              showYear={scale === 'month' && (i === 0 || all[i - 1].start.getFullYear() !== p.start.getFullYear())}
              onPick={() => jumpToPeriod(p)}
            />
          ))}
        </div>
        <div className="flex items-center border-l border-border-default">
          <button
            type="button"
            className={`w-11 h-11 flex items-center justify-center ${newestFirst ? 'text-accent' : 'text-text-secondary'}`}
            onClick={toggleOrder}
            aria-pressed={newestFirst}
            aria-label={t('timeline.newestFirst')}
            title={t('timeline.newestFirst')}
          >
            <OrderIcon size={18} />
          </button>
          {/* The native date picker, opened by a tap on the icon it covers */}
          <label className="relative w-11 h-11 flex items-center justify-center text-text-secondary" title={t('timeline.goTo')}>
            <CalendarSearch size={18} />
            <input
              type="date"
              className="absolute inset-0 opacity-0"
              aria-label={t('timeline.goTo')}
              min={dayInput(sorted[0].date)}
              max={dayInput(sorted[sorted.length - 1].date)}
              onChange={(e) => {
                const [y, m, d] = e.target.value.split('-').map(Number);
                if (y && m && d) scrollToEntry(entryIndexFor(shown, new Date(y, m - 1, d), newestFirst));
              }}
            />
          </label>
        </div>
      </div>

      <div ref={listRef}>
        {groups.map((g) => (
          <section key={g.key}>
            <h2
              className="sticky z-10 px-4 py-1.5 text-xs font-medium text-text-secondary bg-bg-secondary border-b border-border-default"
              style={{ top: STRIP_HEIGHT }}
            >
              {g.label}
            </h2>
            <ul className="px-4">
              {g.entries.map(({ entry, index }) => (
                <li
                  key={entry.key}
                  data-index={index}
                  data-bucket={bucketKey(entry.date, scale)}
                  className="relative pl-5 border-l border-border-strong ml-1"
                >
                  <span className="absolute -left-[5px] top-4 w-[9px] h-[9px] rounded-full bg-bg-primary border-2 border-accent" />
                  <button
                    type="button"
                    onClick={() => onOpen(entry.elementId, entry.eventId)}
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
    </div>
  );
}

/** One period of the strip: its share of the entries, then its name */
function PeriodButton({ period, scale, locale, ratio, active, showYear, onPick }: {
  period: Bucket;
  scale: Scale;
  locale: string;
  ratio: number;
  active: boolean;
  showYear: boolean;
  onPick: () => void;
}) {
  const { t } = useTranslation('companion');
  const label = scale === 'year'
    ? String(period.start.getFullYear())
    : period.start.toLocaleDateString(locale, { month: 'short' });
  const full = scale === 'year'
    ? label
    : period.start.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return (
    <button
      type="button"
      data-period={period.key}
      onClick={onPick}
      aria-current={active ? 'true' : undefined}
      aria-label={t('timeline.period', { period: full, count: period.count })}
      className={`flex-shrink-0 min-w-11 px-1.5 flex flex-col items-center justify-end gap-1 pb-1.5 ${
        active ? 'text-accent' : period.count > 0 ? 'text-text-secondary' : 'text-text-tertiary'
      }`}
    >
      <span className="text-[10px] leading-none h-2.5 text-text-tertiary">{showYear ? period.start.getFullYear() : ''}</span>
      <span className="flex-1 flex items-end">
        <span
          className={`block w-3 rounded-sm ${active ? 'bg-accent' : 'bg-border-strong'}`}
          style={{ height: period.count > 0 ? Math.max(3, Math.round(ratio * 24)) : 1 }}
        />
      </span>
      <span className={`text-xs leading-none tabular-nums ${active ? 'font-semibold' : ''}`}>{label}</span>
    </button>
  );
}
