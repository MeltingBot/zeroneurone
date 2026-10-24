import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useDossierStore, useTagSetStore } from '../../stores';

interface TagComboboxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
  /** A typed name not in the list is offered for creation (default); off for a filter */
  allowNew?: boolean;
  /** Called once the value is settled: an option picked, Enter, or leaving the field */
  onPick?: (value: string) => void;
  /** Tags offered instead of every tag of the dossier and its families */
  options?: readonly string[];
}

/**
 * One tag, picked among the existing ones (tag families and tags of the open
 * dossier) or typed: a name not in the list is created at import. Opening the
 * list shows every tag; typing filters it.
 */
export function TagCombobox({ value, onChange, placeholder, className = '', 'aria-label': ariaLabel, allowNew = true, onPick, options }: TagComboboxProps) {
  const tagSets = useTagSetStore((s) => s.tagSets);
  const isLoaded = useTagSetStore((s) => s.isLoaded);
  const elements = useDossierStore((s) => s.elements);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoaded) useTagSetStore.getState().load();
  }, [isLoaded]);

  const names = useMemo(() => {
    if (options) return [...options].sort((a, b) => a.localeCompare(b));
    const set = new Set<string>();
    tagSets.forEach((ts) => set.add(ts.name));
    elements.forEach((el) => el.tags.forEach((tag) => set.add(tag)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tagSets, elements, options]);

  const query = value.trim();
  const shown = typed && query ? names.filter((n) => n.toLowerCase().includes(query.toLowerCase())) : names;
  const isNew = allowNew && query !== '' && !names.some((n) => n === query);

  // Close when the focus or a click goes elsewhere
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
    setTyped(false);
    onPick?.(name);
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        value={value}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setTyped(false); }}
        onChange={(e) => { onChange(e.target.value); setTyped(true); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter') { setOpen(false); onPick?.(value.trim()); }
        }}
        onBlur={() => onPick?.(value.trim())}
        className={className}
      />
      {open && (shown.length > 0 || isNew) && (
        <ul
          role="listbox"
          className="absolute z-20 left-0 mt-1 min-w-full max-h-48 overflow-y-auto bg-bg-primary border border-border-default rounded shadow-sm py-1"
        >
          {isNew && (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); pick(query); }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-text-primary cursor-pointer hover:bg-bg-secondary whitespace-nowrap"
            >
              <Plus size={12} className="text-text-tertiary" />
              {query}
            </li>
          )}
          {shown.map((name) => (
            <li
              key={name}
              role="option"
              aria-selected={name === query}
              onMouseDown={(e) => { e.preventDefault(); pick(name); }}
              className={`px-2 py-1 text-xs cursor-pointer hover:bg-bg-secondary whitespace-nowrap ${name === query ? 'text-accent' : 'text-text-primary'}`}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
