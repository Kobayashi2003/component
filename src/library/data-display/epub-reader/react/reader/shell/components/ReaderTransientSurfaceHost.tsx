import { useState, type CSSProperties } from 'react';
import { CloseIcon } from '../../../chrome/reader-icons';
import type { ReaderSurface } from '../../../chrome/reader-surface-model';
import { useReaderUiConfiguration } from '../../../configuration/context';
import { ReaderSurfaceRendererSlot } from '../../../surfaces/ReaderSurfaceRendererSlot';
import type { ReaderSurfaceRendererContext } from '../../../surfaces/model';
import { useEpubReaderContext } from '../../context';
import type { ReaderFeedbackController } from '../use-reader-feedback';
import type { ReaderSurfaceController } from '../use-reader-surface-controller';

interface ReaderTransientSurfaceHostProps {
  readonly surface: ReaderSurface;
  readonly instanceId: string;
  readonly compactLayout: boolean;
  readonly closing: boolean;
  readonly footnoteRef: ReaderSurfaceController['footnoteRef'];
  readonly onClose: ReaderSurfaceController['close'];
  readonly showFeedback: ReaderFeedbackController['show'];
}

/** Selects content providers while retaining each transient surface's fixed Shell frame. */
export function ReaderTransientSurfaceHost(props: ReaderTransientSurfaceHostProps) {
  if (props.surface.kind === 'footnote') return <FootnoteSurfaceFrame {...props} surface={props.surface} />;
  if (props.surface.kind === 'selection') return <SelectionSurfaceFrame {...props} surface={props.surface} />;
  if (props.surface.kind === 'mark') return <MarkSurfaceFrame {...props} surface={props.surface} />;
  return null;
}

type FrameProps<K extends 'footnote' | 'selection' | 'mark'> = Omit<ReaderTransientSurfaceHostProps, 'surface'> & {
  readonly surface: Extract<ReaderSurface, { readonly kind: K }>;
};

function FootnoteSurfaceFrame({
  surface,
  instanceId,
  compactLayout,
  closing,
  footnoteRef,
  onClose,
  showFeedback,
}: FrameProps<'footnote'>) {
  const reader = useEpubReaderContext();
  const { messages, surfaceRendererRegistry } = useReaderUiConfiguration();
  const renderer = surfaceRendererRegistry.resolve('footnote');
  if (!renderer) return null;
  const context: ReaderSurfaceRendererContext<'footnote'> = {
    surface,
    reader,
    close: onClose,
    showFeedback: (message, tone) => showFeedback({ message, tone }),
  };
  return (
    <aside
      ref={footnoteRef}
      className={`epub-reader-footnote${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal={compactLayout ? 'true' : 'false'}
      aria-labelledby={`${instanceId}-footnote-title`}
      aria-describedby={`${instanceId}-footnote-content`}
    >
      <header>
        <div>
          <span>{surface.footnote.label}</span>
          <strong id={`${instanceId}-footnote-title`}>{surface.footnote.title}</strong>
        </div>
        <button type="button" onClick={() => onClose()} aria-label={messages.closeFootnote}>
          <CloseIcon />
        </button>
      </header>
      <div id={`${instanceId}-footnote-content`} className="epub-reader-footnote__content">
        <ReaderSurfaceRendererSlot
          renderer={renderer}
          context={context}
          resetKey={surface.footnote.href}
          fallback={<p role="alert">{messages.actionFailed}</p>}
        />
      </div>
      <footer>
        <button
          type="button"
          onClick={() => {
            onClose(false);
            void reader.goTo({ kind: 'href', href: surface.footnote.href });
          }}
        >
          {messages.openNoteLocation}
        </button>
      </footer>
    </aside>
  );
}

function SelectionSurfaceFrame({ surface, onClose, showFeedback }: FrameProps<'selection'>) {
  const reader = useEpubReaderContext();
  const { messages, surfaceRendererRegistry } = useReaderUiConfiguration();
  const [mode, setMode] = useState<'toolbar' | 'dialog'>('toolbar');
  const renderer = surfaceRendererRegistry.resolve('selection');
  if (!renderer) return null;
  const { anchor } = surface.activation;
  const below = anchor.top < 92;
  const style = {
    '--epub-selection-x': `${(anchor.left + anchor.right) / 2}px`,
    '--epub-selection-y': `${below ? anchor.bottom + 10 : anchor.top - 10}px`,
  } as CSSProperties;
  const context: ReaderSurfaceRendererContext<'selection'> = {
    surface,
    reader,
    close: onClose,
    showFeedback: (message, tone) => showFeedback({ message, tone }),
    setMode,
    showSaved: kind => showFeedback({
      message: kind === 'highlight' ? messages.highlightSaved : messages.noteSaved,
      tone: 'success',
    }),
  };
  return (
    <aside
      className={`epub-reader-selection-tool${below ? ' is-below' : ''}${mode === 'dialog' ? ' is-editing' : ''}`}
      style={style}
      role={mode}
      aria-label={mode === 'dialog' ? 'Add note to selection' : 'Text selection actions'}
    >
      <ReaderSurfaceRendererSlot
        renderer={renderer}
        context={context}
        resetKey={`${anchor.left}:${anchor.top}:${surface.activation.selection.text}`}
        fallback={<button type="button" onClick={() => onClose(true)}>{messages.actionFailed}</button>}
      />
    </aside>
  );
}

function MarkSurfaceFrame({ surface, onClose, showFeedback }: FrameProps<'mark'>) {
  const reader = useEpubReaderContext();
  const { messages, surfaceRendererRegistry } = useReaderUiConfiguration();
  const renderer = surfaceRendererRegistry.resolve('mark');
  if (!renderer) return null;
  const { activation } = surface;
  const context: ReaderSurfaceRendererContext<'mark'> = {
    surface,
    reader,
    close: onClose,
    showFeedback: (message, tone) => showFeedback({ message, tone }),
  };
  const style = {
    '--epub-mark-x': `${activation.anchor.x}px`,
    '--epub-mark-y': `${activation.anchor.y}px`,
  } as CSSProperties;
  return (
    <aside
      className="epub-reader-mark-popover"
      style={style}
      role="dialog"
      aria-modal="false"
      aria-label={activation.mark.kind === 'annotation' ? 'Edit note' : 'Edit highlight'}
    >
      <ReaderSurfaceRendererSlot
        renderer={renderer}
        context={context}
        resetKey={activation.mark.id}
        fallback={<button type="button" onClick={() => onClose(true)}>{messages.actionFailed}</button>}
      />
    </aside>
  );
}
