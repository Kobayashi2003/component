import type { ReaderNavigator } from '../navigation';
import type { ReaderSearchState, SearchHit, SearchOptions, SearchResultSet } from './model';
import { PublicationSearch } from './search';

type SearchListener = (state: ReaderSearchState) => void;

export class ReaderSearchController {
  private active: AbortController | null = null;
  private readonly listeners = new Set<SearchListener>();
  private stateValue: ReaderSearchState = {
    query: '', hits: [], index: -1, searching: false, truncated: false, diagnostics: [], error: null,
  };

  constructor(
    private readonly searchEngine: PublicationSearch,
    private readonly navigator: Pick<ReaderNavigator, 'goToLocator'>,
  ) {}

  get state(): ReaderSearchState { return this.stateValue; }

  onChange(listener: SearchListener): () => void {
    this.listeners.add(listener);
    listener(this.stateValue);
    return () => this.listeners.delete(listener);
  }

  async run(query: string, options: Partial<SearchOptions> = {}): Promise<SearchResultSet> {
    this.active?.abort(new DOMException('Superseded search.', 'AbortError'));
    const controller = new AbortController();
    this.active = controller;
    this.setState({ ...this.stateValue, query, searching: true, error: null });
    try {
      const result = await this.searchEngine.search(query, options, controller.signal);
      if (this.active === controller) {
        this.setState({
          query: result.query,
          hits: result.hits,
          index: result.hits.length > 0 ? 0 : -1,
          searching: false,
          truncated: result.truncated,
          diagnostics: result.diagnostics,
          error: null,
        });
      }
      return result;
    } catch (error) {
      if (controller.signal.aborted) {
        return { query: query.trim(), hits: [], truncated: false, diagnostics: [] };
      }
      if (this.active === controller) this.setState({ ...this.stateValue, searching: false, error });
      throw error;
    } finally {
      if (this.active === controller) this.active = null;
    }
  }

  async goToHit(index: number): Promise<SearchHit | null> {
    const hits = this.stateValue.hits;
    if (hits.length === 0) return null;
    const normalized = modulo(index, hits.length);
    const hit = hits[normalized]!;
    await this.navigator.goToLocator(hit.range.start);
    this.setState({ ...this.stateValue, index: normalized });
    return hit;
  }

  next(): Promise<SearchHit | null> { return this.goToHit(this.stateValue.index + 1); }
  previous(): Promise<SearchHit | null> { return this.goToHit(this.stateValue.index - 1); }

  clear(): void {
    this.active?.abort(new DOMException('Search cleared.', 'AbortError'));
    this.active = null;
    this.setState({ query: '', hits: [], index: -1, searching: false, truncated: false, diagnostics: [], error: null });
  }

  dispose(): void {
    this.clear();
    this.listeners.clear();
  }

  private setState(state: ReaderSearchState): void {
    this.stateValue = state;
    for (const listener of this.listeners) listener(state);
  }
}

function modulo(value: number, length: number): number {
  return ((value % length) + length) % length;
}
