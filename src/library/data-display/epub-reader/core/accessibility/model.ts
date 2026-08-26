import type { Locator } from '../publication';
import type { RendererLayoutSnapshot } from '../renderer';

export interface ReaderAccessibilityDescription {
  readonly locator: Locator | null;
  readonly chapter?: string;
  readonly page?: string;
  readonly progress?: string;
  readonly announcement: string;
}

export interface ReaderAccessibilityInput {
  readonly locator: Locator | null;
  readonly layout: RendererLayoutSnapshot | null;
}
