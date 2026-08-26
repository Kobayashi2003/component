import { useEffect, useState } from 'react';
import { useOptionalEpubReaderContext } from './context';
import type { EpubReaderHandle } from './model';

const LOADING_VISIBILITY_DELAY_MS = 180;

export function EpubReaderStatus({ reader: explicit }: { readonly reader?: EpubReaderHandle }) {
  const contextual = useOptionalEpubReaderContext();
  const reader = explicit ?? contextual;
  if (!reader) throw new Error('<EpubReaderStatus> requires a reader prop or EpubReaderProvider.');
  const isBusy = reader.state.status === 'loading' || reader.state.status === 'idle';
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    if (!isBusy) {
      // Reset asynchronously so a completed fast open never causes a
      // cascading render from inside the effect itself.
      const reset = setTimeout(() => setShowLoading(false), 0);
      return () => clearTimeout(reset);
    }
    const timer = setTimeout(() => setShowLoading(true), LOADING_VISIBILITY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isBusy]);

  if (isBusy && showLoading) {
    const progress = reader.state.openProgress;
    const percent = progress ? Math.round((progress.completed / Math.max(1, progress.total - 1)) * 100) : 0;
    return (
      <div className="epub-reader-status" role="status">
        <span className="epub-reader-status__loader" aria-hidden="true"><span /></span>
        <strong>{progress?.label ?? 'Loading EPUB…'}</strong>
        <span>{progress ? `${percent}%` : 'Preparing…'}</span>
        <span
          className="epub-reader-status__track"
          role="progressbar"
          aria-label="Opening publication"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        ><span style={{ width: `${percent}%` }} /></span>
      </div>
    );
  }
  if (reader.state.status === 'error') {
    const error = reader.state.error;
    const message = error instanceof Error ? error.message : 'The EPUB could not be opened.';
    return (
      <div className="epub-reader-status" role="alert">
        <strong>Unable to open EPUB</strong>
        <span>{message}</span>
        <button type="button" onClick={() => void reader.retry()}>Try again</button>
      </div>
    );
  }
  return null;
}
