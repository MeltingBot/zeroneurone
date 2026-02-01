import { useState, useCallback, useRef, useEffect } from 'react';

interface EditableFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  /** If true, allow empty values to be saved */
  allowEmpty?: boolean;
}

/**
 * Editable text field with explicit edit/read modes.
 *
 * Pattern (like Report sections):
 * - Read mode by default: displays text, click to edit
 * - Edit mode: input field, blur or Enter to validate and save
 * - During editing, external value changes are ignored (no flash)
 * - Save happens only on validation (blur/Enter), not on every keystroke
 */
export function EditableField({
  value,
  onChange,
  placeholder = '',
  className = '',
  inputClassName = '',
  allowEmpty = true,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Track the value we're editing from - used to detect if we should accept external changes
  const editingFromRef = useRef(value);

  // Sync from props ONLY when not editing
  // This prevents flash during typing
  useEffect(() => {
    if (!isEditing) {
      setLocalValue(value);
      editingFromRef.current = value;
    }
  }, [value, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = useCallback(() => {
    if (!isEditing) {
      editingFromRef.current = value;
      setLocalValue(value);
      setIsEditing(true);
    }
  }, [isEditing, value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  }, []);

  const handleValidate = useCallback(() => {
    setIsEditing(false);

    // Only save if value changed
    const trimmedValue = localValue.trim();
    const shouldSave = allowEmpty ? true : trimmedValue !== '';

    if (shouldSave && trimmedValue !== value) {
      onChange(trimmedValue);
    } else if (!shouldSave) {
      // Revert to original if empty not allowed
      setLocalValue(value);
    }
  }, [localValue, value, onChange, allowEmpty]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleValidate();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setLocalValue(value);
      setIsEditing(false);
    }
  }, [handleValidate, value]);

  const handleBlur = useCallback(() => {
    handleValidate();
  }, [handleValidate]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`w-full px-3 py-2 text-sm bg-bg-secondary border border-accent sketchy-border focus:outline-none text-text-primary placeholder:text-text-tertiary transition-all ${inputClassName}`}
      />
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`w-full px-3 py-2 text-sm bg-bg-secondary border border-border-default sketchy-border cursor-text hover:border-border-strong transition-all ${className}`}
    >
      {value || <span className="text-text-tertiary">{placeholder}</span>}
    </div>
  );
}
