import { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Settings, Calendar, Timer } from 'lucide-react';
import { useInvestigationStore } from '../../stores';
import type { Investigation, Property, PropertyDefinition } from '../../types';
import { TagsEditor } from './TagsEditor';
import { PropertiesEditor } from './PropertiesEditor';
import { AccordionSection, EditableField, MarkdownEditor } from '../common';

interface InvestigationDetailProps {
  investigation: Investigation;
}

/**
 * InvestigationDetail with lock/edit pattern (like Report sections)
 *
 * Pattern:
 * - Name/Creator: EditableField - click to edit, blur/Enter to save
 * - Description: MarkdownEditor - click to edit, blur to save
 * - No debounce, no continuous sync - saves only on validation
 * - During editing, external changes are ignored (no flash)
 */
export function InvestigationDetail({ investigation }: InvestigationDetailProps) {
  const { t } = useTranslation('panels');
  const { i18n } = useTranslation();
  const { updateInvestigation, addExistingTag, addSuggestedProperty } = useInvestigationStore();

  // Description state - managed separately for MarkdownEditor
  const [description, setDescription] = useState(investigation.description);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const descriptionRef = useRef(investigation.description);

  // Start date local state
  const [startDate, setStartDate] = useState(
    investigation.startDate ? formatDateForInput(investigation.startDate) : ''
  );
  const [isEditingStartDate, setIsEditingStartDate] = useState(false);

  // Reset state when investigation changes
  useEffect(() => {
    setDescription(investigation.description);
    descriptionRef.current = investigation.description;
    setStartDate(investigation.startDate ? formatDateForInput(investigation.startDate) : '');
  }, [investigation.id]);

  // Sync description from props ONLY when not editing
  useEffect(() => {
    if (!isEditingDescription) {
      setDescription(investigation.description);
      descriptionRef.current = investigation.description;
    }
  }, [investigation.description, isEditingDescription]);

  // Sync startDate from props ONLY when not editing
  useEffect(() => {
    if (!isEditingStartDate) {
      setStartDate(investigation.startDate ? formatDateForInput(investigation.startDate) : '');
    }
  }, [investigation.startDate, isEditingStartDate]);

  // Handle name change (from EditableField)
  const handleNameChange = useCallback(
    (value: string) => {
      updateInvestigation(investigation.id, { name: value });
    },
    [investigation.id, updateInvestigation]
  );

  // Handle creator change (from EditableField)
  const handleCreatorChange = useCallback(
    (value: string) => {
      updateInvestigation(investigation.id, { creator: value });
    },
    [investigation.id, updateInvestigation]
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
      updateInvestigation(investigation.id, { description });
    }
  }, [description, investigation.id, updateInvestigation]);

  // Handle start date change
  const handleStartDateChange = useCallback(
    (value: string) => {
      setStartDate(value);
      // Only update if empty (clearing) or valid date (YYYY-MM-DD format complete)
      if (!value) {
        updateInvestigation(investigation.id, { startDate: null });
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const parsed = new Date(value + 'T12:00:00');
        if (!isNaN(parsed.getTime())) {
          updateInvestigation(investigation.id, { startDate: parsed });
        }
      }
    },
    [investigation.id, updateInvestigation]
  );

  // Handle tags change
  const handleTagsChange = useCallback(
    (tags: string[]) => {
      updateInvestigation(investigation.id, { tags });
    },
    [investigation.id, updateInvestigation]
  );

  // Handle properties change
  const handlePropertiesChange = useCallback(
    (properties: Property[]) => {
      updateInvestigation(investigation.id, { properties });
    },
    [investigation.id, updateInvestigation]
  );

  // Handle new tag (save to investigation settings for reuse)
  const handleNewTag = useCallback(
    (tag: string) => {
      addExistingTag(tag);
    },
    [addExistingTag]
  );

  // Handle new property (save to investigation settings for reuse)
  const handleNewProperty = useCallback(
    (propertyDef: PropertyDefinition) => {
      addSuggestedProperty(propertyDef);
    },
    [addSuggestedProperty]
  );

  // Badges for accordion sections
  const propertiesBadge = (investigation.properties?.length || 0) > 0 ? (
    <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
      {investigation.properties?.length}
    </span>
  ) : null;

  return (
    <div className="divide-y divide-border-default">
      {/* Informations générales */}
      <AccordionSection
        id="general"
        title={t('investigation.sections.information')}
        icon={<FileText size={12} />}
        defaultOpen={true}
      >
        <div className="space-y-4">
          {/* Name - EditableField with lock/edit pattern */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('investigation.labels.name')}</label>
            <EditableField
              value={investigation.name}
              onChange={handleNameChange}
              placeholder={t('investigation.placeholders.name')}
              allowEmpty={false}
            />
          </div>

          {/* Description - MarkdownEditor with lock/edit pattern */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('investigation.labels.description')}</label>
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
            <label className="text-xs font-medium text-text-secondary">{t('investigation.labels.creator')}</label>
            <EditableField
              value={investigation.creator || ''}
              onChange={handleCreatorChange}
              placeholder={t('investigation.placeholders.creator')}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('investigation.labels.tags')}</label>
            <TagsEditor
              tags={investigation.tags || []}
              onChange={handleTagsChange}
              suggestions={investigation.settings?.existingTags}
              onNewTag={handleNewTag}
            />
          </div>
        </div>
      </AccordionSection>

      {/* Dates */}
      <AccordionSection
        id="dates"
        title={t('investigation.sections.dates')}
        icon={<Calendar size={12} />}
        defaultOpen={false}
      >
        <div className="space-y-4">
          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('investigation.labels.startDate')}</label>
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
            <label className="text-xs font-medium text-text-secondary">{t('investigation.labels.createdAt')}</label>
            <p className="text-sm text-text-primary">
              {formatDateDisplay(investigation.createdAt, i18n.language)}
            </p>
          </div>

          {/* Updated At (read-only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('investigation.labels.updatedAt')}</label>
            <p className="text-sm text-text-primary">
              {formatDateDisplay(investigation.updatedAt, i18n.language)}
            </p>
          </div>
        </div>
      </AccordionSection>

      {/* Rétention */}
      <RetentionSection investigation={investigation} />

      {/* Propriétés */}
      <AccordionSection
        id="properties"
        title={t('investigation.sections.properties')}
        icon={<Settings size={12} />}
        badge={propertiesBadge}
        defaultOpen={false}
      >
        <PropertiesEditor
          properties={investigation.properties || []}
          onChange={handlePropertiesChange}
          suggestions={investigation.settings?.suggestedProperties}
          onNewProperty={handleNewProperty}
        />
      </AccordionSection>
    </div>
  );
}

