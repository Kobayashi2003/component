import { useMemo, useState } from 'react';
import type { ReaderMark, ReaderMarkKind, TocItem } from '../../core';
import { ReaderToolIcon } from '../chrome/reader-icons';
import { useOptionalEpubReaderContext } from '../reader/context';
import type { EpubReaderHandle } from '../state/model';
import { EpubMarkEditor } from './marks/EpubMarkEditor';
import { filterMarks, groupMarksByChapter, markLocator, markPreview, type MarkFilter } from './panel-model';

const FILTERS: readonly { readonly value: MarkFilter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'bookmark', label: 'Bookmarks' },
  { value: 'highlight', label: 'Highlights' },
  { value: 'annotation', label: 'Notes' },
];
const EMPTY_MARKS: readonly ReaderMark[] = [];
const EMPTY_TOC: readonly TocItem[] = [];

export function EpubMarksPanel({ reader: explicit }: { readonly reader?: EpubReaderHandle }) {
  const contextual = useOptionalEpubReaderContext();
  const reader = explicit ?? contextual;
  if (!reader) throw new Error('<EpubMarksPanel> requires a reader prop or EpubReaderProvider.');
  const snapshot = reader.state.reader;
  const marks = snapshot?.marks.marks ?? EMPTY_MARKS;
  const toc = snapshot?.publication.navigation.toc ?? EMPTY_TOC;
  const [filter, setFilter] = useState<MarkFilter>('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set<string>());
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const visibleMarks = useMemo(() => filterMarks(marks, filter), [filter, marks]);
  const groups = useMemo(() => groupMarksByChapter(visibleMarks, toc), [toc, visibleMarks]);
  const activeSelected = useMemo(() => {
    const available = new Set(marks.map(mark => mark.id));
    return new Set([...selected].filter(id => available.has(id)));
  }, [marks, selected]);

  const chooseFilter = (next: MarkFilter) => {
    setFilter(next);
    setSelected(new Set());
    setSelecting(false);
    setConfirmBatchDelete(false);
  };
  const toggleSelection = (id: string) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmBatchDelete(false);
  };
  const allVisibleSelected = visibleMarks.length > 0 && visibleMarks.every(mark => activeSelected.has(mark.id));
  const toggleAllVisible = () => {
    setSelected(() => {
      const next = new Set(activeSelected);
      if (allVisibleSelected) visibleMarks.forEach(mark => next.delete(mark.id));
      else visibleMarks.forEach(mark => next.add(mark.id));
      return next;
    });
    setConfirmBatchDelete(false);
  };
  const removeSelected = () => {
    if (!confirmBatchDelete) {
      setConfirmBatchDelete(true);
      return;
    }
    reader.marks.removeMany([...activeSelected]);
    setSelected(new Set());
    setSelecting(false);
    setConfirmBatchDelete(false);
  };
  const addBookmark = async () => {
    const bookmark = await reader.marks.addBookmark();
    if (bookmark) setEditingId(bookmark.id);
  };

  return (
    <section className="epub-reader-panel epub-marks-panel" aria-label="Bookmarks and annotations">
      <div className="epub-marks-panel__actions">
        <button type="button" onClick={() => void addBookmark()}>
          <ReaderToolIcon id="marks" />
          <span>Bookmark page</span>
        </button>
        {marks.length > 0 ? (
          <button
            type="button"
            className="is-secondary"
            aria-pressed={selecting}
            onClick={() => {
              setSelecting(value => !value);
              setSelected(new Set());
              setConfirmBatchDelete(false);
              setEditingId(null);
            }}
          >
            {selecting ? 'Done' : 'Select'}
          </button>
        ) : null}
      </div>

      {marks.length > 0 ? (
        <div className="epub-marks-panel__filters" role="group" aria-label="Filter saved marks">
          {FILTERS.map(option => (
            <button key={option.value} type="button" aria-label={`Show ${option.label.toLowerCase()}`} aria-pressed={filter === option.value} onClick={() => chooseFilter(option.value)}>
              <span>{option.label}</span>
              <small>{countMarks(marks, option.value)}</small>
            </button>
          ))}
        </div>
      ) : null}

      {selecting ? (
        <div className="epub-marks-panel__bulk" aria-label="Bulk mark actions">
          <label>
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
            <span>Select visible</span>
          </label>
          <span>{activeSelected.size} selected</span>
          <button type="button" className={confirmBatchDelete ? 'is-confirming' : ''} disabled={activeSelected.size === 0} onClick={removeSelected}>
            {confirmBatchDelete ? `Confirm delete ${activeSelected.size}` : 'Delete'}
          </button>
        </div>
      ) : null}

      {marks.length === 0 ? (
        <div className="epub-reader-panel__empty epub-marks-panel__empty">
          <ReaderToolIcon id="marks" />
          <strong>No saved marks</strong>
          <span>Select text in the book to highlight or add a note.</span>
        </div>
      ) : visibleMarks.length === 0 ? (
        <div className="epub-reader-panel__empty"><strong>No {filterLabel(filter).toLowerCase()}</strong><span>Choose another filter to view saved marks.</span></div>
      ) : null}

      <div className="epub-marks-panel__groups">
        {groups.map(group => (
          <section key={group.key} className="epub-marks-panel__group" aria-labelledby={`marks-${safeId(group.key)}`}>
            <header>
              <div>
                <strong id={`marks-${safeId(group.key)}`}>{group.chapter.label}</strong>
                {group.chapter.path.length > 1 ? <span>{group.chapter.path.slice(0, -1).join(' / ')}</span> : null}
              </div>
              <small>{group.marks.length}</small>
            </header>
            <ol className="epub-marks-panel__list">
              {group.marks.map(mark => {
                const locator = markLocator(mark);
                const editing = editingId === mark.id;
                return (
                  <li key={mark.id} data-mark-kind={mark.kind} className={activeSelected.has(mark.id) ? 'is-selected' : undefined}>
                    <div className={`epub-marks-panel__item${selecting ? ' is-selecting' : ''}`}>
                      {selecting ? (
                        <label className="epub-marks-panel__selector">
                          <input type="checkbox" checked={activeSelected.has(mark.id)} aria-label={`Select ${kindLabel(mark.kind)} from ${group.chapter.label}`} onChange={() => toggleSelection(mark.id)} />
                        </label>
                      ) : null}
                      <button className="epub-marks-panel__location" type="button" onClick={() => void reader.marks.goTo(mark.id)}>
                        <span className="epub-marks-panel__meta">
                          <small>{kindLabel(mark.kind)}</small>
                          {mark.kind !== 'bookmark' ? <i className={`is-${mark.color}`} aria-label={`${mark.color} ${mark.highlight}`} /> : null}
                          <span>{Math.round((locator.locations.progression ?? 0) * 100)}%</span>
                        </span>
                        <strong>{markPreview(mark)}</strong>
                        {mark.kind === 'bookmark' && mark.label ? <span className="epub-marks-panel__note">{mark.label}</span> : null}
                        {mark.kind === 'annotation' ? <span className="epub-marks-panel__note">{mark.body}</span> : null}
                        {mark.tags?.length ? <span className="epub-marks-panel__tags">{mark.tags.map(tag => <em key={tag}>{tag}</em>)}</span> : null}
                      </button>
                      {!selecting ? <button className="epub-marks-panel__edit" type="button" aria-expanded={editing} onClick={() => setEditingId(editing ? null : mark.id)}>Edit</button> : null}
                    </div>
                    {editing ? (
                      <EpubMarkEditor
                        mark={mark}
                        onCancel={() => setEditingId(null)}
                        onDelete={() => { reader.marks.remove(mark.id); setEditingId(null); }}
                        onSave={patch => { reader.marks.update(mark.id, patch); setEditingId(null); }}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}

function countMarks(marks: readonly ReaderMark[], filter: MarkFilter): number {
  return filter === 'all' ? marks.length : marks.filter(mark => mark.kind === filter).length;
}

function kindLabel(kind: ReaderMarkKind): string {
  return kind === 'annotation' ? 'Note' : kind === 'highlight' ? 'Highlight' : 'Bookmark';
}

function filterLabel(filter: MarkFilter): string {
  return FILTERS.find(option => option.value === filter)?.label ?? 'Marks';
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}
