import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  size?: 'sm' | 'md';
}

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
    >
      {children}
    </button>
  );
}
