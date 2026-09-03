import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { applyColorScheme, useThemeStore, type ColorScheme } from '@/store/themeStore';

const OPTIONS: { value: ColorScheme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/**
 * Three-state colour scheme switch, in the page header.
 *
 * `system` is a distinct option rather than the absence of a choice: without it
 * a user who wants to follow the OS has no way back once they have picked.
 *
 * It sat in the rail's footer until the rail was narrowed. A three-segment
 * control is the widest thing a 192px column would have had to hold, and it is
 * a global setting rather than a place to navigate to — so it moved to the
 * header, into the slot the next-module arrow used to occupy. Neutral tokens
 * rather than the `sidebar-*` pair, because it now sits on `bg-surface`.
 */
export function ThemeToggle() {
  const scheme = useThemeStore((s) => s.scheme);
  const setScheme = useThemeStore((s) => s.setScheme);

  const select = (next: ColorScheme) => {
    setScheme(next);
    applyColorScheme(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Colour scheme"
      className="flex gap-0.5 rounded-md border border-input p-0.5"
    >
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={scheme === value}
          onClick={() => select(value)}
          title={label}
          className={cn(
            'flex items-center justify-center rounded px-1.5 py-1 transition-colors',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
            scheme === value
              ? 'bg-surface-sunk text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
