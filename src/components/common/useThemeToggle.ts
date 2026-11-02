import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useUIStore, nextThemePreference, type ThemePreference } from '../../stores/uiStore';

const ICONS: Record<ThemePreference, LucideIcon> = { light: Sun, dark: Moon, system: Monitor };
const LABEL_KEYS: Record<ThemePreference, 'lightMode' | 'darkMode' | 'systemMode'> = {
  light: 'lightMode',
  dark: 'darkMode',
  system: 'systemMode',
};

/** Theme button: the icon and label describe what a click switches to. */
export function useThemeToggle() {
  const themePreference = useUIStore((s) => s.themePreference);
  // Re-render on OS changes too: the next step depends on the shown mode
  useUIStore((s) => s.themeMode);
  const toggle = useUIStore((s) => s.toggleThemeMode);
  const next = nextThemePreference(themePreference);
  return { Icon: ICONS[next], labelKey: LABEL_KEYS[next], toggle };
}
