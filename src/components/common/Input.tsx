import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-text-primary mb-1"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            w-full px-2 py-1.5 text-sm
            border border-border-default sketchy-border
            bg-bg-primary text-text-primary
            placeholder:text-text-tertiary
            focus:outline-none focus:border-accent input-focus-glow
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all
            ${error ? 'border-error focus:border-error' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-error">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
