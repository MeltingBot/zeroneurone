import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, X, Plus, Upload, Trash2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { DropdownPortal } from './DropdownPortal';
import { ResolvedIcon } from './ResolvedIcon';
import { useCustomIconStore, toast } from '../../stores';
import { CUSTOM_ICON_PREFIX, isCustomIconName } from '../../types';
import { sanitizeSvgIcon, iconNameFromFilename, SvgIconError } from '../../utils/svgIcon';
import type { CustomIcon } from '../../types';

// Get all icon names from Lucide (excluding non-icon exports)
const EXCLUDED_EXPORTS = new Set([
  'createLucideIcon',
  'default',
  'icons',
  'createElement',
  'LucideIcon',
  'Icon',
]);

// Build icon list once - filter to get only icon components (not *Icon / Lucide* duplicates)
const ALL_ICONS = Object.keys(LucideIcons)
  .filter(name => {
    // Exclude non-icon exports
    if (EXCLUDED_EXPORTS.has(name)) return false;
    // Exclude *Icon and Lucide* duplicates (keep User, not UserIcon / LucideUser)
    if (name.endsWith('Icon')) return false;
    if (name.startsWith('Lucide')) return false;
    // Check if it's a valid React component (has $$typeof Symbol)
    const component = (LucideIcons as Record<string, unknown>)[name];
    if (typeof component !== 'object' || component === null) return false;
    // React.forwardRef components have $$typeof
    return '$$typeof' in component;
  })
  .sort();

// Common/popular icons for quick access (curated list)
const POPULAR_ICONS = [
  // People & Identity
  'User', 'Users', 'UserCircle', 'UserCheck', 'Contact', 'Baby', 'PersonStanding',
  // Organizations
  'Building', 'Building2', 'Landmark', 'Store', 'Factory', 'Home', 'Hotel',
  // Communication
  'Phone', 'Mail', 'MessageSquare', 'MessageCircle', 'AtSign', 'Send',
  // Location
  'MapPin', 'Map', 'Globe', 'Compass', 'Navigation', 'Flag',
  // Documents
  'File', 'FileText', 'Files', 'Folder', 'FolderOpen', 'Archive', 'Clipboard',
  // Finance
  'Wallet', 'CreditCard', 'Banknote', 'PiggyBank', 'Receipt', 'Coins',
  // Transport
  'Car', 'Truck', 'Ship', 'Plane', 'Train', 'Bike',
  // Tech
  'Laptop', 'Smartphone', 'Monitor', 'Server', 'Database', 'Wifi', 'Globe',
  // Security
  'Shield', 'Lock', 'Key', 'Eye', 'EyeOff', 'Fingerprint',
  // Status
  'CheckCircle', 'XCircle', 'AlertCircle', 'AlertTriangle', 'Info', 'HelpCircle',
  // Time
  'Clock', 'Calendar', 'CalendarDays', 'Timer', 'History',
  // Actions
  'Search', 'Filter', 'Settings', 'Edit', 'Trash2', 'Plus', 'Minus',
  // Media
  'Image', 'Camera', 'Video', 'Music', 'Mic',
  // Misc
  'Star', 'Heart', 'Bookmark', 'Tag', 'Hash', 'Link', 'ExternalLink',
];

/**
 * Shared dropdown content: search, custom icons section (with SVG import),
 * and the Lucide icon grid.
 */
