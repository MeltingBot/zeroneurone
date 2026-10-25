import { useUIStore } from '../../stores';
import { getThemeAwareColor } from '../../utils/themeColors';

/** A tag's colour, as a dot before its name (the shade the canvas draws) */
export function TagDot({ color }: { color: string | undefined }) {
  const dark = useUIStore((s) => s.themeMode) === 'dark';
  if (!color) return null;
  return (
    <span
      aria-hidden="true"
      className="inline-block w-2 h-2 rounded-full shrink-0 border border-black/15"
      style={{ backgroundColor: getThemeAwareColor(color, dark) }}
    />
  );
}
