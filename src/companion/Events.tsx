/**
 * An element's dated events (they make the timeline): listed by date, added
 * from the phone, edited or deleted. A new one is dated now; its position can
 * be the phone's, which puts it on the map.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, MapPin, MapPinned, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { Element, ElementEvent, GeoData } from '../types';
import { dateFromInputKeys, dateInputKeys, effectivePrecision, formatPreciseDate } from '../utils/dates';
import { updateElementFields } from './actions';
import { dossierPoints, locateOnce } from './geolocate';
import { PositionPicker } from './PositionPicker';
import { IconAction } from './IconAction';
import type { useCompanionSession } from './useCompanionSession';
import { inputClass, sectionTitle } from './ui';

type Session = ReturnType<typeof useCompanionSession>;

function writeEvents(s: Session, element: Element, events: ElementEvent[]) {
  const ydoc = s.ydoc;
  if (!ydoc) return;
  void s.track(() => updateElementFields(ydoc, s.dossierId, element.id, { events }, s.syncState.connected));
}

export function EventsSection({ element, s, writable, focusedEventId }: {
  element: Element;
  s: Session;
  writable: boolean;
  /** Event brought into view on opening */
  focusedEventId: string | null;
}) {
  const { t, i18n } = useTranslation('companion');
  const listRef = useRef<HTMLUListElement>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const events = useMemo(
    () => [...(element.events ?? [])].sort((a, b) => a.date.getTime() - b.date.getTime()),
    [element.events],
  );
  useEffect(() => {
    if (!focusedEventId) return;
    const node = listRef.current?.querySelector(`[data-event-id="${CSS.escape(focusedEventId)}"]`);
    node?.scrollIntoView({ block: 'center' });
  }, [focusedEventId]);
  if (events.length === 0 && !writable) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center">
        <h2 className={`${sectionTitle} flex-1`}>
          {events.length > 0 ? t('element.events', { count: events.length }) : t('events.title')}
        </h2>
        {writable && !adding && (
          <button
            type="button"
            className="-my-2 w-10 h-10 inline-flex items-center justify-center text-accent"
            onClick={() => { setAdding(true); setEditing(null); }}
            aria-label={t('events.add')}
            title={t('events.add')}
          >
            <Plus size={20} />
          </button>
        )}
      </div>
      {adding && <EventEditor element={element} s={s} event={null} onDone={() => setAdding(false)} />}
      {events.length > 0 && (
        <ul ref={listRef} className="divide-y divide-border-default border border-border-default rounded">
          {events.map((ev) => (editing === ev.id ? (
            <li key={ev.id}>
              <EventEditor element={element} s={s} event={ev} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li
              key={ev.id}
              data-event-id={ev.id}
              aria-current={ev.id === focusedEventId ? 'true' : undefined}
              className={`flex items-start ${ev.id === focusedEventId ? 'bg-accent-light' : ''}`}
            >
              <div className="flex-1 min-w-0 px-3 py-2">
                <div className="text-xs text-text-tertiary">
                  {formatPreciseDate(ev.date, ev.precision, ev.approximate, i18n.language)}
                  {ev.dateEnd && ` → ${formatPreciseDate(ev.dateEnd, ev.precision, ev.approximate, i18n.language)}`}
                </div>
                <div className="text-sm">{ev.label}</div>
                {ev.description && <div className="text-xs text-text-secondary whitespace-pre-wrap break-words">{ev.description}</div>}
                {ev.source && <div className="text-xs text-text-tertiary break-words">{ev.source}</div>}
              </div>
              {writable && (
                <button
                  type="button"
                  className="w-11 h-12 flex items-center justify-center text-text-tertiary flex-shrink-0"
                  onClick={() => { setEditing(ev.id); setAdding(false); }}
                  aria-label={t('events.edit')}
                  title={t('events.edit')}
                >
                  <Pencil size={15} />
                </button>
              )}
            </li>
          )))}
        </ul>
      )}
    </section>
  );
}

const pointOf = (geo: GeoData | undefined) => (geo?.type === 'point' ? geo : null);

/**
 * A new event (`event` null, dated now) or an existing one. An existing date
 * left as it is keeps its precision (a year, a month) and time zone; a date
 * changed here is a day, or a minute when an hour is given.
 */
