import type { LucideIcon } from 'lucide-react';
import { iconButtons } from './ui';

/** An action shown as its icon alone; its label is read out and shown on hover */
export function IconAction({ icon: Icon, label, onClick, variant = 'secondary', disabled, wide, className = '' }: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  variant?: keyof typeof iconButtons;
  disabled?: boolean;
  /** Fills its grid cell instead of a square */
  wide?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${iconButtons[variant]} ${wide ? 'w-full h-12' : 'w-11 h-11'} ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Icon size={18} />
    </button>
  );
}
