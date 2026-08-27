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
  // Rendering the next page puts the whole reader back into `loading`, which is
  // the same status as opening a publication from nothing. They are not the
  // same thing to a reader: one is a wait, the other is a page turn that lasts
  // a twentieth of a second. Telling them apart is what keeps the controls from
  // blanking out and the buttons from going dead on every turn.
  const opened = snapshot != null;
  const failed = reader.state.status === 'error';
  const opening = !opened && !failed;
  const interactive = opened && !failed;
  const layout = snapshot?.renderer.layout;
  const page = layout?.currentPage;
  const total = layout?.pageCount;
  const progression = snapshot?.renderer.plan?.pageProgression.value ?? 'ltr';
  const rtl = progression === 'rtl';
  // Publication-scoped, not plan-scoped: a mixed-layout book must not switch the
  // position readout between "page in section" and "page in publication" every
  // time the reader turns into an illustration page.
  const fixedLayout = snapshot?.presentation.layout === 'fixed-layout';
  const spineCount = snapshot?.publication.spine.length ?? 0;
  const spineIndex = snapshot?.locator?.spineIndex ?? 0;
  const resolvedProgress = fixedLayout
    ? publicationProgress(spineIndex, spineCount)
    : snapshot?.locator?.locations.progression ?? layout?.progression ?? 0;
  const progress = Math.round(resolvedProgress * 100);
  // A composed spread shows two sections at once, so name both. Reporting only
  // the active one made every spread look like it had skipped a section.
  const visibleSections = layout?.visibleSpineIndices?.length
    ? [...layout.visibleSpineIndices].sort((a, b) => a - b)
    : snapshot?.locator ? [snapshot.locator.spineIndex] : [];
  const sectionPosition = visibleSections.length && !fixedLayout
    ? visibleSections.length > 1
      ? `Sections ${visibleSections[0]! + 1}–${visibleSections[visibleSections.length - 1]! + 1} of ${spineCount}`
      : `Section ${visibleSections[0]! + 1} of ${spineCount}`
    : null;
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const seekValue = seekDraft ?? progress;
  useEffect(() => {
    const locator = snapshot?.locator;
    if (!locator || seekDraft == null || seekDraft === progress || !interactive) return;
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
  }, [fixedLayout, interactive, progress, reader, seekDraft, snapshot?.locator, snapshot?.publication.spine, spineCount]);
  const status = failed
    ? 'Unavailable'
    : opening
      ? 'Opening…'
      : fixedLayout && snapshot?.locator
        ? `${spineIndex + 1} / ${spineCount}`
        : page != null && total != null
        ? `${page} / ${total}`
        : 'Ready';

  return (
    <div className={`epub-reader-controls is-${progression}`} data-page-progression={progression} role="group" aria-label="Reading navigation">
      <button className="epub-reader-controls__nav epub-reader-controls__nav--previous" type="button" aria-keyshortcuts="PageUp Shift+Space" onClick={() => void reader.previous()} disabled={!interactive}>
        {rtl ? <><span>Previous</span><NavIcon direction="right" /></> : <><NavIcon direction="left" /><span>Previous</span></>}
      </button>
      <div className="epub-reader-controls__position">
        <div className="epub-reader-controls__status" aria-live="off">
          <strong>{status}</strong>
          <span aria-hidden={!opened}>
            {opened ? [sectionPosition, `${progress}%`].filter(Boolean).join(' · ') : '\u00a0'}
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
          disabled={!interactive || !snapshot?.locator}
          aria-label={fixedLayout ? 'Position in publication' : 'Position in current section'}
          aria-valuetext={`${seekValue}% through ${fixedLayout ? 'publication' : 'section'}`}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            const value = Number(event.currentTarget.value);
            setSeekDraft(value);
          }}
        />
      </div>
      <button className="epub-reader-controls__nav epub-reader-controls__nav--next" type="button" aria-keyshortcuts="PageDown Space" onClick={() => void reader.next()} disabled={!interactive}>
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
