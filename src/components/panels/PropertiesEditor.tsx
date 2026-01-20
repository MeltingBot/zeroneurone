import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Plus, ChevronDown, Check, ExternalLink } from 'lucide-react';
import type { Property, PropertyType, PropertyDefinition } from '../../types';
import { DropdownPortal } from '../common';
import { COUNTRIES, getCountryByCode, type Country } from '../../data/countries';

interface PropertiesEditorProps {
  properties: Property[];
  onChange: (properties: Property[]) => void;
  /** Suggested property definitions from the investigation */
  suggestions?: PropertyDefinition[];
  /** Callback when a new property is created */
  onNewProperty?: (propertyDef: PropertyDefinition) => void;
}

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'text', label: 'Texte' },
  { value: 'number', label: 'Numérique' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Booléen' },
  { value: 'country', label: 'Pays' },
  { value: 'link', label: 'Lien' },
];

function getTypeLabel(type: PropertyType): string {
  return PROPERTY_TYPES.find((t) => t.value === type)?.label ?? 'Texte';
}

export function PropertiesEditor({
  properties,
  onChange,
  suggestions = [],
  onNewProperty,
}: PropertiesEditorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState<string | number | boolean | null>('');
  const [newType, setNewType] = useState<PropertyType>('text');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const typeButtonRef = useRef<HTMLButtonElement>(null);

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

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedSuggestionIndex >= 0 && filteredSuggestions[selectedSuggestionIndex]) {
          handleSelectSuggestion(filteredSuggestions[selectedSuggestionIndex]);
        } else if (newKey.trim()) {
          handleAddProperty();
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
    [handleAddProperty, handleSelectSuggestion, filteredSuggestions, selectedSuggestionIndex, showSuggestions, newKey, resetForm]
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
      {/* Properties list */}
      {properties.length > 0 && (
        <div className="space-y-2">
          {properties.map((prop) => (
            <PropertyRow
              key={prop.key}
              property={prop}
              onUpdate={(value) => handleUpdateProperty(prop.key, value, prop.type)}
              onRemove={() => handleRemoveProperty(prop.key)}
            />
          ))}
        </div>
      )}

      {/* Add new property */}
      {isAdding ? (
        <div className="space-y-2 p-2 bg-bg-secondary rounded border border-border-default">
          {/* Property key input */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-text-tertiary uppercase">Nom</label>
            <input
              ref={keyInputRef}
              type="text"
              value={newKey}
              onChange={(e) => {
                setNewKey(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={handleKeyPress}
              autoFocus
              placeholder="Ex: SIREN, Nationalité..."
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
                  Aucune correspondance
                </div>
              )}
            </DropdownPortal>
          </div>

          {/* Type selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-text-tertiary uppercase">Type</label>
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
              {PROPERTY_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setNewType(type.value);
                    setShowTypeDropdown(false);
                  }}
                  className={`w-full px-2 py-1.5 text-xs text-left hover:bg-bg-secondary flex items-center justify-between ${
                    newType === type.value ? 'bg-bg-secondary' : ''
                  }`}
                >
                  <span>{type.label}</span>
                  {newType === type.value && <Check size={12} className="text-accent" />}
                </button>
              ))}
            </DropdownPortal>
          </div>

          {/* Value input based on type */}
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-text-tertiary uppercase">Valeur</label>
            <PropertyValueInput
              type={newType}
              value={newValue}
              onChange={setNewValue}
              onKeyDown={handleKeyPress}
              placeholder="Valeur..."
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => handleAddProperty()}
              disabled={!newKey.trim()}
              className="flex-1 px-2 py-1 text-xs font-medium bg-accent text-white rounded hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Ajouter
            </button>
            <button
              onClick={resetForm}
              className="flex-1 px-2 py-1 text-xs font-medium bg-bg-tertiary text-text-secondary rounded hover:bg-border-default"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 px-2 py-1 text-xs text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary rounded border border-dashed border-border-default w-full justify-center"
        >
          <Plus size={12} />
          Ajouter une propriété
        </button>
      )}

      {properties.length === 0 && !isAdding && (
        <p className="text-xs text-text-tertiary">Aucune propriété</p>
      )}
    </div>
  );
}

// Property row component for displaying existing properties
interface PropertyRowProps {
  property: Property;
  onUpdate: (value: Property['value']) => void;
  onRemove: () => void;
}

function PropertyRow({ property, onUpdate, onRemove }: PropertyRowProps) {
  const type = property.type || 'text';

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-text-secondary truncate">
            {property.key}
          </span>
          <span className="text-[10px] text-text-tertiary bg-bg-tertiary px-1 py-0.5 rounded">
            {getTypeLabel(type)}
          </span>
        </div>
        <PropertyValueInput
          type={type}
          value={property.value}
          onChange={onUpdate}
          placeholder="Valeur..."
          compact
        />
      </div>
      <button
        onClick={onRemove}
        className="p-1 text-text-tertiary hover:text-error focus:outline-none"
        aria-label={`Supprimer la propriété ${property.key}`}
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
}

function PropertyValueInput({
  type,
  value,
  onChange,
  onKeyDown,
  placeholder,
  compact = false,
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
            {value ? 'Oui' : 'Non'}
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
              ? value.toISOString().split('T')[0]
              : value
              ? String(value).split('T')[0]
              : ''
          }
          onChange={(e) => {
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
              title="Ouvrir dans un nouvel onglet"
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
}

function CountryPicker({ value, onChange, compact = false }: CountryPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedCountry = value ? getCountryByCode(value) : null;

  const filteredCountries = search
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.code.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRIES;

  const handleSelect = useCallback(
    (country: Country) => {
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
        {selectedCountry ? (
          <span className="flex items-center gap-1.5">
            <span>{selectedCountry.flag}</span>
            <span>{selectedCountry.name}</span>
            <span className="text-text-tertiary">({selectedCountry.code})</span>
          </span>
        ) : (
          <span className="text-text-tertiary">Sélectionner un pays...</span>
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
            placeholder="Rechercher..."
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
              Effacer la sélection
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
              Aucun pays trouvé
            </div>
          )}
        </div>
      </DropdownPortal>
    </div>
  );
}
