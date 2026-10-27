import { Code } from 'lucide-react';
import { submenu, type MenuItem } from './types';

/**
 * "Copy as ▸ Mermaid / DOT" for a selection of several elements. With a
 * single format available, a flat entry carrying its full label.
 */
export function copyAsItem(
  cm: (key: string) => string,
  onCopyAsMermaid?: () => void,
  onCopyAsDot?: () => void,
): MenuItem | null {
  if (onCopyAsMermaid && onCopyAsDot) {
    return submenu('copy-as', cm('copyAs'), Code, [
      { id: 'copy-mermaid', label: 'Mermaid', onSelect: onCopyAsMermaid },
      { id: 'copy-dot', label: 'DOT (Graphviz)', onSelect: onCopyAsDot },
    ]);
  }
  if (onCopyAsMermaid) return { id: 'copy-mermaid', label: cm('copyAsMermaid'), icon: Code, onSelect: onCopyAsMermaid };
  if (onCopyAsDot) return { id: 'copy-dot', label: cm('copyAsDot'), icon: Code, onSelect: onCopyAsDot };
  return null;
}
