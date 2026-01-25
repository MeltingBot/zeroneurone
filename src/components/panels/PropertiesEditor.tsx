import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus, ChevronDown, Check, ExternalLink } from 'lucide-react';
import type { Property, PropertyType, PropertyDefinition } from '../../types';
import { DropdownPortal } from '../common';
import { getLocalizedCountries, getCountryName, getCountryByCode, type LocalizedCountry } from '../../data/countries';

interface PropertiesEditorProps {
  properties: Property[];
  onChange: (properties: Property[]) => void;
  /** Suggested property definitions from the investigation */
  suggestions?: PropertyDefinition[];
  /** Callback when a new property is created */
  onNewProperty?: (propertyDef: PropertyDefinition) => void;
  /** Properties to display on canvas (global setting) */
  displayedProperties?: string[];
  /** Callback to toggle a property display on canvas */
  onToggleDisplayProperty?: (propertyKey: string) => void;
}

const PROPERTY_TYPE_VALUES: PropertyType[] = ['text', 'number', 'date', 'datetime', 'boolean', 'country', 'link'];

/** Format Date for datetime-local input (YYYY-MM-DDTHH:mm) using LOCAL timezone */
function formatDateTimeForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/** Format Date for date input (YYYY-MM-DD) using LOCAL timezone */
function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function PropertiesEditor({
  properties,
  onChange,
  suggestions = [],
  onNewProperty,
  displayedProperties = [],
  onToggleDisplayProperty,
}: PropertiesEditorProps) {
  const { t, i18n } = useTranslation('panels');
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState<string | number | boolean | null>('');
  const [newType, setNewType] = useState<PropertyType>('text');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const typeButtonRef = useRef<HTMLButtonElement>(null);

  const getTypeLabel = useCallback((type: PropertyType): string => {
    return t(`detail.properties.types.${type}`);
  }, [t]);

  // Filter suggestions based on input value and exclude already used keys
  const existingKeys = properties.map((p) => p.key);
  const filteredSuggestions = suggestions.filter(
    (s) =>
      !existingKeys.includes(s.key) &&
      s.key.toLowerCase().includes(newKey.toLowerCase())
  );

  // Show dropdown when focused and there are suggestions available
  const shouldShowSuggestions = showSuggestions && suggestions.length > 0;

  const resetForm = useCallback(() => {
    setNewKey('');
    setNewValue('');
    setNewType('text');
    setIsAdding(false);
    setShowSuggestions(false);
    setShowTypeDropdown(false);
    setSelectedSuggestionIndex(-1);
  }, []);

  const handleAddProperty = useCallback((keyToAdd?: string, typeToUse?: PropertyType) => {
    const trimmedKey = (keyToAdd || newKey).trim();
    const finalType = typeToUse || newType;

    if (trimmedKey) {
      // Convert value to appropriate type
      let finalValue: Property['value'] = null;
      if (finalType === 'boolean') {
        finalValue = newValue === true || newValue === 'true';
      } else if (finalType === 'number') {
        const num = typeof newValue === 'number' ? newValue : parseFloat(String(newValue));
        finalValue = isNaN(num) ? null : num;
      } else if (finalType === 'date') {
        finalValue = newValue ? new Date(String(newValue)) : null;
      } else {
        finalValue = newValue !== '' ? String(newValue) : null;
      }

      onChange([...properties, { key: trimmedKey, value: finalValue, type: finalType }]);

      // Always notify parent to update association (will update type if different)
      if (onNewProperty) {
        onNewProperty({ key: trimmedKey, type: finalType });
      }
      resetForm();
    }
  }, [newKey, newValue, newType, properties, onChange, onNewProperty, suggestions, resetForm]);

  const handleRemoveProperty = useCallback(
    (keyToRemove: string) => {
      onChange(properties.filter((prop) => prop.key !== keyToRemove));
    },
    [properties, onChange]
  );

  const handleUpdateProperty = useCallback(
    (key: string, value: Property['value'], type?: PropertyType) => {
      onChange(
        properties.map((prop) =>
          prop.key === key ? { ...prop, value, type: type || prop.type } : prop
        )
      );
    },
    [properties, onChange]
  );

  const handleSelectSuggestion = useCallback((suggestion: PropertyDefinition) => {
    setNewKey(suggestion.key);
    setNewType(suggestion.type);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  }, []);

  // Key handler for the name field - Enter focuses type selector instead of adding
  const handleNameKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedSuggestionIndex >= 0 && filteredSuggestions[selectedSuggestionIndex]) {
          handleSelectSuggestion(filteredSuggestions[selectedSuggestionIndex]);
        } else if (newKey.trim()) {
          // Focus type button instead of adding immediately
          typeButtonRef.current?.focus();
          setShowTypeDropdown(true);
        }
      } else if (e.key === 'Escape') {
        resetForm();
      } else if (e.key === 'ArrowDown' && showSuggestions) {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) =>
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp' && showSuggestions) {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1));
      }
    },
    [handleSelectSuggestion, filteredSuggestions, selectedSuggestionIndex, showSuggestions, newKey, resetForm]
  );

  // Key handler for the value field - Enter adds the property
  const handleValueKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (newKey.trim()) {
          handleAddProperty();
        }
      } else if (e.key === 'Escape') {
        resetForm();
      }
    },
    [handleAddProperty, newKey, resetForm]
  );

  const handleCloseSuggestions = useCallback(() => {
    setShowSuggestions(false);
  }, []);

  const handleCloseTypeDropdown = useCallback(() => {
    setShowTypeDropdown(false);
  }, []);

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedSuggestionIndex(-1);
  }, [newKey]);

  return (
    <div className="space-y-2">
      {/* Add new property - always at top */}
      {isAdding ? (
        <div className="space-y-2 p-2 bg-bg-secondary rounded border border-border-default">
          {/* Property key input */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-text-tertiary uppercase">{t('detail.labels.name')}</label>
            <input
              ref={keyInputRef}
              type="text"
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleNameKeyPress}
              autoFocus
              placeholder={t('detail.properties.namePlaceholder')}
              className="w-full px-2 py-1.5 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
            />

            {/* Suggestions dropdown */}
            <DropdownPortal
              anchorRef={keyInputRef}
              isOpen={shouldShowSuggestions}
              onClose={handleCloseSuggestions}
              className="max-h-48 overflow-y-auto"
            >
              {filteredSuggestions.length > 0 ? (
                filteredSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.key}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(suggestion);
                    }}
                    className={`w-full px-2 py-1.5 text-xs text-left hover:bg-bg-secondary flex items-center justify-between ${
                      index === selectedSuggestionIndex ? 'bg-bg-secondary' : ''
                    }`}
                  >
                    <span>{suggestion.key}</span>
                    <span className="text-text-tertiary text-[10px]">
                      {getTypeLabel(suggestion.type)}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-2 py-1.5 text-xs text-text-tertiary">
                  {t('detail.properties.noMatch')}
                </div>
              )}
            </DropdownPortal>
          </div>

          {/* Type selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-text-tertiary uppercase">{t('detail.properties.typePlaceholder')}</label>
            <button
              ref={typeButtonRef}
              type="button"
              onClick={() => setShowTypeDropdown(!showTypeDropdown)}
              className="w-full px-2 py-1.5 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary flex items-center justify-between hover:bg-bg-secondary transition-colors"
            >
              <span>{getTypeLabel(newType)}</span>
              <ChevronDown size={12} className={`text-text-tertiary transition-transform ${showTypeDropdown ? 'rotate-180' : ''}`} />
            </button>

            <DropdownPortal
              anchorRef={typeButtonRef}
              isOpen={showTypeDropdown}
              onClose={handleCloseTypeDropdown}
              className="min-w-[150px]"
            >
              {PROPERTY_TYPE_VALUES.map((typeValue) => (
                <button
                  key={typeValue}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setNewType(typeValue);
                    setShowTypeDropdown(false);
                  }}
                  className={`w-full px-2 py-1.5 text-xs text-left hover:bg-bg-secondary flex items-center justify-between ${
                    newType === typeValue ? 'bg-bg-secondary' : ''
                  }`}
                >
                  <span>{getTypeLabel(typeValue)}</span>
                  {newType === typeValue && <Check size={12} className="text-accent" />}
                </button>
              ))}
            </DropdownPortal>
          </div>

          {/* Value input based on type */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-text-tertiary uppercase">{t('detail.properties.valuePlaceholder')}</label>
            <PropertyValueInput
              type={newType}
              value={newValue}
              onChange={setNewValue}
              onKeyDown={handleValueKeyPress}
              placeholder={t('detail.properties.valuePlaceholder')}
              t={t}
              locale={i18n.language}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => handleAddProperty()}
              disabled={!newKey.trim()}
              className="flex-1 px-2 py-1 text-xs font-medium bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('detail.properties.add')}
            </button>
            <button
              onClick={resetForm}
              className="flex-1 px-2 py-1 text-xs font-medium bg-bg-tertiary text-text-secondary rounded hover:bg-border-default"
            >
              {t('detail.properties.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary rounded border border-dashed border-border-default w-full justify-center"
        >
          <Plus size={12} />
          {t('detail.properties.addProperty')}
        </button>
      )}

      {/* Properties list - scrollable when many */}
      {properties.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {properties.map((prop) => (
            <PropertyRow
              key={prop.key}
              property={prop}
              onUpdate={(value) => handleUpdateProperty(prop.key, value, prop.type)}
              onRemove={() => handleRemoveProperty(prop.key)}
              isDisplayed={displayedProperties.includes(prop.key)}
              onToggleDisplay={onToggleDisplayProperty ? () => onToggleDisplayProperty(prop.key) : undefined}
              t={t}
              locale={i18n.language}
            />
          ))}
        </div>
      )}

      {properties.length === 0 && !isAdding && (
        <p className="text-xs text-text-tertiary">{t('detail.properties.noProperties')}</p>
      )}
    </div>
  );
}

