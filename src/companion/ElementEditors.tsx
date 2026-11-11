/**
 * Editing an element from the phone: its notes (Markdown, shown rendered),
 * its properties, each with an input suited to its type, and its tags.
 * Changes are saved explicitly (no write per keystroke over the network).
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { IconAction } from './IconAction';
import type { Element, Property, PropertyType } from '../types';
import { dateFromInputKeys, dateInputKeys, dateLocale, formatPropertyValue } from '../utils/dates';
import { getCountryName, getLocalizedCountries } from '../data/countries';
import { updateElementFields } from './actions';
import { dossierPropertyKeys, dossierTags, findKey, type KnownKey } from './vocabulary';
import type { useCompanionSession } from './useCompanionSession';
import { choiceButton, inputClass, sectionTitle } from './ui';

type Session = ReturnType<typeof useCompanionSession>;

// react-markdown loads with the first note shown, not with the companion
const MarkdownPreview = lazy(() =>
  import('../components/common/MarkdownEditor').then((m) => ({ default: m.MarkdownPreview })));

function save(s: Session, elementId: string, changes: { label?: string; notes?: string; properties?: Property[]; source?: string; tags?: string[] }) {
  const ydoc = s.ydoc;
  if (!ydoc) return;
  void s.track(() => updateElementFields(ydoc, s.dossierId, elementId, changes, s.syncState.connected));
}

/** Cancel and save on the right; deleting what is edited, when offered, on the left */
function EditActions({ onCancel, onSave, disabled, onDelete }: {
  onCancel: () => void;
  onSave?: () => void;
  disabled?: boolean;
  onDelete?: () => void;
}) {
  const { t } = useTranslation('companion');
  return (
    <div className="flex gap-2">
      {onDelete && <DeleteProperty onDelete={onDelete} />}
      <span className="flex-1" />
      <IconAction icon={X} label={t('cancel')} onClick={onCancel} />
      {onSave && <IconAction icon={Check} label={t('edit.save')} onClick={onSave} disabled={disabled} variant="primary" />}
    </div>
  );
}

// ============================================================================
// LABEL
// ============================================================================

/** Renaming the element, opened from the pencil beside its name in the header */
export function LabelEditor({ element, s, onDone }: { element: Element; s: Session; onDone: () => void }) {
  const { t } = useTranslation('companion');
  const [draft, setDraft] = useState(element.label);
  const commit = () => {
    const label = draft.trim();
    if (!label) return;
    if (label !== element.label) save(s, element.id, { label });
    onDone();
  };
  return (
    <section className="space-y-2">
      <input
        className={inputClass}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        enterKeyHint="done"
        aria-label={t('edit.label')}
        autoFocus
      />
      <EditActions onCancel={onDone} onSave={commit} disabled={!draft.trim()} />
    </section>
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

/** Types the phone can edit; a location property can only be deleted */
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

  const write = (properties: Property[]) => save(s, element.id, { properties });
  const setValue = (index: number, value: Property['value']) =>
    write(element.properties.map((p, i) => (i === index ? { ...p, value } : p)));

  const locale = dateLocale(i18n.language);
  const display = (p: Property) => {
    if (typeof p.value === 'boolean') return p.value ? t('yes') : t('no');
    if (p.type === 'country' && typeof p.value === 'string' && p.value) return getCountryName(p.value, locale);
    return formatPropertyValue(p.value, p.type, i18n.language, p.timeZone);
  };

  return (
    <>
      {element.properties.map((p, i) => {
        if (editing === i) {
          const remove = () => { write(element.properties.filter((_, j) => j !== i)); setEditing(null); };
          return (
            <div key={`${p.key}-${i}`} className="py-2 space-y-2">
              <div className="text-xs text-text-secondary">{p.key}</div>
              {editable(p) ? (
                <ValueEditor
                  property={p}
                  onSave={(value) => { if (value !== p.value) setValue(i, value); setEditing(null); }}
                  onCancel={() => setEditing(null)}
                  onDelete={remove}
                />
              ) : (
                <EditActions onCancel={() => setEditing(null)} onDelete={remove} />
              )}
            </div>
          );
        }
        return (
          <button
            key={`${p.key}-${i}`}
            type="button"
            disabled={!writable}
            onClick={() => setEditing(i)}
            className="w-full flex gap-3 py-2 text-left disabled:cursor-default"
          >
            <span className="w-1/3 flex-shrink-0 text-text-secondary text-xs pt-0.5 break-words">{p.key}</span>
            <span className="flex-1 min-w-0 break-words">
              {display(p) || <span className="text-text-tertiary">—</span>}
            </span>
            {writable && <Pencil size={13} className="text-text-tertiary flex-shrink-0 mt-1" />}
          </button>
        );
      })}
    </>
  );
}

/** The input suited to the property's type; a choice saves at once */
function ValueEditor({ property, onSave, onCancel, onDelete }: {
  property: Property;
  onSave: (value: Property['value']) => void;
  onCancel: () => void;
  /** Offered when editing an existing property */
  onDelete?: () => void;
}) {
  const { t, i18n } = useTranslation('companion');
  const [text, setText] = useState(() => initialText(property));
  const [invalid, setInvalid] = useState(false);
  const p = property;

  if (p.type === 'country') {
    return (
      <CountrySelect
        value={typeof p.value === 'string' ? p.value : ''}
        locale={dateLocale(i18n.language)}
        label={p.key}
        onPick={(code) => onSave(code || null)}
        onCancel={onCancel}
        onDelete={onDelete}
      />
    );
  }
  if (p.type === 'boolean') {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={p.value === v}
              className={`${choiceButton(p.value === v)} flex-1`}
              onClick={() => onSave(v)}
            >
              {v ? t('yes') : t('no')}
            </button>
          ))}
        </div>
        <EditActions onCancel={onCancel} onDelete={onDelete} />
      </div>
    );
  }
  return (
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
        onCancel={onCancel}
        onDelete={onDelete}
        onSave={() => {
          const value = parseValue(p, text);
          if (value === undefined) { setInvalid(true); return; }
          onSave(value);
        }}
      />
    </>
  );
}

