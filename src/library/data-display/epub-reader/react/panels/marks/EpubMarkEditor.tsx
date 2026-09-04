import { useState, type ChangeEvent, type FormEvent } from 'react';
import type {
  AnnotationColor,
  AnnotationHighlightStyle,
  ReaderMark,
  ReaderMarkPatch,
} from '../../../core';
import { ANNOTATION_COLORS } from '../../overlays/annotation-colors';

const HIGHLIGHT_STYLES: readonly {
  readonly value: AnnotationHighlightStyle;
  readonly label: string;
}[] = [
  { value: 'solid', label: 'Highlight' },
  { value: 'underline', label: 'Underline' },
  { value: 'strikethrough', label: 'Strike through' },
  { value: 'outline', label: 'Outline' },
];

interface EpubMarkEditorProps {
  readonly mark: ReaderMark;
  readonly onSave: (patch: ReaderMarkPatch) => void;
  readonly onDelete: () => void;
  readonly onCancel: () => void;
}

export function EpubMarkEditor({
  mark,
  onSave,
  onDelete,
  onCancel,
}: EpubMarkEditorProps) {
  const [label, setLabel] = useState(mark.label ?? '');
  const [body, setBody] = useState(mark.kind === 'annotation' ? mark.body : '');
  const [color, setColor] = useState<AnnotationColor>(
    mark.kind === 'bookmark' ? 'yellow' : mark.color,
  );
  const [highlight, setHighlight] = useState<AnnotationHighlightStyle>(
    mark.kind === 'bookmark' ? 'solid' : mark.highlight,
  );
  const [tags, setTags] = useState(mark.tags?.join(', ') ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mark.kind === 'annotation' && !body.trim()) return;
    onSave({
      label: label.trim(),
      tags: parseTags(tags),
      ...(mark.kind === 'bookmark' ? {} : { color, highlight }),
      ...(mark.kind === 'annotation' ? { body: body.trim() } : {}),
    });
  };

  return (
    <form
      className="epub-mark-editor"
      aria-label={`Edit ${mark.kind}`}
      onSubmit={submit}
    >
      {mark.kind === 'annotation' ? (
        <label>
          <span>Note</span>
          <textarea
            value={body}
            rows={4}
            maxLength={2_000}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              setBody(event.currentTarget.value)
            }
          />
        </label>
      ) : (
        <label>
          <span>
            {mark.kind === 'bookmark' ? 'Bookmark note' : 'Highlight label'}
          </span>
          <textarea
            value={label}
            rows={3}
            maxLength={500}
            placeholder={
              mark.kind === 'bookmark'
                ? 'Add a note about this place'
                : 'Add a label'
            }
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              setLabel(event.currentTarget.value)
            }
          />
        </label>
      )}

      {mark.kind !== 'bookmark' ? (
        <>
          <fieldset>
            <legend>Color</legend>
            <div
              className="epub-mark-editor__colors"
              role="group"
              aria-label="Mark color"
            >
              {ANNOTATION_COLORS.map((candidate) => (
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
          <label>
            <span>Style</span>
            <select
              value={highlight}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setHighlight(
                  event.currentTarget.value as AnnotationHighlightStyle,
                )
              }
            >
              {HIGHLIGHT_STYLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      <label>
        <span>Tags</span>
        <input
          value={tags}
          maxLength={500}
          placeholder="Separate tags with commas"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setTags(event.currentTarget.value)
          }
        />
      </label>

      <footer>
        {confirmDelete ? (
          <div className="epub-mark-editor__confirm" role="alert">
            <span>Delete this {mark.kind}?</span>
            <button type="button" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
            <button type="button" className="is-danger" onClick={onDelete}>
              Delete
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="is-danger-text"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        )}
        <div>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={mark.kind === 'annotation' && !body.trim()}
          >
            Save
          </button>
        </div>
      </footer>
    </form>
  );
}

function parseTags(value: string): readonly string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