function IconDropdownContent({
  value,
  onSelect,
  onClear,
  showClear,
}: {
  value: string | null;
  onSelect: (iconName: string) => void;
  onClear?: () => void;
  showClear?: boolean;
}) {
  const { t } = useTranslation('common');
  const [search, setSearch] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const customIconsMap = useCustomIconStore((state) => state.icons);
  const createCustomIcon = useCustomIconStore((state) => state.create);
  const deleteCustomIcon = useCustomIconStore((state) => state.delete);

  const customIcons = useMemo(
    () => Array.from(customIconsMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    [customIconsMap]
  );

  // Filter icons based on search
  const filteredIcons = useMemo(() => {
    if (!search.trim()) {
      return POPULAR_ICONS.filter(name => ALL_ICONS.includes(name));
    }
    const searchLower = search.toLowerCase();
    return ALL_ICONS.filter(name => name.toLowerCase().includes(searchLower));
  }, [search]);

  const filteredCustomIcons = useMemo(() => {
    if (!search.trim()) return customIcons;
    const searchLower = search.toLowerCase();
    return customIcons.filter(icon => icon.name.toLowerCase().includes(searchLower));
  }, [customIcons, search]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const handleImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const rawSvg = await file.text();
      const svg = sanitizeSvgIcon(rawSvg);
      const icon = await createCustomIcon(iconNameFromFilename(file.name), svg);
      onSelect(`${CUSTOM_ICON_PREFIX}${icon.id}`);
    } catch (error) {
      if (error instanceof SvgIconError && error.code === 'too_large') {
        toast.error(t('iconPicker.svgTooLarge'));
      } else {
        toast.error(t('iconPicker.invalidSvg'));
      }
    }
  }, [createCustomIcon, onSelect, t]);

  const handleDeleteCustom = useCallback(async (event: React.MouseEvent, icon: CustomIcon) => {
    event.stopPropagation();
    await deleteCustomIcon(icon.id);
  }, [deleteCustomIcon]);

  const getIconComponent = useCallback((name: string) => {
    return (LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[name];
  }, []);

  return (
    <>
      {/* Search input */}
      <div className="p-2 border-b border-border-default">
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('iconPicker.searchPlaceholder')}
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
          />
        </div>
        {showClear && value && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="w-full mt-1 px-2 py-1 text-xs text-text-tertiary hover:text-error hover:bg-bg-secondary rounded transition-colors"
          >
            {t('iconPicker.removeIcon')}
          </button>
        )}
      </div>

      {/* Icons grid */}
      <div className="p-2 max-h-64 overflow-y-auto">
        {/* Custom icons section */}
        {(filteredCustomIcons.length > 0 || !search) && (
          <>
            <p className="text-[10px] text-text-tertiary mb-2">{t('iconPicker.customIcons')}</p>
            <div className="grid grid-cols-8 gap-1 mb-2">
              {filteredCustomIcons.map((icon) => {
                const iconRef = `${CUSTOM_ICON_PREFIX}${icon.id}`;
                const isSelected = value === iconRef;
                return (
                  <div key={icon.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => onSelect(iconRef)}
                      className={`p-2 rounded hover:bg-bg-secondary transition-colors ${
                        isSelected ? 'bg-accent/20 text-accent' : 'text-text-secondary'
                      }`}
                      title={icon.name}
                    >
                      <ResolvedIcon name={iconRef} size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteCustom(e, icon)}
                      className="absolute -top-0.5 -right-0.5 hidden group-hover:flex items-center justify-center w-3.5 h-3.5 rounded-full bg-bg-primary border border-border-default text-text-tertiary hover:text-error"
                      title={t('iconPicker.deleteCustomIcon')}
                    >
                      <Trash2 size={9} />
                    </button>
                  </div>
                );
              })}
              {!search && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded border border-dashed border-border-default text-text-tertiary hover:border-accent hover:text-accent transition-colors flex items-center justify-center"
                  title={t('iconPicker.importSvg')}
                >
                  <Upload size={14} />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".svg,image/svg+xml"
              className="hidden"
              onChange={handleImportFile}
            />
          </>
        )}

        {!search && (
          <p className="text-[10px] text-text-tertiary mb-2">{t('iconPicker.popularIcons')}</p>
        )}
        {search && filteredIcons.length === 0 && filteredCustomIcons.length === 0 ? (
          <p className="text-xs text-text-tertiary text-center py-4">
            {t('iconPicker.noIconFound')}
          </p>
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {filteredIcons.slice(0, 64).map((iconName) => {
              const IconComponent = getIconComponent(iconName);
              if (!IconComponent) return null;

              const isSelected = value === iconName;

              return (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => onSelect(iconName)}
                  className={`p-2 rounded hover:bg-bg-secondary transition-colors ${
                    isSelected ? 'bg-accent/20 text-accent' : 'text-text-secondary'
                  }`}
                  title={iconName}
                >
                  <IconComponent size={16} />
                </button>
              );
            })}
          </div>
        )}
        {filteredIcons.length > 64 && (
          <p className="text-[10px] text-text-tertiary text-center mt-2">
            {t('iconPicker.moreIconsRefine', { count: filteredIcons.length - 64 })}
          </p>
        )}
      </div>
    </>
  );
}

interface IconPickerProps {
  value: string | null;
  onChange: (iconName: string | null) => void;
  placeholder?: string;
}

export function IconPicker({ value, onChange, placeholder }: IconPickerProps) {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const placeholderText = placeholder || t('iconPicker.placeholder');

  const customIconsMap = useCustomIconStore((state) => state.icons);

  const handleSelect = useCallback((iconName: string) => {
    onChange(iconName);
    setIsOpen(false);
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange(null);
    setIsOpen(false);
  }, [onChange]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Display name for the selected icon (custom icons show their user-given name)
  const selectedLabel = useMemo(() => {
    if (!value) return null;
    if (isCustomIconName(value)) {
      const icon = customIconsMap.get(value.slice(CUSTOM_ICON_PREFIX.length));
      return icon?.name ?? null;
    }
    return value;
  }, [value, customIconsMap]);

  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent text-text-primary flex items-center gap-2 hover:bg-bg-tertiary transition-colors"
      >
        {value && selectedLabel !== null ? (
          <>
            <ResolvedIcon name={value} size={16} className="text-text-secondary" />
            <span className="flex-1 text-left truncate">{selectedLabel}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="p-0.5 hover:bg-bg-tertiary rounded"
            >
              <X size={14} className="text-text-tertiary" />
            </button>
          </>
        ) : (
          <span className="flex-1 text-left text-text-tertiary">{placeholderText}</span>
        )}
      </button>

      <DropdownPortal
        anchorRef={buttonRef}
        isOpen={isOpen}
        onClose={handleClose}
        className="w-72"
      >
        <IconDropdownContent value={value} onSelect={handleSelect} />
      </DropdownPortal>
    </div>
  );
}

// Compact version for inline use (just shows the icon button)
interface IconPickerCompactProps {
  value: string | null;
  onChange: (iconName: string | null) => void;
}

export function IconPickerCompact({ value, onChange }: IconPickerCompactProps) {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleSelect = useCallback((iconName: string) => {
    onChange(iconName);
    setIsOpen(false);
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange(null);
    setIsOpen(false);
  }, [onChange]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-7 h-7 flex items-center justify-center border rounded transition-colors ${
          value
            ? 'bg-bg-secondary border-border-default text-text-secondary hover:bg-bg-tertiary'
            : 'border-dashed border-border-default text-text-tertiary hover:border-accent hover:text-accent'
        }`}
        title={value ? `${value}` : t('iconPicker.addIcon')}
      >
        {value ? <ResolvedIcon name={value} size={14} /> : <Plus size={12} />}
      </button>

      <DropdownPortal
        anchorRef={buttonRef}
        isOpen={isOpen}
        onClose={handleClose}
        className="w-72"
      >
        <IconDropdownContent
          value={value}
          onSelect={handleSelect}
          onClear={handleClear}
          showClear
        />
      </DropdownPortal>
    </div>
  );
}
