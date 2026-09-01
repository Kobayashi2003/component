import type { Publication, PublicationDiagnostic } from '../../epub/publication';
import type { SearchDocument, SearchDocumentProvider, SearchHit, SearchOptions, SearchResultSet } from './model';
import { DEFAULT_SEARCH_OPTIONS } from './model';

export class PublicationSearch {
  private readonly documents = new Map<number, Promise<SearchDocument | null>>();

  constructor(
    private readonly publication: Publication,
    private readonly provider: SearchDocumentProvider,
  ) {}

  async search(
    query: string,
    options: Partial<SearchOptions> = {},
    signal: AbortSignal = new AbortController().signal,
  ): Promise<SearchResultSet> {
    const merged = { ...DEFAULT_SEARCH_OPTIONS, ...options };
    const config: SearchOptions = {
      ...merged,
      maxResults: Math.max(0, Math.floor(merged.maxResults)),
      excerptLength: Math.max(24, Math.floor(merged.excerptLength)),
    };
    const needle = query.trim();
    if (!needle) return { query, hits: [], truncated: false, diagnostics: [] };
    const diagnostics: PublicationDiagnostic[] = [];
    const hits: SearchHit[] = [];
    const sentinelLimit = Math.max(1, config.maxResults) + 1;

    for (const item of this.publication.spine) {
      throwIfAborted(signal);
      if (!config.includeNonLinear && !item.linear) continue;
      if (hits.length >= sentinelLimit) break;
      let document: SearchDocument | null;
      try {
        document = await this.loadDocument(item.index);
      } catch (cause) {
        if (isAbort(cause) || signal.aborted) throw cause;
        diagnostics.push({
          code: 'SEARCH_DOCUMENT_LOAD_FAILED',
          severity: 'warning',
          phase: 'feature',
          spineIndex: item.index,
          path: item.path,
          message: `Search skipped unreadable spine item ${item.href}.`,
          cause,
        });
        continue;
      }
      throwIfAborted(signal);
      if (!document || !document.text) continue;
      diagnostics.push(...(document.diagnostics ?? []));
      const remaining = sentinelLimit - hits.length;
      const matches = findMatches(document.text, needle, config, remaining);
      for (const match of matches) {
        const end = match.index + match.value.length;
        hits.push({
          id: `search:${item.index}:${match.index}:${end}`,
          query: needle,
          spineIndex: document.spineIndex,
          href: document.href,
          range: document.locatorRange(match.index, end),
          excerpt: excerptAround(document.text, match.index, end, config.excerptLength),
          match: match.value,
        });
      }
      if (hits.length >= sentinelLimit) break;
    }
    const truncated = hits.length > config.maxResults;
    return { query: needle, hits: truncated ? hits.slice(0, config.maxResults) : hits, truncated, diagnostics };
  }

  private loadDocument(spineIndex: number): Promise<SearchDocument | null> {
    let pending = this.documents.get(spineIndex);
    if (!pending) {
      // Parsing is publication-scoped rather than query-scoped. Let one shared
      // load finish even if a particular query is superseded, then reuse it.
      pending = this.provider.load(spineIndex, new AbortController().signal);
      this.documents.set(spineIndex, pending);
      pending.catch(() => this.documents.delete(spineIndex));
    }
    return pending;
  }
}

interface Match { readonly index: number; readonly value: string }

function findMatches(text: string, query: string, options: SearchOptions, limit: number): Match[] {
  if (limit <= 0) return [];
  const flags = options.caseSensitive ? 'gu' : 'giu';
  const pattern = new RegExp(escapeRegExp(query), flags);
  const out: Match[] = [];
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? -1;
    const value = match[0] ?? '';
    if (index < 0 || !value) continue;
    if (options.wholeWord && !isWholeWord(text, index, index + value.length)) continue;
    out.push({ index, value });
    if (out.length >= limit) break;
  }
  return out;
}

function isWholeWord(text: string, start: number, end: number): boolean {
  const left = start > 0 ? text[start - 1]! : '';
  const right = end < text.length ? text[end]! : '';
  return !isWordCharacter(left) && !isWordCharacter(right);
}

function isWordCharacter(char: string): boolean {
  return char !== '' && /[\p{L}\p{N}\p{M}_]/u.test(char);
}

function excerptAround(text: string, start: number, end: number, maxLength: number): string {
  const extent = Math.max(24, maxLength);
  // A match longer than the excerpt window leaves no room on either side, and a
  // negative lead would start the excerpt part-way through the match itself.
  const before = Math.max(0, Math.floor((extent - (end - start)) / 2));
  const from = Math.max(0, start - before);
  const to = Math.min(text.length, Math.max(end, from + extent));
  const prefix = from > 0 ? '…' : '';
  const suffix = to < text.length ? '…' : '';
  return `${prefix}${text.slice(from, to).replace(/\s+/gu, ' ').trim()}${suffix}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException('Search aborted.', 'AbortError');
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
