/**
 * Editing an element from the phone: its notes (Markdown, shown rendered) and
 * the values of its properties, each with an input suited to its type.
 * Changes are saved explicitly (no write per keystroke over the network).
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react';
import type { Element, Property } from '../types';
import { dateFromInputKeys, dateInputKeys, dateLocale, formatPropertyValue } from '../utils/dates';
import { getCountryName, getLocalizedCountries } from '../data/countries';
import { updateElementFields } from './actions';
import type { useCompanionSession } from './useCompanionSession';
import { choiceButton, inputClass, primaryButton, secondaryButton, sectionTitle } from './ui';

type Session = ReturnType<typeof useCompanionSession>;

// react-markdown loads with the first note shown, not with the companion
const MarkdownPreview = lazy(() =>
  import('../components/common/MarkdownEditor').then((m) => ({ default: m.MarkdownPreview })));

function save(s: Session, elementId: string, changes: { notes?: string; properties?: Property[]; source?: string }) {
  const ydoc = s.ydoc;
  if (!ydoc) return;
  void s.track(() => updateElementFields(ydoc, s.dossierId, elementId, changes, s.syncState.connected));
}

function EditActions({ onCancel, onSave, disabled }: { onCancel: () => void; onSave: () => void; disabled?: boolean }) {
  const { t } = useTranslation('companion');
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className={secondaryButton} onClick={onCancel}>{t('cancel')}</button>
      <button type="button" className={primaryButton} onClick={onSave} disabled={disabled}>{t('edit.save')}</button>
    </div>
  );
}

// ============================================================================
// NOTES
// ============================================================================

export function NotesSection({ element, s, writable }: { element: Element; s: Session; writable: boolean }) {
  const { t } = useTranslation('companion');
  const [draft, setDraft] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(ta.scrollHeight, 160)}px`;
  }, [draft]);

  if (draft !== null) {
    return (
      <section className="space-y-2">
        <h2 className={sectionTitle}>{t('element.notes')}</h2>
        <textarea
          ref={textareaRef}
          className={`${inputClass} resize-none font-mono text-sm`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={t('element.notes')}
          autoFocus
        />
        <EditActions
          onCancel={() => setDraft(null)}
          onSave={() => {
            if (draft !== element.notes) save(s, element.id, { notes: draft });
            setDraft(null);
          }}
        />
      </section>
    );
  }

  if (!element.notes && !writable) return null;

  return (
    <section className="space-y-1.5">
      <div className="flex items-center">
        <h2 className={`${sectionTitle} flex-1`}>{t('element.notes')}</h2>
        {writable && (
          <button
            type="button"
            className="w-9 h-9 -my-2 flex items-center justify-center text-text-secondary"
            onClick={() => setDraft(element.notes)}
            aria-label={t('edit.notes')}
            title={t('edit.notes')}
          >
            <Pencil size={15} />
          </button>
        )}
      </div>
      {element.notes ? (
        <div className="text-sm break-words">
          <Suspense fallback={<p className="whitespace-pre-wrap">{element.notes}</p>}>
            <MarkdownPreview content={element.notes} />
          </Suspense>
        </div>
      ) : (
        <button type="button" className="text-sm text-text-tertiary" onClick={() => setDraft('')}>
          {t('edit.addNote')}
        </button>
      )}
    </section>
  );
}

// ============================================================================
// PROPERTIES
// ============================================================================

/** Types the phone can edit; a location property stays read-only */
function editable(p: Property): boolean {
  return p.type !== 'geo';
}

function initialText(p: Property): string {
  const v = p.value;
  if (v === null || v === undefined) return '';
  if (p.type === 'date' || p.type === 'datetime') {
    const date = v instanceof Date ? v : new Date(String(v));
    if (Number.isNaN(date.getTime())) return '';
    const keys = dateInputKeys(date, p.timeZone);
    return p.type === 'date' ? keys.date : `${keys.date}T${keys.time}`;
  }
  return v instanceof Date ? v.toISOString() : String(v);
}

