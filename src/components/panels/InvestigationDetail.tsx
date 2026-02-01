import { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Settings, Calendar } from 'lucide-react';
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
