import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Modal, Button, Input, IconButton, IconPicker } from '../common';
import { useTagSetStore, useUIStore } from '../../stores';
import type { TagSet, SuggestedProperty, ElementShape, PropertyType } from '../../types';

interface TagSetEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tagSet?: TagSet; // If provided, editing; otherwise creating
}

const SHAPE_OPTIONS: { value: ElementShape; labelKey: string }[] = [
  { value: 'circle', labelKey: 'tagSetEditor.shapes.circle' },
  { value: 'square', labelKey: 'tagSetEditor.shapes.square' },
  { value: 'diamond', labelKey: 'tagSetEditor.shapes.diamond' },
  { value: 'rectangle', labelKey: 'tagSetEditor.shapes.rectangle' },
];

const PROPERTY_TYPES: { value: PropertyType; labelKey: string }[] = [
  { value: 'text', labelKey: 'tagSetEditor.propertyTypes.text' },
  { value: 'number', labelKey: 'tagSetEditor.propertyTypes.number' },
  { value: 'date', labelKey: 'tagSetEditor.propertyTypes.date' },
  { value: 'datetime', labelKey: 'tagSetEditor.propertyTypes.datetime' },
  { value: 'boolean', labelKey: 'tagSetEditor.propertyTypes.boolean' },
  { value: 'choice', labelKey: 'tagSetEditor.propertyTypes.choice' },
  { value: 'country', labelKey: 'tagSetEditor.propertyTypes.country' },
  { value: 'geo', labelKey: 'tagSetEditor.propertyTypes.geo' },
  { value: 'link', labelKey: 'tagSetEditor.propertyTypes.link' },
];

/** Detect if a property key suggests a URL/link type */
function suggestsLinkType(key: string): boolean {
  if (!key) return false;
  const lower = key.toLowerCase().trim();
  const linkKeywords = [
    'url', 'link', 'lien', 'site', 'website', 'web', 'href',
    'homepage', 'page', 'linkedin', 'facebook', 'twitter', 'instagram',
    'github', 'gitlab', 'source', 'référence', 'reference', 'wiki',
  ];
  return linkKeywords.some(kw => lower.includes(kw));
}

const COLOR_OPTIONS = [
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
  '#64748b', // Slate
];

