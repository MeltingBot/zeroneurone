import { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Settings, Calendar, Timer, Gauge, SlidersHorizontal } from 'lucide-react';
import { useDossierStore } from '../../stores';
import type { Dossier, EvaluationModel, Property, PropertyDefinition } from '../../types';
import { TagsEditor } from './TagsEditor';
import { PropertiesEditor } from './PropertiesEditor';
import { SuggestedPropertiesPopup } from './SuggestedPropertiesPopup';
import { AccordionSection, EditableField, MarkdownEditor } from '../common';
import { EVALUATION_MODELS, countEvaluationsOutsideModel, getEvaluationModel, isEvaluationModel } from '../../utils/evaluation';
import { activeTimeZoneLabel, dateLocale } from '../../utils/dates';
import { findLegacyUtcMidnightDates, type LegacyDateFixes } from '../../utils/legacyDates';
import { LABEL_WRAP_DEFAULT, LABEL_WRAP_MAX, LABEL_WRAP_MIN } from '../../utils/wrapLabel';
import { retentionExpiresAt } from '../../utils/dossierLock';

interface DossierDetailProps {
  dossier: Dossier;
}

/**
 * DossierDetail with lock/edit pattern (like Report sections)
 *
 * Pattern:
 * - Name/Creator: EditableField - click to edit, blur/Enter to save
 * - Description: MarkdownEditor - click to edit, blur to save
 * - No debounce, no continuous sync - saves only on validation
 * - During editing, external changes are ignored (no flash)
 */
