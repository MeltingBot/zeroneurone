import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DropdownPortalProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
  children: ReactNode;
  className?: string;
  onClose?: () => void;
}

export function DropdownPortal({
  anchorRef,
  isOpen,
  children,
  className = '',
  onClose
}: DropdownPortalProps) {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || !anchorRef.current) return;

    const updatePosition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (rect) {
        setPosition({
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width,
        });
      }
    };

    updatePosition();

    // Update position on scroll/resize
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, anchorRef]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen || !onClose) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // Check if click is inside dropdown
      if (dropdownRef.current?.contains(target)) {
        return;
      }

      // Check if click is inside anchor
      if (anchorRef.current?.contains(target)) {
        return;
      }

      onClose();
    };

    // Use setTimeout to avoid immediate close on the same click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dropdownRef}
      className={`fixed bg-bg-primary border border-border-default rounded shadow-lg z-[9999] ${className}`}
      style={{
        top: position.top,
        left: position.left,
        minWidth: position.width,
      }}
    >
      {children}
    </div>,
    document.body
  );
}
