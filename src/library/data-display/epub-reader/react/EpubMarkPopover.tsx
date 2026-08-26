import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import type { AnnotationColor, AnnotationHighlightStyle, ReaderMarkActivation } from '../core';
import type { EpubReaderHandle } from './model';

const COLORS: readonly AnnotationColor[] = ['yellow', 'orange', 'pink', 'green', 'blue', 'purple'];
const STYLES: readonly { readonly value: AnnotationHighlightStyle; readonly label: string }[] = [
  { value: 'solid', label: 'Highlight' },
  { value: 'underline', label: 'Underline' },
  { value: 'strikethrough', label: 'Strike through' },
  { value: 'outline', label: 'Outline' },
];

interface EpubMarkPopoverProps {
  readonly activation: ReaderMarkActivation;
  readonly reader: EpubReaderHandle;
  readonly onClose: (restoreFocus?: boolean) => void;
  readonly onChanged: (message: string) => void;
}

export function EpubMarkPopover({ activation, reader, onClose, onChanged }: EpubMarkPopoverProps) {
  const { mark } = activation;
  const [color, setColor] = useState(mark.color);
  const [highlight, setHighlight] = useState(mark.highlight);
  const [body, setBody] = useState(mark.kind === 'annotation' ? mark.body : '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const style = {
    '--epub-mark-x': `${activation.anchor.x}px`,
    '--epub-mark-y': `${activation.anchor.y}px`,
  } as CSSProperties;

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mark.kind === 'annotation' && !body.trim()) return;
    reader.marks.update(mark.id, {
      color,
      highlight,
      ...(mark.kind === 'annotation' ? { body: body.trim() } : {}),
    });
    onChanged(mark.kind === 'annotation' ? 'Note updated' : 'Highlight updated');
    onClose(true);
  };
  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    reader.marks.remove(mark.id);
    onChanged(mark.kind === 'annotation' ? 'Note deleted' : 'Highlight deleted');
    onClose(true);
  };

  return (
    <aside className="epub-reader-mark-popover" style={style} role="dialog" aria-modal="false" aria-label={mark.kind === 'annotation' ? 'Edit note' : 'Edit highlight'}>
      <header>
        <div>
          <strong>{mark.kind === 'annotation' ? 'Edit note' : 'Edit highlight'}</strong>
          <span>{mark.kind === 'annotation' ? 'Update the note and its appearance' : 'Change the saved selection appearance'}</span>
        </div>
        <button ref={closeRef} type="button" aria-label="Close mark details" onClick={() => onClose(true)}>×</button>
      </header>
      <form onSubmit={save}>
        {mark.kind === 'annotation' ? (
          <textarea value={body} maxLength={2_000} rows={4} aria-label="Note text" onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setBody(event.currentTarget.value)} />
        ) : mark.label ? <p className="epub-reader-mark-popover__excerpt">{mark.label}</p> : null}
        <fieldset className="epub-reader-mark-popover__field">
          <legend>Color</legend>
          <div className="epub-reader-mark-popover__colors" role="group" aria-label="Mark color">
            {COLORS.map(candidate => (
              <button
                key={candidate}
                type="button"
                className={`is-${candidate}`}
                aria-label={`${capitalize(candidate)} mark`}
                aria-pressed={color === candidate}
                onClick={() => setColor(candidate)}
              />
            ))}
          </div>
        </fieldset>
        <fieldset className="epub-reader-mark-popover__field">
          <legend>Style</legend>
          <div className="epub-reader-mark-popover__styles">
            {STYLES.map(option => (
              <button
                key={option.value}
                type="button"
                aria-pressed={highlight === option.value}
                onClick={() => setHighlight(option.value)}
              >
                <span className={`is-${option.value}`}>Aa</span>
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
        {confirmDelete ? (
          <div className="epub-reader-mark-popover__delete-confirm" role="alert">
            <span>Delete this {mark.kind === 'annotation' ? 'note' : 'highlight'}?</span>
            <div>
              <button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button type="button" onClick={remove}>Delete</button>
            </div>
          </div>
        ) : (
          <footer>
            <button type="button" onClick={remove}>Delete</button>
            <button type="submit" disabled={mark.kind === 'annotation' && !body.trim()}>Save changes</button>
          </footer>
        )}
      </form>
    </aside>
  );
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
