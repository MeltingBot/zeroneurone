import { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Settings, Calendar } from 'lucide-react';
import { useInvestigationStore } from '../../stores';
import type { Investigation, Property, PropertyDefinition } from '../../types';
import { TagsEditor } from './TagsEditor';
import { PropertiesEditor } from './PropertiesEditor';
import { AccordionSection, MarkdownEditor } from '../common';

interface InvestigationDetailProps {
  investigation: Investigation;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function InvestigationDetail({ investigation }: InvestigationDetailProps) {
  const { t } = useTranslation('panels');
  const { i18n } = useTranslation();
  const { updateInvestigation, addExistingTag, addSuggestedProperty } = useInvestigationStore();

  // Local state for inputs
  const [name, setName] = useState(investigation.name);
  const [description, setDescription] = useState(investigation.description);
  const [creator, setCreator] = useState(investigation.creator || '');
  const [startDate, setStartDate] = useState(
    investigation.startDate ? formatDateForInput(investigation.startDate) : ''
  );

  // Refs to track what we last synced to Yjs - used to detect our own echoes
  const lastSyncedNameRef = useRef(investigation.name);
  const lastSyncedDescriptionRef = useRef(investigation.description);
  const lastSyncedCreatorRef = useRef(investigation.creator || '');

  // Debounced values
  const debouncedName = useDebounce(name, 500);
  const debouncedDescription = useDebounce(description, 500);
  const debouncedCreator = useDebounce(creator, 500);

  // Reset refs when investigation changes
  useEffect(() => {
    lastSyncedNameRef.current = investigation.name;
    lastSyncedDescriptionRef.current = investigation.description;
    lastSyncedCreatorRef.current = investigation.creator || '';
    setName(investigation.name);
    setDescription(investigation.description);
    setCreator(investigation.creator || '');
    setStartDate(investigation.startDate ? formatDateForInput(investigation.startDate) : '');
  }, [investigation.id]);

  // Sync from props when fields change from REMOTE
  useEffect(() => {
    // Our own echo - ignore
    if (investigation.name === lastSyncedNameRef.current) return;
    // Remote change - accept
    setName(investigation.name);
    lastSyncedNameRef.current = investigation.name;
  }, [investigation.name]);

  useEffect(() => {
    if (investigation.description === lastSyncedDescriptionRef.current) return;
    setDescription(investigation.description);
    lastSyncedDescriptionRef.current = investigation.description;
  }, [investigation.description]);

  useEffect(() => {
    const creatorValue = investigation.creator || '';
    if (creatorValue === lastSyncedCreatorRef.current) return;
    setCreator(creatorValue);
    lastSyncedCreatorRef.current = creatorValue;
  }, [investigation.creator]);

  // Save debounced name
  useEffect(() => {
    if (debouncedName !== investigation.name) {
      lastSyncedNameRef.current = debouncedName;
      updateInvestigation(investigation.id, { name: debouncedName });
    }
  }, [debouncedName, investigation.id, investigation.name, updateInvestigation]);

  // Save debounced description
  useEffect(() => {
    if (debouncedDescription !== investigation.description) {
      lastSyncedDescriptionRef.current = debouncedDescription;
      updateInvestigation(investigation.id, { description: debouncedDescription });
    }
  }, [debouncedDescription, investigation.id, investigation.description, updateInvestigation]);

  // Save debounced creator
  useEffect(() => {
    if (debouncedCreator !== (investigation.creator || '')) {
      lastSyncedCreatorRef.current = debouncedCreator;
      updateInvestigation(investigation.id, { creator: debouncedCreator });
    }
  }, [debouncedCreator, investigation.id, investigation.creator, updateInvestigation]);

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
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('investigation.labels.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('investigation.placeholders.name')}
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary placeholder:text-text-tertiary transition-all"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('investigation.labels.description')}</label>
            <MarkdownEditor
              value={description}
              onChange={setDescription}
              placeholder={t('detail.placeholders.markdown')}
              minRows={3}
              maxRows={10}
            />
          </div>

          {/* Creator */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">{t('investigation.labels.creator')}</label>
            <input
              type="text"
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              placeholder={t('investigation.placeholders.creator')}
              className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent input-focus-glow text-text-primary placeholder:text-text-tertiary transition-all"
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
