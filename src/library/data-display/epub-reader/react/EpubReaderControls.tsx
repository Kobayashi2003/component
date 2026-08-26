import { useEffect, useState, type ChangeEvent } from 'react';
import type { EpubReaderHandle } from './model';
import { useOptionalEpubReaderContext } from './context';
import { publicationProgress, spineIndexForPublicationProgress } from './controls-model';

export function EpubReaderControls({ reader: explicit }: { readonly reader?: EpubReaderHandle }) {
  const contextual = useOptionalEpubReaderContext();
  const reader = explicit ?? contextual;
  if (!reader) throw new Error('<EpubReaderControls> requires a reader prop or EpubReaderProvider.');
  return <ResolvedEpubReaderControls reader={reader} />;
}

function ResolvedEpubReaderControls({ reader }: { readonly reader: EpubReaderHandle }) {
  const snapshot = reader.state.reader;
  const layout = snapshot?.renderer.layout;
  const page = layout?.currentPage;
  const total = layout?.pageCount;
  const progression = snapshot?.renderer.plan?.pageProgression.value ?? 'ltr';
  const rtl = progression === 'rtl';
  const fixedLayout = snapshot?.renderer.plan?.renderer === 'fixed-layout';
  const spineCount = snapshot?.publication.spine.length ?? 0;
  const spineIndex = snapshot?.locator?.spineIndex ?? 0;
  const resolvedProgress = fixedLayout
    ? publicationProgress(spineIndex, spineCount)
    : snapshot?.locator?.locations.progression ?? layout?.progression ?? 0;
  const progress = Math.round(resolvedProgress * 100);
  const sectionPosition = snapshot?.locator && !fixedLayout
    ? `Section ${snapshot.locator.spineIndex + 1} of ${snapshot.publication.spine.length}`
    : null;
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const seekValue = seekDraft ?? progress;
  useEffect(() => {
    const locator = snapshot?.locator;
    if (!locator || seekDraft == null || seekDraft === progress || reader.state.status !== 'ready') return;
    const timer = setTimeout(() => {
      const targetIndex = fixedLayout
        ? spineIndexForPublicationProgress(seekDraft / 100, spineCount)
        : locator.spineIndex;
      const target = fixedLayout ? snapshot?.publication.spine[targetIndex] : null;
      void reader.goToLocator(fixedLayout && target
        ? { href: target.href, spineIndex: targetIndex, locations: { progression: 0 } }
        : { href: locator.href, spineIndex: locator.spineIndex, locations: { progression: seekDraft / 100 } }
      ).finally(() => setSeekDraft(current => current === seekDraft ? null : current));
    }, 120);
    return () => clearTimeout(timer);
  }, [fixedLayout, progress, reader, seekDraft, snapshot?.locator, snapshot?.publication.spine, spineCount]);
  const status = reader.state.status === 'error'
    ? 'Unavailable'
    : reader.state.status === 'loading' || reader.state.status === 'idle'
      ? 'Opening…'
      : fixedLayout && snapshot?.locator
        ? `${spineIndex + 1} / ${spineCount}`
        : page != null && total != null
        ? `${page} / ${total}`
        : 'Ready';

  return (
    <div className={`epub-reader-controls is-${progression}`} data-page-progression={progression} role="group" aria-label="Reading navigation">
      <button className="epub-reader-controls__nav epub-reader-controls__nav--previous" type="button" aria-keyshortcuts="PageUp Shift+Space" onClick={() => void reader.previous()} disabled={reader.state.status !== 'ready'}>
        {rtl ? <><span>Previous</span><NavIcon direction="right" /></> : <><NavIcon direction="left" /><span>Previous</span></>}
      </button>
      <div className="epub-reader-controls__position">
        <div className="epub-reader-controls__status" aria-live="off">
          <strong>{status}</strong>
          <span aria-hidden={reader.state.status !== 'ready'}>
            {reader.state.status === 'ready' ? [sectionPosition, `${progress}%`].filter(Boolean).join(' · ') : '\u00a0'}
          </span>
        </div>
        <input
          className="epub-reader-controls__seek"
          type="range"
          dir={progression}
          min="0"
          max="100"
          step="1"
          value={seekValue}
          disabled={reader.state.status !== 'ready' || !snapshot?.locator}
          aria-label={fixedLayout ? 'Position in publication' : 'Position in current section'}
          aria-valuetext={`${seekValue}% through ${fixedLayout ? 'publication' : 'section'}`}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const value = Number(event.currentTarget.value);
            setSeekDraft(value);
          }}
        />
      </div>
      <button className="epub-reader-controls__nav epub-reader-controls__nav--next" type="button" aria-keyshortcuts="PageDown Space" onClick={() => void reader.next()} disabled={reader.state.status !== 'ready'}>
        {rtl ? <><NavIcon direction="left" /><span>Next</span></> : <><span>Next</span><NavIcon direction="right" /></>}
      </button>
    </div>
  );
}

function NavIcon({ direction }: { readonly direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction === 'left' ? 'm14.5 6-6 6 6 6' : 'm9.5 6 6 6-6 6'} />
    </svg>
  );
}
