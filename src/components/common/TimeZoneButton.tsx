import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DropdownPortal } from './DropdownPortal';
import { listTimeZones, systemTimeZone, timeZoneCity } from '../../utils/dates';

interface TimeZoneButtonProps {
  /** IANA zone the hours are typed in; undefined = system zone */
  value: string | undefined;
  onChange: (timeZone: string | undefined) => void;
}

const MAX_RESULTS = 60;

/** Discreet zone picker shown next to a time input: "Paris ▾" → searchable list. */
export function TimeZoneButton({ value, onChange }: TimeZoneButtonProps) {
  const { t } = useTranslation('panels');
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const system = systemTimeZone();
  const current = value ?? system;

  const zones = useMemo(() => (isOpen ? listTimeZones() : []), [isOpen]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '_');
    return (q ? zones.filter((z) => z.toLowerCase().includes(q)) : zones).slice(0, MAX_RESULTS);
  }, [zones, query]);

  const pick = (zone: string | undefined) => {
    onChange(zone === system ? undefined : zone);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className={`shrink-0 px-1 text-[10px] rounded hover:bg-bg-tertiary ${value ? 'text-accent' : 'text-text-tertiary'}`}
        title={`${t('detail.timeZone.title')} : ${current}`}
      >
        {timeZoneCity(current)}
      </button>
      <DropdownPortal anchorRef={anchorRef} isOpen={isOpen} onClose={() => { setIsOpen(false); setQuery(''); }} className="w-56">
        <div className="p-1.5 border-b border-border-default">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('detail.timeZone.search')}
            className="w-full px-2 py-1 text-xs rounded border border-border-default bg-bg-primary text-text-primary focus:outline-none focus:border-accent"
          />
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          <button
            type="button"
            onClick={() => pick(undefined)}
            className={`w-full px-2 py-1 text-left text-xs hover:bg-bg-secondary ${!value ? 'text-accent' : 'text-text-primary'}`}
          >
            {t('detail.timeZone.system', { city: timeZoneCity(system) })}
          </button>
          {matches.map((zone) => (
            <button
              key={zone}
              type="button"
              onClick={() => pick(zone)}
              className={`w-full px-2 py-1 text-left text-xs hover:bg-bg-secondary ${zone === value ? 'text-accent' : 'text-text-primary'}`}
            >
              {zone.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </DropdownPortal>
    </>
  );
}
