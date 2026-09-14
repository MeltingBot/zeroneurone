import { useMemo } from 'react';
import * as LucideIcons from 'lucide-react';
import { useCustomIconStore } from '../../stores';
import { isCustomIconName, customIconIdFromName } from '../../types';

interface ResolvedIconProps {
  /** Lucide icon name ("User") or custom icon reference ("custom:<id>") */
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders an icon by name from either source:
 * - `custom:<id>` → user-imported SVG (from customIconStore), inlined
 * - anything else → Lucide icon component
 * Renders nothing when the name resolves to no icon.
 */
export function ResolvedIcon({ name, size = 16, className, style }: ResolvedIconProps) {
  const customIcon = useCustomIconStore((state) =>
    isCustomIconName(name) ? state.icons.get(customIconIdFromName(name)) : undefined
  );

  const customMarkup = useMemo(
    () => (customIcon ? { __html: customIcon.svg } : null),
    [customIcon]
  );

  if (isCustomIconName(name)) {
    if (!customMarkup) return null;
    // SVG sanitized at import time (utils/svgIcon.ts); rendered inline so it
    // inherits currentColor exactly like a Lucide icon.
    return (
      <span
        className={className ? `zn-custom-icon ${className}` : 'zn-custom-icon'}
        style={{
          display: 'inline-flex',
          width: size,
          height: size,
          flexShrink: 0,
          ...style,
        }}
        dangerouslySetInnerHTML={customMarkup}
      />
    );
  }

  const LucideIcon = (LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>
  >)[name];
  if (!LucideIcon) return null;
  return <LucideIcon size={size} className={className} style={style} />;
}

/**
 * Non-hook helper: true if the given icon name can currently be resolved
 * (used by list renderers that need to know before rendering).
 */
export function iconNameResolves(name: string | null | undefined): boolean {
  if (!name) return false;
  if (isCustomIconName(name)) {
    return useCustomIconStore.getState().icons.has(customIconIdFromName(name));
  }
  return Boolean((LucideIcons as Record<string, unknown>)[name]);
}
