import type { ReaderTheme } from '../publication';
import type { ReaderThemeDefinition, ReaderThemeResolver } from './model';

export const BUILTIN_READER_THEMES: readonly ReaderThemeDefinition[] = Object.freeze([
  Object.freeze({ id: 'publisher' as const }),
  Object.freeze({ id: 'light' as const, foreground: '#1a1a1a', background: '#ffffff', link: '#1a73e8', colorScheme: 'light' as const }),
  Object.freeze({ id: 'dark' as const, foreground: '#e8e8e8', background: '#161616', link: '#8ab4f8', colorScheme: 'dark' as const, forceTextColor: true }),
  Object.freeze({ id: 'sepia' as const, foreground: '#2b2118', background: '#f4ecd8', link: '#7a4f2a', colorScheme: 'light' as const }),
  Object.freeze({ id: 'paper', foreground: '#29251f', background: '#f7f1e3', link: '#765334', colorScheme: 'light' as const }),
  Object.freeze({ id: 'mist', foreground: '#253038', background: '#edf2f5', link: '#386b82', colorScheme: 'light' as const }),
  Object.freeze({ id: 'graphite', foreground: '#e5e8eb', background: '#202329', link: '#91b9d0', colorScheme: 'dark' as const, forceTextColor: true }),
]);

export class ReaderThemeRegistry implements ReaderThemeResolver {
  private readonly themes = new Map<string, ReaderThemeDefinition>();

  constructor(themes: readonly ReaderThemeDefinition[] = BUILTIN_READER_THEMES) {
    for (const theme of themes) this.register(theme);
  }

  register(theme: ReaderThemeDefinition): void {
    if (!theme.id.trim()) throw new Error('Reader theme id must not be empty.');
    this.themes.set(theme.id, Object.freeze({ ...theme }));
  }

  unregister(id: ReaderTheme): boolean {
    if (id === 'publisher') return false;
    return this.themes.delete(id);
  }

  resolve(id: ReaderTheme): ReaderThemeDefinition | null {
    return this.themes.get(id) ?? null;
  }

  list(): readonly ReaderThemeDefinition[] {
    return [...this.themes.values()];
  }
}
