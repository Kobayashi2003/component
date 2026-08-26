import type { LocatorRange } from '../publication';

export interface ReaderSelection {
  readonly range: LocatorRange;
  readonly text: string;
  readonly collapsed: boolean;
}
