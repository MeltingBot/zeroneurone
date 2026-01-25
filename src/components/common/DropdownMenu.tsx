import { useState, useRef, useEffect, useCallback, Children, cloneElement, isValidElement, type ReactNode, type ReactElement, type KeyboardEvent } from 'react';

interface DropdownMenuProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
  direction?: 'down' | 'up';
}

export function DropdownMenu({ trigger, children, align = 'right', direction = 'down' }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);

  // Get array of menu item children
  const menuItems = Children.toArray(children).filter(isValidElement) as ReactElement[];

  // Close menu and reset focus
  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
  }, []);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, closeMenu]);

  // Focus the menu item at the given index
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && menuListRef.current) {
      const items = menuListRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]');
      items[focusedIndex]?.focus();
    }
  }, [focusedIndex, isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) {
      // Open menu on Enter, Space, or ArrowDown when trigger is focused
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
        setFocusedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        closeMenu();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % menuItems.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + menuItems.length) % menuItems.length);
        break;
      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setFocusedIndex(menuItems.length - 1);
        break;
      case 'Tab':
        closeMenu();
        break;
    }
  }, [isOpen, menuItems.length, closeMenu]);

  const handleTriggerClick = useCallback(() => {
    if (isOpen) {
      closeMenu();
    } else {
      setIsOpen(true);
      setFocusedIndex(0);
    }
  }, [isOpen, closeMenu]);

  // Clone children to inject onClose callback
  const enhancedChildren = Children.map(children, (child, index) => {
    if (isValidElement(child)) {
      return cloneElement(child as ReactElement<{ onMenuClose?: () => void; tabIndex?: number }>, {
        onMenuClose: closeMenu,
        tabIndex: focusedIndex === index ? 0 : -1,
      });
    }
    return child;
  });

  return (
    <div className="relative" ref={menuRef} onKeyDown={handleKeyDown}>
      <div onClick={handleTriggerClick} aria-haspopup="menu" aria-expanded={isOpen}>
        {trigger}
      </div>
      {isOpen && (
        <div
          ref={menuListRef}
          role="menu"
          aria-orientation="vertical"
          className={`
            absolute z-[1000]
            min-w-[160px]
            bg-bg-primary border border-border-default sketchy-border-soft panel-shadow
            py-1
            ${align === 'right' ? 'right-0' : 'left-0'}
            ${direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}
          `}
        >
          {enhancedChildren}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  onClick?: () => void;
  onMenuClose?: () => void;
  destructive?: boolean;
  children: ReactNode;
  'data-testid'?: string;
  tabIndex?: number;
}

export function DropdownItem({ onClick, onMenuClose, destructive, children, 'data-testid': testId, tabIndex = -1 }: DropdownItemProps) {
  const handleClick = () => {
    onClick?.();
    onMenuClose?.();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <button
      role="menuitem"
      tabIndex={tabIndex}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-testid={testId}
      className={`
        w-full px-3 py-1.5 text-sm text-left
        hover:bg-bg-tertiary focus:bg-bg-tertiary focus:outline-none
        ${destructive ? 'text-error' : 'text-text-primary'}
      `}
    >
      {children}
    </button>
  );
}
