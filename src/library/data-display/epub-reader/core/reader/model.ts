import type { ReaderAccessibilityDescription } from '../accessibility';
import type { ReaderMarkStore, ReaderMarkStoreSnapshot } from '../annotations';
import type { ReaderThemeRegistry } from '../appearance';
import type { PublicationDiagnostic, Locator, LocatorRange, Publication, PublicationLayoutProfile, ReaderPreferences, PublicationControlDocumentLimits, WritingMode } from '../publication';
import type { ReaderInputPolicy } from '../input';
import type { ReaderSearchState, SearchOptions, SearchHit } from '../search';
import type { RendererHostState } from '../renderer';
import type { RenditionPlannerPolicy, ViewportMetrics } from '../rendition';
import type { ResourceResolverOptions } from '../resources';
import type { PublicationLinkRouterOptions } from '../navigation';
import type { ReaderNavigationHistorySnapshot } from '../navigation';
import type { ReaderFootnote } from '../navigation';
import type { ReaderSelection, ReaderSelectionActivation } from '../selection';
import type { ReaderImageActivation } from '../media';
import type { OcfCompatibilityMode, OcfZipLimits } from '../archive';
import type { CompatibilityReport } from '../compatibility';

export type BrowserEpubReaderStatus = 'opening' | 'ready' | 'error' | 'disposed';

export type BrowserEpubReaderOpenPhase = 'archive' | 'package' | 'preflight' | 'resources' | 'rendition';

export interface BrowserEpubReaderOpenProgress {
  readonly phase: BrowserEpubReaderOpenPhase;
  readonly label: string;
  /** Number of phases reached, from 1 through total. */
  readonly completed: number;
  /** Total number of phases in the open pipeline. */
  readonly total: number;
}

export interface ReaderMarkActivation {
  readonly mark: import('../annotations').Highlight | import('../annotations').Annotation;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly returnFocus: HTMLElement;
}

export type ReaderUiIntent =
  | { readonly type: 'open-search' }
  | { readonly type: 'open-help' }
  | { readonly type: 'navigation-boundary'; readonly edge: 'start' | 'end' }
  | { readonly type: 'bookmark-added' }
  | { readonly type: 'open-footnote'; readonly footnote: ReaderFootnote; readonly trigger: HTMLElement }
  | { readonly type: 'selection-changed'; readonly activation: ReaderSelectionActivation | null }
  | { readonly type: 'open-mark'; readonly activation: ReaderMarkActivation }
  | { readonly type: 'open-image'; readonly activation: ReaderImageActivation }
  | { readonly type: 'toggle-chrome' }
  | { readonly type: 'escape' };

/**
 * Presentation facts that belong to the publication, not to the active page.
 *
 * The renderer plan is per spine item, so product chrome driven directly by it
 * restyles itself whenever the reader crosses into a differently-rendered page.
 * More than half of real light novels interleave pre-paginated illustration
 * pages with reflowable chapters, so that is a page turn, not an edge case.
 * This snapshot is resolved once per publication and never changes while it is
 * open, which makes it the correct source for toolbar, controls and host chrome.
 */
export interface ReaderPublicationPresentation {
  readonly layout: PublicationLayoutProfile;
  /** Dominant writing mode of the reflowable reading order. */
  readonly writingMode: WritingMode;
  /**
   * `immersive` is the full-bleed treatment for publications that are entirely
   * pre-paginated (comics, art books): overlaid auto-hiding chrome on a dark
   * stage. Every other publication, mixed ones included, uses `standard`.
   */
  readonly chrome: 'standard' | 'immersive';
}

export interface BrowserEpubReaderSnapshot {
  readonly status: BrowserEpubReaderStatus;
  readonly publication: Publication;
  /** Stable for the lifetime of this publication; safe to drive chrome with. */
  readonly presentation: ReaderPublicationPresentation;
  readonly diagnostics: readonly PublicationDiagnostic[];
  readonly compatibility: CompatibilityReport;
  readonly preferences: ReaderPreferences;
  readonly viewport: ViewportMetrics;
  readonly renderer: RendererHostState;
  readonly locator: Locator | null;
  readonly navigationHistory: ReaderNavigationHistorySnapshot;
  readonly search: ReaderSearchState;
  readonly marks: ReaderMarkStoreSnapshot;
  readonly selection: ReaderSelection | null;
  readonly accessibility: ReaderAccessibilityDescription;
  readonly error: unknown | null;
}

export interface BrowserEpubReaderOptions extends PublicationLinkRouterOptions {
  /** Cancels archive loading/preflight when a host replaces or closes a publication. */
  readonly signal?: AbortSignal;
  readonly onOpenProgress?: (progress: BrowserEpubReaderOpenProgress) => void;
  /** `compatible` is the practical-reader default; `strict` rejects recoverable OCF violations. */
  readonly compatibilityMode?: OcfCompatibilityMode;
  readonly preferences?: import('../publication').ReaderPreferencesPatch;
  readonly initialLocator?: Locator;
  readonly initialSpineIndex?: number;
  readonly plannerPolicy?: Partial<Omit<RenditionPlannerPolicy, 'syntheticSpreads'>> & {
    readonly syntheticSpreads?: Partial<RenditionPlannerPolicy['syntheticSpreads']>;
  };
  readonly resourcePolicy?: ResourceResolverOptions;
  readonly archiveLimits?: Partial<OcfZipLimits>;
  readonly controlDocumentLimits?: Partial<PublicationControlDocumentLimits>;
  readonly inputPolicy?: Partial<ReaderInputPolicy>;
  readonly markStore?: ReaderMarkStore;
  readonly themeRegistry?: ReaderThemeRegistry;
  readonly onIntent?: (intent: ReaderUiIntent) => void;
  readonly onDiagnostics?: (diagnostics: readonly PublicationDiagnostic[]) => void;
}

export interface BrowserEpubReaderSearchApi {
  run(query: string, options?: Partial<SearchOptions>): Promise<readonly SearchHit[]>;
  clear(): void;
  goTo(index: number): Promise<SearchHit | null>;
  next(): Promise<SearchHit | null>;
  previous(): Promise<SearchHit | null>;
}

export interface BrowserEpubReaderMarksApi {
  addBookmark(label?: string): ReturnType<import('../annotations').ReaderMarkController['addBookmark']>;
  addHighlight(
    range: LocatorRange,
    highlight?: import('../annotations').AnnotationHighlightStyle,
    color?: import('../annotations').AnnotationColor,
    label?: string,
    tags?: readonly string[],
  ): import('../annotations').Highlight;
  addAnnotation(
    range: LocatorRange,
    body: string,
    highlight?: import('../annotations').AnnotationHighlightStyle,
    color?: import('../annotations').AnnotationColor,
    label?: string,
    tags?: readonly string[],
  ): import('../annotations').Annotation;
  remove(id: string): boolean;
  update(id: string, patch: import('../annotations').ReaderMarkPatch): import('../annotations').ReaderMark | null;
  clear(): void;
  goTo(id: string): Promise<boolean>;
}