type RetentionPolicy = 'warn' | 'readonly' | 'delete' | 'redact';

function RetentionSection({ investigation }: { investigation: Investigation }) {
  const { t } = useTranslation('panels');
  const { i18n } = useTranslation();
  const { updateInvestigation } = useInvestigationStore();

  const [localDays, setLocalDays] = useState<string>(
    investigation.retentionDays != null ? String(investigation.retentionDays) : ''
  );
  const [localPolicy, setLocalPolicy] = useState<RetentionPolicy>(
    investigation.retentionPolicy || 'warn'
  );

  // Sync from props when investigation changes
  useEffect(() => {
    setLocalDays(investigation.retentionDays != null ? String(investigation.retentionDays) : '');
    setLocalPolicy(investigation.retentionPolicy || 'warn');
  }, [investigation.id, investigation.retentionDays, investigation.retentionPolicy]);

  const savedDays = investigation.retentionDays ?? null;
  const savedPolicy = investigation.retentionPolicy || 'warn';
  const pendingDays = localDays === '' ? null : Math.max(1, parseInt(localDays, 10) || 1);
  const hasChanges = pendingDays !== savedDays || localPolicy !== savedPolicy;

  const handleApply = () => {
    updateInvestigation(investigation.id, {
      retentionDays: pendingDays,
      retentionPolicy: localPolicy,
    });
  };

  // Compute expiration info based on pending values
  const expirationInfo = pendingDays != null ? (() => {
    const expiresAt = new Date(new Date(investigation.createdAt).getTime() + pendingDays * 86400000);
    const expiredDays = Math.ceil((Date.now() - expiresAt.getTime()) / 86400000);
    return { expiresAt, expiredDays, isExpired: expiredDays > 0 };
  })() : null;

  return (
    <AccordionSection
      id="retention"
      title={t('investigation.sections.retention')}
      icon={<Timer size={12} />}
      defaultOpen={false}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">{t('investigation.labels.retentionDays')}</label>
          <input
            type="number"
            min={1}
            value={localDays}
            onChange={(e) => setLocalDays(e.target.value)}
            placeholder={t('investigation.labels.retentionUnlimited')}
            className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary transition-all"
          />
        </div>

        {pendingDays != null && (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">{t('investigation.labels.retentionPolicy')}</label>
              <select
                value={localPolicy}
                onChange={(e) => setLocalPolicy(e.target.value as RetentionPolicy)}
                className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary transition-all"
              >
                <option value="warn">{t('investigation.labels.retentionPolicyWarn')}</option>
                <option value="readonly">{t('investigation.labels.retentionPolicyReadonly')}</option>
                <option value="delete">{t('investigation.labels.retentionPolicyDelete')}</option>
                <option value="redact">{t('investigation.labels.retentionPolicyRedact')}</option>
              </select>
            </div>

            {expirationInfo && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-text-secondary">{t('investigation.labels.retentionExpires')}</label>
                {expirationInfo.isExpired ? (
                  <p className="text-sm font-medium text-error">
                    {t('investigation.labels.retentionExpiredSince', { days: expirationInfo.expiredDays })}
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
                {t('investigation.labels.retentionApply')}
              </button>
            )}
            {savedDays != null && (
              <button
                onClick={() => {
                  setLocalDays('');
                  setLocalPolicy('warn');
                  updateInvestigation(investigation.id, {
                    retentionDays: null,
                    retentionPolicy: 'warn',
                  });
                }}
                className="flex-1 px-3 py-1.5 text-sm font-medium text-text-secondary bg-bg-secondary border border-border-default hover:bg-bg-tertiary rounded transition-colors"
              >
                {t('investigation.labels.retentionReset')}
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