// Property row component for displaying existing properties
interface PropertyRowProps {
  property: Property;
  onUpdate: (value: Property['value']) => void;
  onRemove: () => void;
  isDisplayed?: boolean;
  onToggleDisplay?: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  locale: string;
}

function PropertyRow({ property, onUpdate, onRemove, isDisplayed, onToggleDisplay, t, locale }: PropertyRowProps) {
  const type = property.type || 'text';

  return (
    <div className="flex items-start gap-2">
      {/* Display toggle checkbox */}
      {onToggleDisplay && (
        <button
          onClick={onToggleDisplay}
          className={`mt-0.5 w-4 h-4 flex items-center justify-center border rounded transition-colors ${
            isDisplayed
              ? 'bg-accent border-accent text-white'
              : 'border-border-default hover:border-accent text-transparent'
          }`}
          title={isDisplayed ? t('detail.properties.hideOnCanvas') : t('detail.properties.showOnCanvas')}
        >
          {isDisplayed && <Check size={10} />}
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-text-secondary truncate">
            {property.key}
          </span>
          <span className="text-[10px] text-text-tertiary bg-bg-tertiary px-1 py-0.5 rounded">
            {t(`detail.properties.types.${type}`)}
          </span>
        </div>
        <PropertyValueInput
          type={type}
          value={property.value}
          onChange={onUpdate}
          placeholder={t('detail.properties.valuePlaceholder')}
          compact
          t={t}
          locale={locale}
        />
      </div>
      <button
        onClick={onRemove}
        className="p-1 text-text-tertiary hover:text-error focus:outline-none"
        aria-label={t('detail.properties.deleteProperty', { key: property.key })}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// Property value input component based on type
interface PropertyValueInputProps {
  type: PropertyType;
  value: Property['value'];
  onChange: (value: Property['value']) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  placeholder?: string;
  compact?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
  locale: string;
}

function PropertyValueInput({
  type,
  value,
  onChange,
  onKeyDown,
  placeholder,
  compact = false,
  t,
  locale,
}: PropertyValueInputProps) {
  const baseInputClass = compact
    ? 'w-full px-2 py-1 text-xs bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary'
    : 'w-full px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary';

  switch (type) {
    case 'boolean':
      return (
        <div className="flex items-center gap-2 py-1">
          <button
            type="button"
            onClick={() => onChange(!value)}
            className={`relative w-8 h-4 rounded-full transition-colors ${
              value ? 'bg-accent' : 'bg-bg-tertiary'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                value ? 'translate-x-4' : ''
              }`}
            />
          </button>
          <span className="text-xs text-text-secondary">
            {value ? t('detail.properties.booleanYes') : t('detail.properties.booleanNo')}
          </span>
        </div>
      );

    case 'number':
      return (
        <input
          type="number"
          value={value !== null && value !== undefined ? String(value) : ''}
          onChange={(e) => {
            const num = parseFloat(e.target.value);
            onChange(isNaN(num) ? null : num);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={baseInputClass}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={
            value instanceof Date
              ? formatDateForInput(value)
              : value
              ? String(value).split('T')[0]
              : ''
          }
          onChange={(e) => {
            // Append T12:00 to avoid UTC midnight day-shift (ES spec: date-only = UTC)
            onChange(e.target.value ? new Date(e.target.value + 'T12:00:00') : null);
          }}
          onKeyDown={onKeyDown}
          className={baseInputClass}
        />
      );

    case 'datetime':
      return (
        <input
          type="datetime-local"
          value={
            value instanceof Date
              ? formatDateTimeForInput(value)
              : value
              ? String(value).slice(0, 16)
              : ''
          }
          onChange={(e) => {
            // datetime-local value has no TZ suffix → interpreted as local time (correct)
            onChange(e.target.value ? new Date(e.target.value) : null);
          }}
          onKeyDown={onKeyDown}
          className={baseInputClass}
        />
      );

    case 'country':
      return (
        <CountryPicker
          value={String(value ?? '')}
          onChange={onChange}
          compact={compact}
          t={t}
          locale={locale}
        />
      );

    case 'link': {
      const url = String(value ?? '');
      const isValidUrl = url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('www.'));
      const openUrl = isValidUrl
        ? url.startsWith('www.') ? `https://${url}` : url
        : null;
      return (
        <div className="relative flex items-center gap-1">
          <input
            type="url"
            value={url}
            onChange={(e) => onChange(e.target.value || null)}
            onKeyDown={onKeyDown}
            placeholder={placeholder || 'https://...'}
            className={`${baseInputClass} ${openUrl ? 'pr-7' : ''}`}
          />
          {openUrl && (
            <button
              type="button"
              onClick={() => window.open(openUrl, '_blank', 'noopener,noreferrer')}
              className="absolute right-1.5 p-0.5 text-text-tertiary hover:text-accent transition-colors"
              title={t('detail.labels.openInNewTab')}
            >
              <ExternalLink size={12} />
            </button>
          )}
        </div>
      );
    }

    default:
      return (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value || null)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={baseInputClass}
        />
      );
  }
};

// Country picker component
interface CountryPickerProps {
  value: string;
  onChange: (value: string | null) => void;
  compact?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
  locale: string;
}

function CountryPicker({ value, onChange, compact = false, t, locale }: CountryPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get countries with localized names (already sorted alphabetically)
  const localizedCountries = getLocalizedCountries(locale);

  const selectedCountry = value ? getCountryByCode(value) : null;
  const selectedCountryName = value ? getCountryName(value, locale) : null;

  const filteredCountries = search
    ? localizedCountries.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.code.toLowerCase().includes(search.toLowerCase())
      )
    : localizedCountries;

  const handleSelect = useCallback(
    (country: LocalizedCountry) => {
      onChange(country.code);
      setIsOpen(false);
      setSearch('');
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange(null);
    setIsOpen(false);
    setSearch('');
  }, [onChange]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch('');
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const baseClass = compact
    ? 'w-full px-2 py-1 text-xs bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary'
    : 'w-full px-2 py-1 text-xs bg-bg-primary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary';

  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${baseClass} flex items-center justify-between text-left`}
      >
        {selectedCountry && selectedCountryName ? (
          <span className="flex items-center gap-1.5">
            <span>{selectedCountry.flag}</span>
            <span>{selectedCountryName}</span>
            <span className="text-text-tertiary">({selectedCountry.code})</span>
          </span>
        ) : (
          <span className="text-text-tertiary">{t('detail.properties.selectCountry')}</span>
        )}
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <DropdownPortal
        anchorRef={buttonRef}
        isOpen={isOpen}
        onClose={handleClose}
        className="min-w-[200px] max-h-64"
      >
        <div className="p-1 border-b border-border-default">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('detail.properties.search')}
            className="w-full px-2 py-1 text-xs bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
          />
        </div>
        <div className="overflow-y-auto max-h-48">
          {value && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleClear();
              }}
              className="w-full px-2 py-1.5 text-xs text-left hover:bg-bg-secondary text-text-tertiary italic"
            >
              {t('detail.properties.clearSelection')}
            </button>
          )}
          {filteredCountries.map((country) => (
            <button
              key={country.code}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(country);
              }}
              className={`w-full px-2 py-1.5 text-xs text-left hover:bg-bg-secondary flex items-center gap-2 ${
                value === country.code ? 'bg-bg-secondary' : ''
              }`}
            >
              <span>{country.flag}</span>
              <span className="flex-1">{country.name}</span>
              <span className="text-text-tertiary">{country.code}</span>
              {value === country.code && <Check size={12} className="text-accent" />}
            </button>
          ))}
          {filteredCountries.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-text-tertiary">
              {t('detail.properties.noCountryFound')}
            </div>
          )}
        </div>
      </DropdownPortal>
    </div>
  );
}