function EventEditor({ element, s, event, onDone }: {
  element: Element;
  s: Session;
  event: ElementEvent | null;
  onDone: () => void;
}) {
  const { t } = useTranslation('companion');
  const initial = useMemo(() => {
    if (!event) {
      const now = dateInputKeys(new Date());
      return { date: now.date, time: now.time };
    }
    const keys = dateInputKeys(event.date, event.timeZone);
    return { date: keys.date, time: effectivePrecision(event.date, event.precision) === 'minute' ? keys.time : '' };
  }, [event]);
  const [label, setLabel] = useState(event?.label ?? '');
  const [dateKey, setDateKey] = useState(initial.date);
  const [timeKey, setTimeKey] = useState(initial.time);
  const [description, setDescription] = useState(event?.description ?? '');
  const [source, setSource] = useState(event?.source ?? '');
  const [geo, setGeo] = useState<GeoData | undefined>(event?.geo);
  const [locating, setLocating] = useState(false);
  const [geoFailed, setGeoFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [picking, setPicking] = useState(false);
  const around = useMemo(() => dossierPoints(s.data.elements), [s.data.elements]);
  const point = pointOf(geo);

  const locate = () => {
    setLocating(true);
    setGeoFailed(false);
    locateOnce().then(
      (where) => { setGeo({ type: 'point', lat: where.lat, lng: where.lng }); setLocating(false); },
      () => { setGeoFailed(true); setLocating(false); },
    );
  };

  const canSave = !!label.trim() && !!dateKey;
  const save = () => {
    if (!canSave) return;
    const dateChanged = !event || dateKey !== initial.date || timeKey !== initial.time;
    const next: ElementEvent = {
      ...(event ?? { id: crypto.randomUUID() }),
      label: label.trim(),
      description: description.trim() || undefined,
      source: source.trim() || undefined,
      geo,
      date: event && !dateChanged ? event.date : dateFromInputKeys(dateKey, timeKey || '00:00', event?.timeZone),
      precision: event && !dateChanged ? event.precision : timeKey ? 'minute' : 'day',
    };
    const all = element.events ?? [];
    writeEvents(s, element, event ? all.map((e) => (e.id === event.id ? next : e)) : [...all, next]);
    onDone();
  };

  const remove = () => {
    if (!event) return;
    if (!confirming) { setConfirming(true); return; }
    writeEvents(s, element, (element.events ?? []).filter((e) => e.id !== event.id));
    onDone();
  };

  return (
    <div className="p-3 space-y-3 bg-bg-secondary rounded">
      <input
        className={inputClass}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={t('events.label')}
        aria-label={t('events.label')}
        autoFocus={!event}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          className={inputClass}
          type="date"
          value={dateKey}
          onChange={(e) => setDateKey(e.target.value)}
          aria-label={t('events.date')}
        />
        <input
          className={inputClass}
          type="time"
          value={timeKey}
          onChange={(e) => setTimeKey(e.target.value)}
          aria-label={t('events.time')}
        />
      </div>
      <textarea
        className={`${inputClass} resize-none`}
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('events.description')}
        aria-label={t('events.description')}
      />
      <input
        className={inputClass}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        placeholder={t('capture.source')}
        aria-label={t('capture.source')}
      />
      {point ? (
        <div className="flex items-center gap-2 text-sm">
          <MapPin size={16} className="text-text-secondary" />
          <span className="flex-1">{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</span>
          <button type="button" className="w-9 h-9 flex items-center justify-center text-text-secondary" onClick={() => setGeo(undefined)} aria-label={t('capture.removePosition')}>
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <IconAction
            icon={locating ? Loader2 : MapPin}
            label={locating ? t('capture.locating') : t('capture.position')}
            onClick={locate}
            disabled={locating}
            className={locating ? '[&>svg]:animate-spin' : ''}
          />
          <IconAction icon={MapPinned} label={t('position.pick')} onClick={() => setPicking(true)} />
        </div>
      )}
      {picking && (
        <PositionPicker
          initial={point}
          around={around}
          onPick={(p) => setGeo({ type: 'point', lat: p.lat, lng: p.lng })}
          onRemove={point ? () => setGeo(undefined) : undefined}
          onClose={() => setPicking(false)}
        />
      )}
      {geoFailed && <p className="text-xs text-error">{t('capture.positionFailed')}</p>}
      <div className="flex gap-2">
        {event && (
          <IconAction
            icon={Trash2}
            label={confirming ? t('delete.confirm') : t('events.delete')}
            variant={confirming ? 'confirm' : 'danger'}
            onClick={remove}
          />
        )}
        <span className="flex-1" />
        <IconAction icon={X} label={t('cancel')} onClick={onDone} />
        <IconAction icon={Check} label={t('edit.save')} onClick={save} disabled={!canSave} variant="primary" />
      </div>
    </div>
  );
}
