import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface AccordionSectionProps {
  id: string;
  title: string;
  icon?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: (id: string, isOpen: boolean) => void;
}

export function AccordionSection({
  id,
  title,
  icon,
  badge,
  children,
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onToggle,
}: AccordionSectionProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const handleToggle = useCallback(() => {
    if (isControlled) {
      onToggle?.(id, !isOpen);
    } else {
      setInternalIsOpen(!isOpen);
    }
  }, [id, isOpen, isControlled, onToggle]);

  return (
    <div className="border-b border-border-default last:border-b-0">
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-bg-secondary transition-colors"
      >
        <ChevronDown
          size={14}
          className={`text-text-tertiary transition-transform duration-200 ${
            isOpen ? 'rotate-0' : '-rotate-90'
          }`}
        />
        {icon && <span className="text-text-tertiary">{icon}</span>}
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide flex-1">
          {title}
        </span>
        {badge}
      </button>

      <div
        className={`transition-all duration-200 ${
          isOpen ? 'max-h-[500px] opacity-100 overflow-y-auto' : 'max-h-0 opacity-0 overflow-hidden'
        }`}
      >
        <div className="px-4 pb-4 pt-1">
          {children}
        </div>
      </div>
    </div>
  );
}

interface AccordionProps {
  children: ReactNode;
  /** Allow multiple sections open at once (default: true) */
  multiple?: boolean;
  /** IDs of sections that should be open by default */
  defaultOpenIds?: string[];
}

export function Accordion({
  children,
  multiple = true,
  defaultOpenIds = [],
}: AccordionProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set(defaultOpenIds));

  const handleToggle = useCallback((id: string, isOpen: boolean) => {
    setOpenIds((prev) => {
      const next = new Set(multiple ? prev : []);
      if (isOpen) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, [multiple]);

  // Clone children and pass controlled props
  const enhancedChildren = Array.isArray(children)
    ? children.map((child) => {
        if (child && typeof child === 'object' && 'props' in child) {
          const childId = child.props.id;
          return {
            ...child,
            props: {
              ...child.props,
              isOpen: openIds.has(childId),
              onToggle: handleToggle,
            },
          };
        }
        return child;
      })
    : children;

  return <div className="divide-y divide-border-default">{enhancedChildren}</div>;
}
