import { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Settings, Calendar, Timer } from 'lucide-react';
import { useDossierStore } from '../../stores';
import type { Dossier, Property, PropertyDefinition } from '../../types';
import { TagsEditor } from './TagsEditor';
import { PropertiesEditor } from './PropertiesEditor';
import { AccordionSection, EditableField, MarkdownEditor } from '../common';

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
              maxRows={10}
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
        </div>
      </AccordionSection>

      {/* Rétention */}
      <RetentionSection dossier={dossier} />

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
    </div>
  );
}

type RetentionPolicy = 'warn' | 'readonly' | 'delete' | 'redact';

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

  // Sync from props when dossier changes
  useEffect(() => {
    setLocalDays(dossier.retentionDays != null ? String(dossier.retentionDays) : '');
    setLocalPolicy(dossier.retentionPolicy || 'warn');
  }, [dossier.id, dossier.retentionDays, dossier.retentionPolicy]);

  const savedDays = dossier.retentionDays ?? null;
  const savedPolicy = dossier.retentionPolicy || 'warn';
  const pendingDays = localDays === '' ? null : Math.max(1, parseInt(localDays, 10) || 1);
  const hasChanges = pendingDays !== savedDays || localPolicy !== savedPolicy;

  const handleApply = () => {
    updateDossier(dossier.id, {
      retentionDays: pendingDays,
      retentionPolicy: localPolicy,
    });
  };

  // Compute expiration info based on pending values
  const expirationInfo = pendingDays != null ? (() => {
    const expiresAt = new Date(new Date(dossier.createdAt).getTime() + pendingDays * 86400000);
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
                  updateDossier(dossier.id, {
                    retentionDays: null,
                    retentionPolicy: 'warn',
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
  const locale = language.startsWith('fr') ? 'fr-FR' : 'en-US';
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
