import type { ReaderTheme } from '../publication';

export interface ReaderThemeDefinition {
  readonly id: ReaderTheme;
  readonly foreground?: string;
  readonly background?: string;
  readonly link?: string;
  readonly colorScheme?: 'light' | 'dark' | 'normal';
  /** If false, publisher text colors remain unless they inherit from body. */
  readonly forceTextColor?: boolean;
}

export interface ReaderThemeResolver {
  resolve(id: ReaderTheme): ReaderThemeDefinition | null;
}