/** Removes the property, after a second tap */
function DeleteProperty({ onDelete }: { onDelete: () => void }) {
  const { t } = useTranslation('companion');
  const [confirming, setConfirming] = useState(false);
  return (
    <IconAction
      icon={Trash2}
      label={confirming ? t('edit.deletePropertyConfirm') : t('edit.deleteProperty')}
      variant={confirming ? 'confirm' : 'danger'}
      onClick={() => (confirming ? onDelete() : setConfirming(true))}
    />
  );
}

/** Types offered for a new property; the others are set on a computer */
const NEW_PROPERTY_TYPES: PropertyType[] = ['text', 'number', 'date'];

/**
 * Adds a property: a key already used in the dossier starts with its type, a
 * new key with text; the type can be switched before the value is entered.
 */
export function AddProperty({ element, s, onClose }: { element: Element; s: Session; onClose: () => void }) {
  const { t } = useTranslation('companion');
  const known = useMemo(() => dossierPropertyKeys(s.data.elements), [s.data.elements]);
  const [typed, setTyped] = useState('');
  const [chosen, setChosen] = useState<KnownKey | null>(null);
  const [taken, setTaken] = useState(false);

  const has = (key: string) =>
    element.properties.some((p) => p.key.localeCompare(key, undefined, { sensitivity: 'base' }) === 0);
  const query = typed.trim().toLocaleLowerCase();
  const suggestions = known
    .filter((k) => !has(k.key) && (!query || k.key.toLocaleLowerCase().includes(query)))
    .slice(0, 6);

  const pick = (key: KnownKey) => {
    if (has(key.key)) { setTaken(true); return; }
    setChosen(key);
  };

  if (chosen) {
    // The usual types, plus the one a known key already has elsewhere
    const types: PropertyType[] = NEW_PROPERTY_TYPES.includes(chosen.type) ? NEW_PROPERTY_TYPES : [...NEW_PROPERTY_TYPES, chosen.type];
    return (
      <div className="py-2 space-y-2">
        <div className="text-xs text-text-secondary">{chosen.key}</div>
        <div className="flex gap-2" role="group" aria-label={t('edit.type')}>
          {types.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={chosen.type === type}
              className={`${choiceButton(chosen.type === type)} flex-1 min-h-10`}
              onClick={() => setChosen({ ...chosen, type })}
            >
              {t(`edit.types.${type}`)}
            </button>
          ))}
        </div>
        <ValueEditor
          key={chosen.type}
          property={{ key: chosen.key, type: chosen.type, value: null }}
          onSave={(value) => {
            save(s, element.id, { properties: [...element.properties, { key: chosen.key, type: chosen.type, value }] });
            onClose();
          }}
          onCancel={onClose}
        />
      </div>
    );
  }

  return (
    <div className="py-2 space-y-2">
      <input
        className={inputClass}
        value={typed}
        onChange={(e) => { setTyped(e.target.value); setTaken(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && typed.trim()) pick(findKey(known, typed) ?? { key: typed.trim(), type: 'text' });
        }}
        placeholder={t('edit.propertyKey')}
        aria-label={t('edit.propertyKey')}
        enterKeyHint="next"
        autoFocus
      />
      {taken && <p className="text-xs text-error">{t('edit.keyTaken')}</p>}
      {suggestions.length > 0 && (
        <ul className="divide-y divide-border-default border border-border-default rounded">
          {suggestions.map((k) => (
            <li key={k.key}>
              <button type="button" className="w-full min-h-11 px-3 text-left text-sm active:bg-bg-secondary" onClick={() => pick(k)}>
                {k.key}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <IconAction icon={X} label={t('cancel')} onClick={onClose} />
        <IconAction
          icon={ArrowRight}
          label={t('edit.next')}
          variant="primary"
          disabled={!typed.trim()}
          onClick={() => pick(findKey(known, typed) ?? { key: typed.trim(), type: 'text' })}
        />
      </div>
    </div>
  );
}

// ============================================================================
// TAGS
// ============================================================================

/**
 * The element's tags. A tap on one shows the elements carrying it; when
 * editing, the dossier's tags are switched on and off. No new tag from the
 * phone: the tags come from the computers.
 */
export function ElementTags({ element, s, writable, onTag }: {
  element: Element;
  s: Session;
  writable: boolean;
  onTag: (tag: string) => void;
}) {
  const { t } = useTranslation('companion');
  const [editing, setEditing] = useState(false);
  const [filter, setFilter] = useState('');
  const all = useMemo(() => dossierTags(s.data.elements), [s.data.elements]);

  if (editing) {
    const query = filter.trim().toLocaleLowerCase();
    // The element's own tags first, then the others by use
    const listed = [
      ...element.tags,
      ...all.filter((tag) => !element.tags.includes(tag)),
    ].filter((tag) => !query || tag.toLocaleLowerCase().includes(query));
    const toggle = (tag: string) => {
      const tags = element.tags.includes(tag) ? element.tags.filter((x) => x !== tag) : [...element.tags, tag];
      save(s, element.id, { tags });
    };
    return (
      <section className="space-y-2">
        <h2 className={sectionTitle}>{t('tags.title')}</h2>
        {all.length > 12 && (
          <input
            className={inputClass}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('tags.filter')}
            aria-label={t('tags.filter')}
          />
        )}
        {all.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t('tags.noneInDossier')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {listed.map((tag) => {
              const on = element.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(tag)}
                  className={`${choiceButton(on)} min-h-10 rounded-full`}
                >
                  {on && <Check size={14} />}
                  {tag}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex justify-end">
          <IconAction icon={Check} label={t('tags.done')} onClick={() => { setEditing(false); setFilter(''); }} />
        </div>
      </section>
    );
  }

  if (element.tags.length === 0 && !writable) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {element.tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onTag(tag)}
          className="h-8 px-2.5 inline-flex items-center rounded-full border border-border-default text-sm text-text-secondary active:bg-bg-secondary"
        >
          {tag}
        </button>
      ))}
      {writable && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-8 h-8 inline-flex items-center justify-center rounded-full border border-dashed border-border-strong text-text-tertiary"
          aria-label={t('tags.edit')}
          title={t('tags.edit')}
        >
          {element.tags.length > 0 ? <Pencil size={14} /> : <Plus size={14} />}
        </button>
      )}
    </div>
  );
}

/** Native list: the phone's own picker, letters jump to a country */
function CountrySelect({ value, locale, label, onPick, onCancel, onDelete }: {
  value: string;
  locale: string;
  label: string;
  onPick: (code: string) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
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
      <EditActions onCancel={onCancel} onDelete={onDelete} />
    </div>
  );
}
