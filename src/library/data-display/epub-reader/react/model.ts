import type { CSSProperties, RefCallback } from 'react';
import type {
  BrowserEpubReaderOptions,
  BrowserEpubReaderSnapshot,
  Locator,
  LocatorRange,
  NavigationTarget,
  ReaderPreferences,
  SearchHit,
  SearchOptions,
} from '../core';
import type { ReadingSessionOptions } from './reading-session';

export type EpubSource = Uint8Array | ArrayBuffer | Blob;

export type ReactEpubReaderStatus = 'idle' | 'loading' | 'ready' | 'error' | 'disposed';

export interface ReactEpubReaderSnapshot {
  readonly status: ReactEpubReaderStatus;
  readonly reader: BrowserEpubReaderSnapshot | null;
  readonly diagnostics: readonly import('../core').PublicationDiagnostic[];
  readonly error: unknown | null;
  readonly openProgress?: import('../core').BrowserEpubReaderOpenProgress;
}

export interface UseEpubReaderOptions extends BrowserEpubReaderOptions {
  /** Called after the core reader is fully opened and its first locator committed. */
  readonly onReady?: (snapshot: BrowserEpubReaderSnapshot) => void;
  readonly onError?: (error: unknown) => void;
  /** Persist the last locator and preferences locally; pass false to disable. */
  readonly readingSession?: false | ReadingSessionOptions;
}

export interface EpubReaderHandle {
  readonly state: ReactEpubReaderSnapshot;
  readonly viewportRef: RefCallback<HTMLDivElement>;
  retry(): Promise<void>;
  next(): Promise<import('../core').ReaderNavigationResult>;
  previous(): Promise<import('../core').ReaderNavigationResult>;
  goTo(target: NavigationTarget): Promise<Locator | null>;
  goToLocator(locator: Locator): Promise<Locator | null>;
  history: {
    back(): Promise<Locator | null>;
    forward(): Promise<Locator | null>;
  };
  setPreferences(patch: Partial<ReaderPreferences>): Promise<void>;
  captureLocator(): Promise<Locator | null>;
  registerTheme(theme: import('../core').ReaderThemeDefinition): void;
  captureSelection(): import('../core').ReaderSelection | null;
  clearSelection(): void;
  clearReadingSession(): void;
  addHighlightFromSelection(
    highlight?: import('../core').AnnotationHighlightStyle,
    color?: import('../core').AnnotationColor,
  ): Promise<import('../core').Highlight | null>;
  search: {
    run(query: string, options?: Partial<SearchOptions>): Promise<readonly SearchHit[]>;
    clear(): void;
    goTo(index: number): Promise<SearchHit | null>;
    next(): Promise<SearchHit | null>;
    previous(): Promise<SearchHit | null>;
  };
  marks: {
    addBookmark(label?: string): ReturnType<import('../core').ReaderMarkController['addBookmark']>;
    addHighlight(
      range: LocatorRange,
      highlight?: import('../core').AnnotationHighlightStyle,
      color?: import('../core').AnnotationColor,
      label?: string,
      tags?: readonly string[],
    ): import('../core').Highlight;
    addAnnotation(
      range: LocatorRange,
      body: string,
      highlight?: import('../core').AnnotationHighlightStyle,
      color?: import('../core').AnnotationColor,
      label?: string,
      tags?: readonly string[],
    ): import('../core').Annotation;
    remove(id: string): boolean;
    update(id: string, patch: import('../core').ReaderMarkPatch): import('../core').ReaderMark | null;
    clear(): void;
    goTo(id: string): Promise<boolean>;
  };
}

export interface EpubViewportProps {
  /** Declared explicitly: the local React type contract has no intrinsic key. */
  readonly key?: string;
  readonly reader?: EpubReaderHandle;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly ariaLabel?: string;
  readonly ariaDescribedBy?: string;
  /**
   * The reader binds its keyboard, pointer and wheel handling to this element,
   * so it has to be the element that takes focus as well. Give it an id and a
   * tabIndex here rather than wrapping it in a focusable parent: key events
   * bubble upward, so a parent that holds focus never reaches these handlers
   * and the arrow keys do nothing.
   */
  readonly id?: string;
  readonly tabIndex?: number;
  readonly children?: import('react').ReactNode;
}