export function DossierDetail({ dossier }: DossierDetailProps) {
  const { t } = useTranslation('panels');
  const { i18n } = useTranslation();
  const { updateDossier, addExistingTag, addSuggestedProperty, updateSuggestedPropertyChoices } = useDossierStore();

  // Description state - managed separately for MarkdownEditor
  const [description, setDescription] = useState(dossier.description);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const descriptionRef = useRef(dossier.description);

  // Start date local state
  const [startDate, setStartDate] = useState(
    dossier.startDate ? formatDateForInput(dossier.startDate) : ''
  );
  const [isEditingStartDate, setIsEditingStartDate] = useState(false);

  // Reset state when dossier changes
  useEffect(() => {
    setDescription(dossier.description);
    descriptionRef.current = dossier.description;
    setStartDate(dossier.startDate ? formatDateForInput(dossier.startDate) : '');
  }, [dossier.id]);

  // Sync description from props ONLY when not editing
  useEffect(() => {
    if (!isEditingDescription) {
      setDescription(dossier.description);
      descriptionRef.current = dossier.description;
    }
  }, [dossier.description, isEditingDescription]);

  // Sync startDate from props ONLY when not editing
  useEffect(() => {
    if (!isEditingStartDate) {
      setStartDate(dossier.startDate ? formatDateForInput(dossier.startDate) : '');
    }
  }, [dossier.startDate, isEditingStartDate]);

  // Handle name change (from EditableField)
  const handleNameChange = useCallback(
    (value: string) => {
      updateDossier(dossier.id, { name: value });
    },
    [dossier.id, updateDossier]
  );

  // Handle creator change (from EditableField)
  const handleCreatorChange = useCallback(
    (value: string) => {
      updateDossier(dossier.id, { creator: value });
    },
    [dossier.id, updateDossier]
  );

  // Handle description change - just update local state
  const handleDescriptionChange = useCallback((value: string) => {
    setDescription(value);
  }, []);

  // Handle description focus - mark as editing
  const handleDescriptionFocus = useCallback(() => {
    setIsEditingDescription(true);
    descriptionRef.current = description;
  }, [description]);

  // Handle description blur - save if changed
  const handleDescriptionBlur = useCallback(() => {
    setIsEditingDescription(false);
    // Only save if value changed
    if (description !== descriptionRef.current) {
      updateDossier(dossier.id, { description });
    }
  }, [description, dossier.id, updateDossier]);

  // Handle start date change
  const handleStartDateChange = useCallback(
    (value: string) => {
      setStartDate(value);
      // Only update if empty (clearing) or valid date (YYYY-MM-DD format complete)
      if (!value) {
        updateDossier(dossier.id, { startDate: null });
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const parsed = new Date(value + 'T12:00:00');
        if (!isNaN(parsed.getTime())) {
          updateDossier(dossier.id, { startDate: parsed });
        }
      }
    },
    [dossier.id, updateDossier]
  );

  // Handle tags change
  const handleTagsChange = useCallback(
    (tags: string[]) => {
      updateDossier(dossier.id, { tags });
    },
    [dossier.id, updateDossier]
  );

  // Handle properties change
  const handlePropertiesChange = useCallback(
    (properties: Property[]) => {
      updateDossier(dossier.id, { properties });
    },
    [dossier.id, updateDossier]
  );

  // Suggested properties popup when a tag from a TagSet is added
  const [suggestedPropsTagSet, setSuggestedPropsTagSet] = useState<string | null>(null);

  const handleApplySuggestedProperties = useCallback(
    (properties: Property[]) => {
      updateDossier(dossier.id, { properties: [...(dossier.properties || []), ...properties] });
    },
    [dossier.id, dossier.properties, updateDossier]
  );

  // Handle new tag (save to dossier settings for reuse)
  const handleNewTag = useCallback(
    (tag: string) => {
      addExistingTag(tag);
    },
    [addExistingTag]
  );

  // Handle new property (save to dossier settings for reuse)
  const handleNewProperty = useCallback(
    (propertyDef: PropertyDefinition) => {
      addSuggestedProperty(propertyDef);
    },
    [addSuggestedProperty]
  );

  // Badges for accordion sections
  const propertiesBadge = (dossier.properties?.length || 0) > 0 ? (
    <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
      {dossier.properties?.length}
    </span>
  ) : null;

  return (
    <div className="divide-y divide-border-default">
      {/* Informations générales */}
      <AccordionSection
        id="general"
        title={t('dossier.sections.information')}
        icon={<FileText size={12} />}
        defaultOpen={true}
      >
        <div className="space-y-4">
          {/* Name - EditableField with lock/edit pattern */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.name')}</label>
            <EditableField
              value={dossier.name}
              onChange={handleNameChange}
              placeholder={t('dossier.placeholders.name')}
              allowEmpty={false}
            />
          </div>

          {/* Description - MarkdownEditor with lock/edit pattern */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.description')}</label>
            <MarkdownEditor
              value={description}
              onChange={handleDescriptionChange}
              onFocus={handleDescriptionFocus}
              onBlur={handleDescriptionBlur}
              placeholder={t('detail.placeholders.markdown')}
              minRows={3}
            />
          </div>

          {/* Creator - EditableField with lock/edit pattern */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.creator')}</label>
            <EditableField
              value={dossier.creator || ''}
              onChange={handleCreatorChange}
              placeholder={t('dossier.placeholders.creator')}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.tags')}</label>
            <TagsEditor
              tags={dossier.tags || []}
              onChange={handleTagsChange}
              suggestions={dossier.settings?.existingTags}
              onNewTag={handleNewTag}
              onTagSetTagAdded={setSuggestedPropsTagSet}
            />
          </div>
        </div>
      </AccordionSection>

      {/* Dates */}
      <AccordionSection
        id="dates"
        title={t('dossier.sections.dates')}
        icon={<Calendar size={12} />}
        defaultOpen={false}
      >
        <div className="space-y-4">
          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.startDate')}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              onFocus={() => setIsEditingStartDate(true)}
              onBlur={() => setIsEditingStartDate(false)}
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary transition-all"
            />
          </div>

          <ClosureField dossier={dossier} />

          {/* Created At (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.createdAt')}</label>
            <p className="text-sm text-text-primary">
              {formatDateDisplay(dossier.createdAt, i18n.language)}
            </p>
          </div>

          {/* Updated At (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.updatedAt')}</label>
            <p className="text-sm text-text-primary">
              {formatDateDisplay(dossier.updatedAt, i18n.language)}
            </p>
          </div>

          {/* Time zone shown, correction of older imported dates */}
          <TimeZoneAndLegacyDates />
        </div>
      </AccordionSection>

      {/* Évaluation de l'information */}
      <EvaluationSection dossier={dossier} />

      {/* Rétention */}
      <RetentionSection dossier={dossier} />

      {/* Options */}
      <OptionsSection dossier={dossier} />

      {/* Propriétés */}
      <AccordionSection
        id="properties"
        title={t('dossier.sections.properties')}
        icon={<Settings size={12} />}
        badge={propertiesBadge}
        defaultOpen={false}
      >
        <PropertiesEditor
          properties={dossier.properties || []}
          onChange={handlePropertiesChange}
          suggestions={dossier.settings?.suggestedProperties}
          onNewProperty={handleNewProperty}
          onUpdateChoices={updateSuggestedPropertyChoices}
        />
      </AccordionSection>

      {suggestedPropsTagSet && (
        <SuggestedPropertiesPopup
          tagSetName={suggestedPropsTagSet}
          existingPropertyKeys={(dossier.properties || []).map((p) => p.key)}
          onApply={handleApplySuggestedProperties}
          onClose={() => setSuggestedPropsTagSet(null)}
        />
      )}
    </div>
  );
}

/**
 * Evaluation model of the dossier, shared with every collaborator.
 * Switching models never converts existing gradings: when some would end up
 * outside the new model, an inline confirmation states how many.
 */
function EvaluationSection({ dossier }: { dossier: Dossier }) {
  const { t } = useTranslation('panels');
  const { t: tc } = useTranslation('common');
  const { updateDossier } = useDossierStore();
  const model = getEvaluationModel(dossier);
  const [pendingState, setPending] = useState<
    { model: EvaluationModel; count: number; from: EvaluationModel; dossierId: string } | null
  >(null);
  // A pending confirmation lapses when the model changes remotely or the dossier switches
  const pending = pendingState && pendingState.from === model && pendingState.dossierId === dossier.id
    ? pendingState
    : null;

  const handleChange = (value: string) => {
    if (!isEvaluationModel(value) || value === model) {
      setPending(null);
      return;
    }
    // Read on demand: subscribing to elements/links would re-render the panel on every edit
    const { elements, links } = useDossierStore.getState();
    const count = countEvaluationsOutsideModel(elements, value) + countEvaluationsOutsideModel(links, value);
    if (count > 0) {
      setPending({ model: value, count, from: model, dossierId: dossier.id });
    } else {
      updateDossier(dossier.id, { evaluationModel: value });
    }
  };

  const shown = pending?.model ?? model;

  return (
    <AccordionSection
      id="evaluation"
      title={t('dossier.sections.evaluation')}
      icon={<Gauge size={12} />}
      defaultOpen={false}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.evaluationModel')}</label>
          <select
            value={shown}
            onChange={(e) => handleChange(e.target.value)}
            title={tc(`evaluation.modelHints.${shown}`)}
            className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary transition-all"
          >
            {EVALUATION_MODELS.map((m) => (
              <option key={m} value={m}>{tc(`evaluation.models.${m}`)}</option>
            ))}
          </select>
        </div>

        {pending && (
          <div className="space-y-2 p-2 border border-border-default rounded bg-bg-secondary">
            <p className="text-xs text-text-primary">
              {pending.model === 'zeroneurone'
                ? t('dossier.labels.evaluationHiddenWarning', { count: pending.count })
                : t('dossier.labels.evaluationOutsideWarning', { count: pending.count })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPending(null)}
                className="px-3 py-1.5 text-sm font-medium text-text-primary bg-bg-primary border border-border-default hover:bg-bg-secondary rounded transition-colors"
              >
                {tc('actions.cancel')}
              </button>
              <button
                onClick={() => {
                  updateDossier(dossier.id, { evaluationModel: pending.model });
                  setPending(null);
                }}
                className="px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded transition-colors"
              >
                {tc('actions.confirm')}
              </button>
            </div>
          </div>
        )}
      </div>
    </AccordionSection>
  );
}

/** Per-dossier options; future ones go in this section too. */
function OptionsSection({ dossier }: { dossier: Dossier }) {
  const { t } = useTranslation('panels');
  const updateDossier = useDossierStore((s) => s.updateDossier);
  const options = dossier.options ?? {};

  return (
    <AccordionSection
      id="options"
      title={t('dossier.sections.options')}
      icon={<SlidersHorizontal size={12} />}
      defaultOpen={false}
    >
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={options.linkArrowByDefault === true}
          onChange={(e) => updateDossier(dossier.id, { options: { ...options, linkArrowByDefault: e.target.checked } })}
          className="w-3.5 h-3.5 rounded border-border-default accent-accent"
        />
        <span className="text-sm text-text-primary">{t('dossier.labels.linkArrowByDefault')}</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer mt-2">
        <input
          type="checkbox"
          checked={options.blurMediaOnOpen === true}
          onChange={(e) => updateDossier(dossier.id, { options: { ...options, blurMediaOnOpen: e.target.checked } })}
          className="w-3.5 h-3.5 rounded border-border-default accent-accent"
        />
        <span className="text-sm text-text-primary">{t('dossier.labels.blurMediaOnOpen')}</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer mt-2">
        <input
          type="checkbox"
          checked={options.linkLabelWrap !== undefined}
          onChange={(e) => {
            const rest = { ...options };
            delete rest.linkLabelWrap;
            updateDossier(dossier.id, { options: e.target.checked ? { ...rest, linkLabelWrap: LABEL_WRAP_DEFAULT } : rest });
          }}
          className="w-3.5 h-3.5 rounded border-border-default accent-accent"
        />
        <span className="text-sm text-text-primary">{t('dossier.labels.linkLabelWrap')}</span>
      </label>
      {options.linkLabelWrap !== undefined && (
        <LabelWrapWidth
          value={options.linkLabelWrap}
          onChange={(linkLabelWrap) => updateDossier(dossier.id, { options: { ...options, linkLabelWrap } })}
        />
      )}
    </AccordionSection>
  );
}

/**
 * Width of the link labels, in characters. Applied as soon as the field holds
 * a width within bounds (typing, arrows); on blur, an out-of-bounds entry is
 * brought back within them and an empty one restored.
 */
function LabelWrapWidth({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t } = useTranslation('panels');
  const [draft, setDraft] = useState(String(value));
  // Changed elsewhere (collaboration, import): the field follows
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    if (Number(draft) !== value) setDraft(String(value));
  }

  const change = (text: string) => {
    setDraft(text);
    const n = Number(text);
    if (text.trim() !== '' && Number.isInteger(n) && n >= LABEL_WRAP_MIN && n <= LABEL_WRAP_MAX && n !== value) {
      onChange(n);
    }
  };

  const commit = () => {
    const n = Math.round(Number(draft));
    if (!Number.isFinite(n) || draft.trim() === '') {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(LABEL_WRAP_MAX, Math.max(LABEL_WRAP_MIN, n));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className="flex items-center gap-2 mt-1 ml-5.5">
      <input
        type="number"
        min={LABEL_WRAP_MIN}
        max={LABEL_WRAP_MAX}
        value={draft}
        onChange={(e) => change(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        aria-label={t('dossier.labels.linkLabelWrapWidth')}
        className="w-16 px-2 py-1 text-sm rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
      />
      <span className="text-xs text-text-secondary">{t('dossier.labels.linkLabelWrapWidth')}</span>
    </div>
  );
}

type RetentionPolicy = 'warn' | 'readonly' | 'delete' | 'redact';

/** Closure of the dossier: closing asks for a confirmation, the dossier is then read-only until reopened */
function ClosureField({ dossier }: { dossier: Dossier }) {
  const { t } = useTranslation('panels');
  const { i18n } = useTranslation();
  const closeDossier = useDossierStore((s) => s.closeDossier);
  const reopenDossier = useDossierStore((s) => s.reopenDossier);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => setConfirming(false), [dossier.id, dossier.closedAt]);

  const buttonClass = 'px-3 py-1.5 text-sm font-medium text-text-primary bg-bg-primary border border-border-default hover:bg-bg-secondary rounded transition-colors';

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.closure')}</label>
      {dossier.closedAt ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-text-primary">{formatDateDisplay(dossier.closedAt, i18n.language)}</p>
          <button onClick={() => reopenDossier(dossier.id)} className={buttonClass}>
            {t('dossier.labels.reopen')}
          </button>
        </div>
      ) : confirming ? (
        <div className="space-y-2">
          <p className="text-xs text-text-secondary">{t('dossier.labels.closeConfirm')}</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirming(false)} className={buttonClass}>
              {t('dossier.labels.cancel')}
            </button>
            <button
              onClick={() => closeDossier(dossier.id)}
              className="px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded transition-colors"
            >
              {t('dossier.labels.close')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-text-tertiary">{t('dossier.labels.notClosed')}</p>
          <button onClick={() => setConfirming(true)} className={buttonClass}>
            {t('dossier.labels.close')}
          </button>
        </div>
      )}
      {(dossier.closureHistory ?? []).map((h, index) => (
        <p key={index} className="text-xs text-text-tertiary">
          {formatDateDisplay(h.closedAt, i18n.language)} → {formatDateDisplay(h.reopenedAt, i18n.language)}
        </p>
      ))}
    </div>
  );
}

function RetentionSection({ dossier }: { dossier: Dossier }) {
  const { t } = useTranslation('panels');
  const { i18n } = useTranslation();
  const { updateDossier } = useDossierStore();

  const [localDays, setLocalDays] = useState<string>(
    dossier.retentionDays != null ? String(dossier.retentionDays) : ''
  );
  const [localPolicy, setLocalPolicy] = useState<RetentionPolicy>(
    dossier.retentionPolicy || 'warn'
  );
  const [localFrom, setLocalFrom] = useState<'created' | 'closed'>(dossier.retentionFrom || 'created');

  // Sync from props when dossier changes
  useEffect(() => {
    setLocalDays(dossier.retentionDays != null ? String(dossier.retentionDays) : '');
    setLocalPolicy(dossier.retentionPolicy || 'warn');
    setLocalFrom(dossier.retentionFrom || 'created');
  }, [dossier.id, dossier.retentionDays, dossier.retentionPolicy, dossier.retentionFrom]);

  const savedDays = dossier.retentionDays ?? null;
  const savedPolicy = dossier.retentionPolicy || 'warn';
  const pendingDays = localDays === '' ? null : Math.max(1, parseInt(localDays, 10) || 1);
  const savedFrom = dossier.retentionFrom || 'created';
  const hasChanges = pendingDays !== savedDays || localPolicy !== savedPolicy || localFrom !== savedFrom;

  const handleApply = () => {
    updateDossier(dossier.id, {
      retentionDays: pendingDays,
      retentionPolicy: localPolicy,
      retentionFrom: localFrom,
    });
  };

  // Compute expiration info based on pending values
  const expirationInfo = pendingDays != null ? (() => {
    const expiresAt = retentionExpiresAt({ ...dossier, retentionFrom: localFrom }, pendingDays);
    if (!expiresAt) return null; // counts from closure, not closed yet
    const expiredDays = Math.ceil((Date.now() - expiresAt.getTime()) / 86400000);
    return { expiresAt, expiredDays, isExpired: expiredDays > 0 };
  })() : null;

  return (
    <AccordionSection
      id="retention"
      title={t('dossier.sections.retention')}
      icon={<Timer size={12} />}
      defaultOpen={false}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.retentionDays')}</label>
          <input
            type="number"
            min={1}
            value={localDays}
            onChange={(e) => setLocalDays(e.target.value)}
            placeholder={t('dossier.labels.retentionUnlimited')}
            className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary transition-all"
          />
        </div>

        {pendingDays != null && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.retentionPolicy')}</label>
              <select
                value={localPolicy}
                onChange={(e) => setLocalPolicy(e.target.value as RetentionPolicy)}
                className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary transition-all"
              >
                <option value="warn">{t('dossier.labels.retentionPolicyWarn')}</option>
                <option value="readonly">{t('dossier.labels.retentionPolicyReadonly')}</option>
                <option value="delete">{t('dossier.labels.retentionPolicyDelete')}</option>
                <option value="redact">{t('dossier.labels.retentionPolicyRedact')}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.retentionFrom')}</label>
              <select
                value={localFrom}
                onChange={(e) => setLocalFrom(e.target.value as 'created' | 'closed')}
                className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary transition-all"
              >
                <option value="created">{t('dossier.labels.retentionFromCreated')}</option>
                <option value="closed">{t('dossier.labels.retentionFromClosed')}</option>
              </select>
            </div>

            {localFrom === 'closed' && !dossier.closedAt && !dossier.closureHistory?.length && (
              <p className="text-xs text-text-tertiary">{t('dossier.labels.retentionStartsAtClosure')}</p>
            )}

            {expirationInfo && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.retentionExpires')}</label>
                {expirationInfo.isExpired ? (
                  <p className="text-sm font-medium text-error">
                    {t('dossier.labels.retentionExpiredSince', { days: expirationInfo.expiredDays })}
                  </p>
                ) : (
                  <p className="text-sm text-text-primary">
                    {formatDateDisplay(expirationInfo.expiresAt, i18n.language)}
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {(hasChanges || savedDays != null) && (
          <div className="flex gap-2">
            {hasChanges && (
              <button
                onClick={handleApply}
                className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded transition-colors"
              >
                {t('dossier.labels.retentionApply')}
              </button>
            )}
            {savedDays != null && (
              <button
                onClick={() => {
                  setLocalDays('');
                  setLocalPolicy('warn');
                  setLocalFrom('created');
                  updateDossier(dossier.id, {
                    retentionDays: null,
                    retentionPolicy: 'warn',
                    retentionFrom: 'created',
                  });
                }}
                className="flex-1 px-3 py-1.5 text-sm font-medium text-text-secondary bg-bg-secondary border border-border-default hover:bg-bg-tertiary rounded transition-colors"
              >
                {t('dossier.labels.retentionReset')}
              </button>
            )}
          </div>
        )}
      </div>
    </AccordionSection>
  );
}

// Format date for date input (YYYY-MM-DD)
function formatDateForInput(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format date for display
function formatDateDisplay(date: Date, language: string): string {
  const d = new Date(date);
  const locale = dateLocale(language);
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Part of the Dates section: the time zone hours are shown in (the system one,
 * read-only) and, on request, the correction of calendar days saved at UTC
 * midnight by older imports. Nothing changes without an explicit confirmation.
 */
function TimeZoneAndLegacyDates() {
  const { t } = useTranslation('panels');
  const { updateElement, updateLink } = useDossierStore();
  const [fixes, setFixes] = useState<LegacyDateFixes | null>(null);
  const [applying, setApplying] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const handleCheck = () => {
    const { elements, links } = useDossierStore.getState();
    setFixes(findLegacyUtcMidnightDates(elements, links));
    setDoneCount(null);
    setError(false);
  };

  const handleApply = async () => {
    if (!fixes) return;
    setApplying(true);
    setError(false);
    try {
      for (const { id, changes } of fixes.elements) await updateElement(id, changes);
      for (const { id, changes } of fixes.links) await updateLink(id, changes);
      setDoneCount(fixes.dateCount);
      setFixes(null);
    } catch {
      setError(true);
    } finally {
      setApplying(false);
    }
  };

  const secondaryButton = 'px-3 py-1.5 text-sm font-medium text-text-secondary bg-bg-secondary border border-border-default hover:bg-bg-tertiary rounded transition-colors disabled:opacity-50';

  return (
    <>
      <div className="space-y-1">
        <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.timeZone')}</label>
        <p className="text-sm text-text-primary">{activeTimeZoneLabel()}</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">{t('dossier.labels.legacyDates')}</label>

        {(fixes === null || fixes.dateCount === 0) && (
          <button onClick={handleCheck} className={secondaryButton}>
            {t('dossier.labels.legacyCheck')}
          </button>
        )}

        {fixes !== null && fixes.dateCount === 0 && (
          <p className="text-sm text-text-primary">{t('dossier.labels.legacyNone')}</p>
        )}

        {fixes !== null && fixes.dateCount > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-text-primary">
              {t('dossier.labels.legacyFound', { count: fixes.dateCount })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleApply}
                disabled={applying}
                className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded transition-colors disabled:opacity-50"
              >
                {t('dossier.labels.legacyApply')}
              </button>
              <button onClick={() => setFixes(null)} disabled={applying} className={`flex-1 ${secondaryButton}`}>
                {t('dossier.labels.legacyCancel')}
              </button>
            </div>
          </div>
        )}

        {doneCount !== null && (
          <p className="text-sm text-text-primary">{t('dossier.labels.legacyDone', { count: doneCount })}</p>
        )}
        {error && <p className="text-sm text-error">{t('dossier.labels.legacyError')}</p>}
      </div>
    </>
  );
}
