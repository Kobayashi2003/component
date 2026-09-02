import { useEffect, useId, useRef, type MouseEvent } from 'react';
import { CloseIcon } from '../chrome/reader-icons';
import { externalLinkDetails } from './external-link-model';
import type { ExternalLinkTarget } from '../../core';

interface EpubExternalLinkDialogProps {
  readonly target: ExternalLinkTarget;
  readonly onClose: (restoreFocus?: boolean) => void;
}

export function EpubExternalLinkDialog({ target, onClose }: EpubExternalLinkDialogProps) {
  const details = externalLinkDetails(target);
  const dialogRef = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const instanceId = useId().replaceAll(':', '');
  const titleId = `${instanceId}-external-link-title`;
  const descriptionId = `${instanceId}-external-link-description`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    cancelRef.current?.focus({ preventScroll: true });
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, []);

  const opensNewTab = details.kind === 'website';

  return (
    <div className="epub-reader-external-link-layer" onClick={() => onClose(true)}>
      <aside
        ref={dialogRef}
        className="epub-reader-external-link"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event: MouseEvent<HTMLElement>) => event.stopPropagation()}
      >
        <header>
          <div>
            <span>Leaving the reader</span>
            <strong id={titleId}>{details.title}</strong>
          </div>
          <button type="button" aria-label="Cancel external link" onClick={() => onClose(true)}>
            <CloseIcon />
          </button>
        </header>
        <div className="epub-reader-external-link__body">
          <p id={descriptionId}>This book wants to open a link outside the reader.</p>
          <code title={details.destination}>{details.destination}</code>
          <p className="epub-reader-external-link__hint">
            {opensNewTab ? 'The website will open in a new tab.' : 'Your device will choose the app that handles this link.'}
          </p>
        </div>
        <footer>
          <button ref={cancelRef} type="button" onClick={() => onClose(true)}>Cancel</button>
          <a
            href={details.href}
            target={opensNewTab ? '_blank' : undefined}
            rel={opensNewTab ? 'noopener noreferrer external' : 'external'}
            onClick={() => onClose(true)}
          >
            {details.actionLabel}<span aria-hidden="true"> ↗</span>
          </a>
        </footer>
      </aside>
    </div>
  );
}
