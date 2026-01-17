import { useState, useRef, useEffect, type ReactNode } from 'react';

interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
}

export function DropdownMenu({ trigger, children, align = 'right' }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div
          className={`
            absolute z-10 mt-1
            min-w-[160px]
            bg-bg-primary border border-border-default sketchy-border-soft panel-shadow
            py-1
            ${align === 'right' ? 'right-0' : 'left-0'}
          `}
        >
          <div onClick={() => setIsOpen(false)}>{children}</div>
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  onClick?: () => void;
  destructive?: boolean;
  children: ReactNode;
}

export function DropdownItem({ onClick, destructive, children }: DropdownItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full px-3 py-1.5 text-sm text-left
        hover:bg-bg-tertiary
        ${destructive ? 'text-error' : 'text-text-primary'}
      `}
    >
      {children}
    </button>
  );
}
