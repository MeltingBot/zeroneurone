import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { DropdownPortal } from './DropdownPortal';

// Get all icon names from Lucide (excluding non-icon exports)
const EXCLUDED_EXPORTS = new Set([
  'createLucideIcon',
  'default',
  'icons',
  'createElement',
  'LucideIcon',
  'Icon',
]);

// Build icon list once - filter to get only icon components (not *Icon duplicates)
const ALL_ICONS = Object.keys(LucideIcons)
  .filter(name => {
    // Exclude non-icon exports
    if (EXCLUDED_EXPORTS.has(name)) return false;
    // Exclude *Icon duplicates (keep User, not UserIcon)
    if (name.endsWith('Icon')) return false;
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

interface IconPickerProps {
  value: string | null;
  onChange: (iconName: string | null) => void;
  placeholder?: string;
}

export function IconPicker({ value, onChange, placeholder = 'Choisir une icône...' }: IconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter icons based on search
  const filteredIcons = useMemo(() => {
    if (!search.trim()) {
      return POPULAR_ICONS.filter(name => ALL_ICONS.includes(name));
    }
    const searchLower = search.toLowerCase();
    return ALL_ICONS.filter(name => name.toLowerCase().includes(searchLower));
  }, [search]);

  // Get the icon component for rendering
  const getIconComponent = useCallback((name: string) => {
    return (LucideIcons as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[name];
  }, []);

  const handleSelect = useCallback((iconName: string) => {
    onChange(iconName);
    setIsOpen(false);
    setSearch('');
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange(null);
    setIsOpen(false);
    setSearch('');
  }, [onChange]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch('');
  }, []);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Render selected icon
  const SelectedIcon = value ? getIconComponent(value) : null;

  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border focus:outline-none focus:border-accent text-text-primary flex items-center gap-2 hover:bg-bg-tertiary transition-colors"
      >
        {SelectedIcon ? (
          <>
            <SelectedIcon size={16} className="text-text-secondary" />
            <span className="flex-1 text-left truncate">{value}</span>
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
          <span className="flex-1 text-left text-text-tertiary">{placeholder}</span>
        )}
      </button>

      <DropdownPortal
        anchorRef={buttonRef}
        isOpen={isOpen}
        onClose={handleClose}
        className="w-72"
      >
        {/* Search input */}
        <div className="p-2 border-b border-border-default">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une icône..."
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
            />
          </div>
        </div>

        {/* Icons grid */}
        <div className="p-2 max-h-64 overflow-y-auto">
          {!search && (
            <p className="text-[10px] text-text-tertiary mb-2">Icônes populaires</p>
          )}
          {search && filteredIcons.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">
              Aucune icône trouvée
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
                    onClick={() => handleSelect(iconName)}
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
              +{filteredIcons.length - 64} autres (affinez la recherche)
            </p>
          )}
        </div>
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
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredIcons = useMemo(() => {
    if (!search.trim()) {
      return POPULAR_ICONS.filter(name => ALL_ICONS.includes(name));
    }
    const searchLower = search.toLowerCase();
    return ALL_ICONS.filter(name => name.toLowerCase().includes(searchLower));
  }, [search]);

  const getIconComponent = useCallback((name: string) => {
    return (LucideIcons as Record<string, React.ComponentType<{ size?: number; className?: string }>>)[name];
  }, []);

  const handleSelect = useCallback((iconName: string) => {
    onChange(iconName);
    setIsOpen(false);
    setSearch('');
  }, [onChange]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearch('');
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const SelectedIcon = value ? getIconComponent(value) : null;

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
        title={value ? `Icône: ${value}` : 'Ajouter une icône'}
      >
        {SelectedIcon ? <SelectedIcon size={14} /> : <Plus size={12} />}
      </button>

      <DropdownPortal
        anchorRef={buttonRef}
        isOpen={isOpen}
        onClose={handleClose}
        className="w-72"
      >
        {/* Search input */}
        <div className="p-2 border-b border-border-default">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une icône..."
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-bg-secondary border border-border-default rounded focus:outline-none focus:border-accent text-text-primary placeholder:text-text-tertiary"
            />
          </div>
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setIsOpen(false);
              }}
              className="w-full mt-1 px-2 py-1 text-xs text-text-tertiary hover:text-error hover:bg-bg-secondary rounded transition-colors"
            >
              Supprimer l'icône
            </button>
          )}
        </div>

        {/* Icons grid */}
        <div className="p-2 max-h-64 overflow-y-auto">
          {!search && (
            <p className="text-[10px] text-text-tertiary mb-2">Icônes populaires</p>
          )}
          {search && filteredIcons.length === 0 ? (
            <p className="text-xs text-text-tertiary text-center py-4">
              Aucune icône trouvée
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
                    onClick={() => handleSelect(iconName)}
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
              +{filteredIcons.length - 64} autres
            </p>
          )}
        </div>
      </DropdownPortal>
    </div>
  );
}

// Missing import for compact version
const { Plus } = LucideIcons;
