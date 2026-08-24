import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface BaseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: 'sm' | 'md';
}

/**
 * The button holds an icon, so there is no text for a screen reader to
 * announce. One of `aria-label` or `title` is therefore required — the type
 * refuses a nameless icon button. `title` alone is not announced reliably and
 * never appears on touch devices, so it is mirrored into `aria-label` below.
 */
type IconButtonProps = BaseProps &
  ({ 'aria-label': string; title?: string } | { 'aria-label'?: string; title: string });

const sizeStyles = {
  sm: 'p-1',
  md: 'p-1.5',
};

export function IconButton({
  size = 'md',
  className = '',
  children,
  ...props
}: IconButtonProps) {
  const accessibleName = props['aria-label'] ?? props.title;

  return (
    <button
      className={`
        inline-flex items-center justify-center
        text-text-secondary hover:text-text-primary hover:bg-bg-secondary
        sketchy-border
        transition-all
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
      aria-label={accessibleName}
    >
      {children}
    </button>
  );
}
