import type { LocatorRange, PublicationDiagnostic, PublicationHref } from '../publication';

export interface SearchOptions {
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly includeNonLinear: boolean;
  readonly maxResults: number;
  readonly excerptLength: number;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = Object.freeze({
  caseSensitive: false,
  wholeWord: false,
  includeNonLinear: false,
  maxResults: 500,
  excerptLength: 96,
});

export interface SearchDocument {
  readonly spineIndex: number;
  readonly href: PublicationHref;
  readonly text: string;
  locatorRange(startOffset: number, endOffset: number): LocatorRange;
}

export interface SearchDocumentProvider {
  load(spineIndex: number, signal: AbortSignal): Promise<SearchDocument | null>;
}

export interface SearchHit {
  readonly id: string;
  readonly query: string;
  readonly spineIndex: number;
  readonly href: PublicationHref;
  readonly range: LocatorRange;
  readonly excerpt: string;
  readonly match: string;
}

export interface SearchResultSet {
  readonly query: string;
  readonly hits: readonly SearchHit[];
  readonly truncated: boolean;
  readonly diagnostics: readonly PublicationDiagnostic[];
}


export interface ReaderSearchState {
  readonly query: string;
  readonly hits: readonly SearchHit[];
  readonly index: number;
  readonly searching: boolean;
  readonly truncated: boolean;
  readonly diagnostics: readonly PublicationDiagnostic[];
  readonly error: unknown | null;
}