export function TagSetEditorModal({ isOpen, onClose, tagSet }: TagSetEditorModalProps) {
  const { t } = useTranslation(['modals', 'common']);
  const { create, update, nameExists } = useTagSetStore();
  const showToast = useUIStore((state) => state.showToast);

  const isEditing = !!tagSet;

  // Form state
  const [name, setName] = useState(tagSet?.name || '');
  const [description, setDescription] = useState(tagSet?.description || '');
  const [color, setColor] = useState(tagSet?.defaultVisual.color || null);
  const [shape, setShape] = useState<ElementShape | null>(tagSet?.defaultVisual.shape || null);
  const [icon, setIcon] = useState<string | null>(tagSet?.defaultVisual.icon || null);
  const [properties, setProperties] = useState<SuggestedProperty[]>(
    tagSet?.suggestedProperties || []
  );
  const [isLoading, setIsLoading] = useState(false);

  // Validation
  const nameError = useMemo(() => {
    if (!name.trim()) return t('tagSetEditor.nameRequired');
    if (nameExists(name.trim(), tagSet?.id)) return t('tagSetEditor.nameExists');
    return null;
  }, [name, nameExists, tagSet?.id, t]);

  const handleSubmit = useCallback(async () => {
    if (nameError) return;

    setIsLoading(true);
    try {
      if (isEditing && tagSet) {
        await update(tagSet.id, {
          name: name.trim(),
          description: description.trim(),
          defaultVisual: { color, shape, icon },
          suggestedProperties: properties,
        });
        showToast('success', t('tagSetEditor.tagModified', { name }));
      } else {
        await create({
          name: name.trim(),
          description: description.trim(),
          defaultVisual: { color, shape, icon },
          suggestedProperties: properties,
          isBuiltIn: false,
        });
        showToast('success', t('tagSetEditor.tagCreated', { name }));
      }
      onClose();
    } catch (error) {
      showToast('error', t('tagSetEditor.saveError'));
    } finally {
      setIsLoading(false);
    }
  }, [
    nameError,
    isEditing,
    tagSet,
    name,
    description,
    color,
    shape,
    icon,
    properties,
    update,
    create,
    showToast,
    onClose,
    t,
  ]);

  const handleAddProperty = useCallback(() => {
    setProperties((prev) => [
      ...prev,
      { key: '', type: 'text', description: '', placeholder: '' },
    ]);
  }, []);

  const handleRemoveProperty = useCallback((index: number) => {
    setProperties((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateProperty = useCallback(
    (index: number, changes: Partial<SuggestedProperty>) => {
      setProperties((prev) =>
        prev.map((prop, i) => (i === index ? { ...prop, ...changes } : prop))
      );
    },
    []
  );

  const handleMoveProperty = useCallback((index: number, direction: 'up' | 'down') => {
    setProperties((prev) => {
      const newArr = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newArr.length) return prev;
      [newArr[index], newArr[targetIndex]] = [newArr[targetIndex], newArr[index]];
      return newArr;
    });
  }, []);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? t('tagSetEditor.titleEdit', { name: tagSet.name }) : t('tagSetEditor.titleNew')}
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!!nameError || isLoading}
          >
            {isLoading ? t('tagSets.saving') : t('tagSets.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">{t('tagSetEditor.nameLabel')}</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('tagSetEditor.nameExample')}
            autoFocus
          />
          {nameError && name.trim() && (
            <p className="text-xs text-error">{nameError}</p>
          )}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary">{t('tagSetEditor.descriptionLabel')}</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('tagSetEditor.descriptionPlaceholder')}
          />
        </div>

        {/* Default Visual */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-text-secondary">
            {t('tagSetEditor.defaultAppearance')}
          </label>

          {/* Color picker */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary w-16">{t('tagSetEditor.colorOption')}</span>
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setColor(null)}
                className={`w-6 h-6 rounded border ${
                  color === null
                    ? 'border-accent ring-2 ring-accent/30'
                    : 'border-border-default'
                } bg-bg-tertiary flex items-center justify-center text-xs text-text-tertiary`}
                title={t('tagSetEditor.noneOption')}
              >
                ×
              </button>
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded border ${
                    color === c
                      ? 'border-accent ring-2 ring-accent/30'
                      : 'border-border-default'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Shape picker */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary w-16">{t('tagSetEditor.shapeOption')}</span>
            <select
              value={shape || ''}
              onChange={(e) => setShape((e.target.value as ElementShape) || null)}
              className="px-2 py-1 text-sm bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent"
            >
              <option value="">{t('tagSetEditor.noneOption')}</option>
              {SHAPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </div>

          {/* Icon picker */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary w-16">{t('tagSetEditor.iconOption')}</span>
            <div className="flex-1">
              <IconPicker value={icon} onChange={setIcon} />
            </div>
          </div>
        </div>

        {/* Suggested Properties */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-text-secondary">
            {t('tagSetEditor.suggestedProperties')}
          </label>

          <div className="space-y-2">
            {properties.map((prop, index) => (
              <PropertyEditor
                key={index}
                property={prop}
                index={index}
                total={properties.length}
                onChange={(changes) => handleUpdateProperty(index, changes)}
                onRemove={() => handleRemoveProperty(index)}
                onMoveUp={() => handleMoveProperty(index, 'up')}
                onMoveDown={() => handleMoveProperty(index, 'down')}
              />
            ))}

            <button
              onClick={handleAddProperty}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-secondary border border-dashed border-border-default rounded transition-colors"
            >
              <Plus size={12} />
              {t('tagSetEditor.addProperty')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface PropertyEditorProps {
  property: SuggestedProperty;
  index: number;
  total: number;
  onChange: (changes: Partial<SuggestedProperty>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function PropertyEditor({
  property,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: PropertyEditorProps) {
  const { t } = useTranslation(['modals', 'common']);
  const [showChoices, setShowChoices] = useState(property.type === 'choice');

  const handleTypeChange = useCallback(
    (type: PropertyType) => {
      onChange({ type, choices: type === 'choice' ? [] : undefined });
      setShowChoices(type === 'choice');
    },
    [onChange]
  );

  // Auto-detect link type when key suggests a URL
  const handleKeyChange = useCallback(
    (newKey: string) => {
      const changes: Partial<SuggestedProperty> = { key: newKey };
      // Auto-switch to 'link' type if key suggests URL and current type is 'text'
      if (property.type === 'text' && suggestsLinkType(newKey)) {
        changes.type = 'link';
      }
      onChange(changes);
    },
    [onChange, property.type]
  );

  const handleChoicesChange = useCallback(
    (choicesStr: string) => {
      const choices = choicesStr.split(',').map((c) => c.trim()).filter(Boolean);
      onChange({ choices });
    },
    [onChange]
  );

  return (
    <div className="flex items-start gap-2 p-2 bg-bg-secondary border border-border-default rounded">
      {/* Drag handle and move buttons */}
      <div className="flex flex-col items-center gap-0.5 pt-1">
        <IconButton
          onClick={onMoveUp}
          size="sm"
          disabled={index === 0}
          title={t('tagSetEditor.moveUp')}
        >
          <ChevronUp size={12} />
        </IconButton>
        <IconButton
          onClick={onMoveDown}
          size="sm"
          disabled={index === total - 1}
          title={t('tagSetEditor.moveDown')}
        >
          <ChevronDown size={12} />
        </IconButton>
      </div>

      {/* Property fields */}
      <div className="flex-1 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={property.key}
            onChange={(e) => handleKeyChange(e.target.value)}
            placeholder={t('tagSetEditor.propertyName')}
            className="flex-1 px-2 py-1 text-sm bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
          />
          <select
            value={property.type}
            onChange={(e) => handleTypeChange(e.target.value as PropertyType)}
            className="px-2 py-1 text-sm bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
          >
            {PROPERTY_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {t(opt.labelKey)}
              </option>
            ))}
          </select>
        </div>

        <input
          type="text"
          value={property.placeholder}
          onChange={(e) => onChange({ placeholder: e.target.value })}
          placeholder={t('tagSetEditor.exampleValue')}
          className="w-full px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-tertiary"
        />

        {showChoices && (
          <input
            type="text"
            value={property.choices?.join(', ') || ''}
            onChange={(e) => handleChoicesChange(e.target.value)}
            placeholder={t('tagSetEditor.choicesPlaceholder')}
            className="w-full px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent"
          />
        )}
      </div>

      {/* Remove button */}
      <IconButton onClick={onRemove} size="sm" title={t('common:actions.delete')}>
        <Trash2 size={12} />
      </IconButton>
    </div>
  );
}