/** The typed value, or undefined when the text is not one */
function parseValue(p: Property, text: string): Property['value'] | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  switch (p.type) {
    case 'number': {
      const n = Number(trimmed.replace(',', '.').replace(/\s/g, ''));
      return Number.isFinite(n) ? n : undefined;
    }
    case 'date':
      return dateFromInputKeys(trimmed, '00:00', p.timeZone);
    case 'datetime': {
      const [date, time] = trimmed.split('T');
      return date ? dateFromInputKeys(date, time ?? '00:00', p.timeZone) : undefined;
    }
    default:
      return text;
  }
}

export function PropertyRows({ element, s, writable }: { element: Element; s: Session; writable: boolean }) {
  const { t, i18n } = useTranslation('companion');
  const [editing, setEditing] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);

  const write = (index: number, value: Property['value']) => {
    const properties = element.properties.map((p, i) => (i === index ? { ...p, value } : p));
    save(s, element.id, { properties });
  };

  const locale = dateLocale(i18n.language);
  const display = (p: Property) => {
    if (typeof p.value === 'boolean') return p.value ? t('yes') : t('no');
    if (p.type === 'country' && typeof p.value === 'string' && p.value) return getCountryName(p.value, locale);
    return formatPropertyValue(p.value, p.type, i18n.language, p.timeZone);
  };

  return (
    <>
      {element.properties.map((p, i) => {
        const canEdit = writable && editable(p);
        if (editing === i) {
          return (
            <div key={`${p.key}-${i}`} className="py-2 space-y-2">
              <div className="text-xs text-text-secondary">{p.key}</div>
              {p.type === 'country' ? (
                <CountrySelect
                  value={typeof p.value === 'string' ? p.value : ''}
                  locale={locale}
                  label={p.key}
                  onPick={(code) => { if (code !== p.value) write(i, code || null); setEditing(null); }}
                  onCancel={() => setEditing(null)}
                />
              ) : p.type === 'boolean' ? (
                <div className="flex gap-2">
                  {[true, false].map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      aria-pressed={p.value === v}
                      className={`${choiceButton(p.value === v)} flex-1`}
                      onClick={() => { if (p.value !== v) write(i, v); setEditing(null); }}
                    >
                      {v ? t('yes') : t('no')}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <input
                    className={inputClass}
                    type={p.type === 'date' ? 'date' : p.type === 'datetime' ? 'datetime-local' : 'text'}
                    inputMode={p.type === 'number' ? 'decimal' : undefined}
                    value={text}
                    onChange={(e) => { setText(e.target.value); setInvalid(false); }}
                    aria-label={p.key}
                    autoFocus
                  />
                  {invalid && <p className="text-xs text-error">{t('edit.invalid')}</p>}
                  <EditActions
                    onCancel={() => setEditing(null)}
                    onSave={() => {
                      const value = parseValue(p, text);
                      if (value === undefined) { setInvalid(true); return; }
                      write(i, value);
                      setEditing(null);
                    }}
                  />
                </>
              )}
            </div>
          );
        }
        return (
          <button
            key={`${p.key}-${i}`}
            type="button"
            disabled={!canEdit}
            onClick={() => { setText(initialText(p)); setInvalid(false); setEditing(i); }}
            className="w-full flex gap-3 py-2 text-left disabled:cursor-default"
          >
            <span className="w-1/3 flex-shrink-0 text-text-secondary text-xs pt-0.5 break-words">{p.key}</span>
            <span className="flex-1 min-w-0 break-words">
              {display(p) || <span className="text-text-tertiary">—</span>}
            </span>
            {canEdit && <Pencil size={13} className="text-text-tertiary flex-shrink-0 mt-1" />}
          </button>
        );
      })}
    </>
  );
}

/** Native list: the phone's own picker, letters jump to a country */
function CountrySelect({ value, locale, label, onPick, onCancel }: {
  value: string;
  locale: string;
  label: string;
  onPick: (code: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('companion');
  const countries = useMemo(() => getLocalizedCountries(locale), [locale]);
  return (
    <div className="space-y-2">
      <select
        className={inputClass}
        value={value}
        onChange={(e) => onPick(e.target.value)}
        aria-label={label}
        autoFocus
      >
        <option value="">—</option>
        {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
      </select>
      <div className="flex justify-end">
        <button type="button" className={secondaryButton} onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  );
}
