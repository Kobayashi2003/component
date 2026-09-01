import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import type { ReaderImageActivation } from '../../core';

interface EpubImageViewerProps {
  readonly activation: ReaderImageActivation;
  readonly onClose: (restoreFocus?: boolean) => void;
}

export function EpubImageViewer({ activation, onClose }: EpubImageViewerProps) {
  const [scale, setScale] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: activation.intrinsicWidth ?? 0, height: activation.intrinsicHeight ?? 0 });
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
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
    closeRef.current?.focus({ preventScroll: true });
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, []);

  const zoom = (delta: number) => setScale(current => clampScale((current ?? 1) + delta));
  const onLoad = (event: ChangeEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
  };
  const imageStyle = scale == null
    ? dimensions.width > 0 && dimensions.height > 0
      ? { width: `${dimensions.width}px`, height: `${dimensions.height}px`, maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' as const }
      : undefined
    : dimensions.width > 0 && dimensions.height > 0
      ? { width: `${Math.round(dimensions.width * scale)}px`, height: `${Math.round(dimensions.height * scale)}px`, maxWidth: 'none', maxHeight: 'none' }
      : { width: `${Math.round(scale * 100)}%`, maxWidth: 'none', maxHeight: 'none' };

  return (
    <aside
      ref={dialogRef}
      className="epub-reader-image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={activation.alt ? `Image: ${activation.alt}` : 'Publication image'}
      onClick={() => onClose(true)}
    >
      <header onClick={(event: MouseEvent<HTMLElement>) => event.stopPropagation()}>
        <div>
          <strong>{activation.caption || activation.alt || 'Publication image'}</strong>
          {dimensions.width > 0 && dimensions.height > 0 ? <span>{dimensions.width} × {dimensions.height}</span> : null}
        </div>
        <button ref={closeRef} type="button" aria-label="Close image viewer" onClick={() => onClose(true)}>×</button>
      </header>
      <div className={`epub-reader-image-viewer__canvas${scale == null ? ' is-fit' : ''}`} onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}>
        <img src={activation.src} alt={activation.alt} draggable="false" style={imageStyle} onLoad={onLoad} />
      </div>
      <footer onClick={(event: MouseEvent<HTMLElement>) => event.stopPropagation()}>
        <button type="button" onClick={() => zoom(-0.25)} aria-label="Zoom out">−</button>
        <output aria-live="polite">{scale == null ? 'Fit' : `${Math.round(scale * 100)}%`}</output>
        <button type="button" onClick={() => zoom(0.25)} aria-label="Zoom in">＋</button>
        <span aria-hidden="true" />
        <button type="button" aria-pressed={scale == null} onClick={() => setScale(null)}>Fit</button>
        <button type="button" aria-label="Show image at actual size" title="Actual size" aria-pressed={scale === 1} onClick={() => setScale(1)}>1:1</button>
      </footer>
    </aside>
  );
}

function clampScale(value: number): number {
  return Math.min(4, Math.max(0.25, value));
}
