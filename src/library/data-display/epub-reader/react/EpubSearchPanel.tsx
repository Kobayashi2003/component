import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useOptionalEpubReaderContext } from './context';
import type { EpubReaderHandle } from './model';
import { chapterContext } from './panel-model';

export function EpubSearchPanel({ reader: explicit }: { readonly reader?: EpubReaderHandle }) {
  const contextual = useOptionalEpubReaderContext();
  const reader = explicit ?? contextual;
  if (!reader) throw new Error('<EpubSearchPanel> requires a reader prop or EpubReaderProvider.');
  const state = reader.state.reader?.search;
  const publication = reader.state.reader?.publication;
  const [query, setQuery] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void reader.search.run(query);
  };

  return (
    <section className="epub-reader-panel epub-search-panel" aria-label="Find in book">
      <form className="epub-search-panel__form" onSubmit={submit}>
        <input
          type="search"
          value={query}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value)}
          placeholder="Find in book"
          aria-label="Find in book"
        />
        <div className="epub-search-panel__form-actions">
          <button type="submit" disabled={!query.trim() || state?.searching}>Search</button>
          <button type="button" onClick={() => { setQuery(''); reader.search.clear(); }}>Clear</button>
        </div>
      </form>
      {state?.searching ? <p role="status">Searching…</p> : null}
      {state?.error && !state.searching ? <p className="epub-search-panel__summary" role="alert">Search could not be completed.</p> : null}
      {state && !state.searching && state.query && !state.error ? (
        <p className="epub-search-panel__summary" role="status" aria-live="polite">
          {state.hits.length === 0
            ? 'No results found.'
            : state.truncated
              ? `Showing the first ${state.hits.length} results.`
              : `${state.hits.length} result${state.hits.length === 1 ? '' : 's'} found.`}
        </p>
      ) : null}
      {state && !state.searching && state.diagnostics.length > 0 ? <p className="epub-search-panel__summary">Some sections required compatibility recovery or could not be searched.</p> : null}
      {state && state.hits.length > 0 ? (
        <>
          <div className="epub-search-panel__pager">
            <button type="button" aria-label="Previous search result" onClick={() => void reader.search.previous()}>Previous</button>
            <span>{state.index + 1} / {state.hits.length}</span>
            <button type="button" aria-label="Next search result" onClick={() => void reader.search.next()}>Next</button>
          </div>
          <ol className="epub-search-panel__results" aria-label="Search results">
            {state.hits.map((hit, index) => {
              const chapter = chapterContext(publication?.navigation.toc ?? [], hit.href, hit.spineIndex);
              return (
                <li key={hit.id}>
                  <button type="button" aria-current={index === state.index ? 'true' : undefined} onClick={() => void reader.search.goTo(index)}>
                    <span className="epub-search-result__context">
                      <strong>{chapter.label}</strong>
                      <small>{index + 1} · section {hit.spineIndex + 1}</small>
                    </span>
                    <span className="epub-search-result__excerpt">{highlightMatch(hit.excerpt, hit.match)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      ) : null}
    </section>
  );
}

function highlightMatch(excerpt: string, match: string) {
  if (!match) return excerpt;
  const index = excerpt.toLocaleLowerCase().indexOf(match.toLocaleLowerCase());
  if (index < 0) return excerpt;
  return <>{excerpt.slice(0, index)}<mark>{excerpt.slice(index, index + match.length)}</mark>{excerpt.slice(index + match.length)}</>;
}
