import { useOptionalEpubReaderContext } from '../reader/context';
import type { Annotation, Highlight } from '../../core';
import type { EpubReaderHandle } from '../state/model';
import { groupMarksByChapter } from './panel-model';
import { ReaderToolIcon } from '../chrome/reader-icons';
import type { MouseEvent } from 'react';

interface EpubMarksPanelProps {
  readonly reader?: EpubReaderHandle;
  readonly onEditMark?: (mark: Highlight | Annotation, trigger: HTMLButtonElement) => void;
}

export function EpubMarksPanel({ reader: explicit, onEditMark }: EpubMarksPanelProps) {
  const contextual = useOptionalEpubReaderContext();
  const reader = explicit ?? contextual;
  if (!reader) throw new Error('<EpubMarksPanel> requires a reader prop or EpubReaderProvider.');
  const snapshot = reader.state.reader;
  const marks = snapshot?.marks.marks ?? [];
  const toc = snapshot?.publication.navigation.toc ?? [];
  const groups = groupMarksByChapter(marks, toc);
  return (
    <section className="epub-reader-panel epub-marks-panel" aria-label="Bookmarks and annotations">
      <div className="epub-marks-panel__actions">
        <button type="button" onClick={() => void reader.marks.addBookmark()}>
          <ReaderToolIcon id="marks" />
          <span>Bookmark page</span>
        </button>
      </div>
      {marks.length === 0 ? (
        <div className="epub-reader-panel__empty epub-marks-panel__empty">
          <ReaderToolIcon id="marks" />
          <strong>No saved marks</strong>
          <span>Select text in the book to highlight or add a note.</span>
        </div>
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
              {group.marks.map(mark => (
                <li key={mark.id} data-mark-kind={mark.kind}>
                  <button type="button" onClick={() => void reader.marks.goTo(mark.id)}>
                    <small>{mark.kind}</small>
                    <span>{mark.label ?? (mark.kind === 'annotation' ? mark.body : mark.kind === 'highlight' ? 'Highlighted passage' : `Saved position ${Math.round((mark.locator.locations.progression ?? 0) * 100)}%`)}</span>
                  </button>
                  {mark.kind !== 'bookmark' && onEditMark ? (
                    <button type="button" onClick={(event: MouseEvent<HTMLButtonElement>) => onEditMark(mark, event.currentTarget)} aria-label={`Edit ${mark.kind} from ${group.chapter.label}`}>Edit</button>
                  ) : null}
                  <button type="button" onClick={() => reader.marks.remove(mark.id)} aria-label={`Remove ${mark.kind} from ${group.chapter.label}`}>×</button>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}
