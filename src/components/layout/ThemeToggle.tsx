import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { applyColorScheme, useThemeStore, type ColorScheme } from '@/store/themeStore';

const OPTIONS: { value: ColorScheme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/**
 * Three-state colour scheme switch, in the sidebar footer.
 *
 * `system` is a distinct option rather than the absence of a choice: without it
 * a user who wants to follow the OS has no way back once they have picked.
 *
 * `vertical` is for the collapsed rail. Three segments side by side inside a
 * 76px column leave each button narrower than its own 16px icon, so the row
 * turns into a column rather than shrinking below its hit target.
 */
export function ThemeToggle({ vertical = false }: { vertical?: boolean }) {
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
      className={cn(
        'flex gap-1 rounded-lg bg-sidebar-foreground/10 p-1',
        vertical && 'flex-col',
      )}
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
            'flex flex-1 items-center justify-center rounded-md py-1.5 transition-colors',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-foreground/60',
            scheme === value
              ? 'bg-sidebar-foreground/20 text-sidebar-foreground'
              : 'text-sidebar-foreground/60 hover:text-sidebar-foreground',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
