import { useState, useRef, useEffect } from 'react';
import { User } from 'lucide-react';
import { useSyncStore } from '../../stores';

export function LocalUserAvatar() {
  const { localUser, updateLocalUserName } = useSyncStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(localUser.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close on click outside
  useEffect(() => {
    if (!isEditing) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleSave();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, editValue]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== localUser.name) {
      updateLocalUserName(trimmed);
    } else {
      setEditValue(localUser.name);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(localUser.name);
      setIsEditing(false);
    }
  };

  // Get initials (first letter of each word, max 2)
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div ref={containerRef} className="relative">
      {isEditing ? (
        <div className="flex items-center gap-2 bg-bg-secondary border border-border-default rounded px-2 py-1">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0"
            style={{ backgroundColor: localUser.color }}
          >
            {getInitials(editValue || localUser.name)}
          </div>
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className="w-32 px-1 py-0.5 text-sm bg-transparent border-none outline-none text-text-primary"
            placeholder="Votre nom"
          />
        </div>
      ) : (
        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-tertiary transition-colors"
          title={`Vous: ${localUser.name} (cliquer pour modifier)`}
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium"
            style={{ backgroundColor: localUser.color }}
          >
            {getInitials(localUser.name)}
          </div>
          <span className="text-xs text-text-secondary max-w-24 truncate hidden sm:block">
            {localUser.name}
          </span>
        </button>
      )}
    </div>
  );
}
