import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { EpubContents } from '../panels/EpubContents';
import { EpubCompatibilityPanel } from '../panels/EpubCompatibilityPanel';
import { EpubMarksPanel } from '../panels/EpubMarksPanel';
import { EpubKeyboardHelp } from '../overlays/EpubKeyboardHelp';
import { EpubReaderControls } from '../chrome/EpubReaderControls';
import { EpubReaderFeedback } from '../chrome/EpubReaderFeedback';
import { EpubReaderFullscreenButton } from '../chrome/EpubReaderFullscreen';
import { useEpubReaderFullscreen } from '../chrome/use-epub-reader-fullscreen';
import { EpubReaderStatus } from '../chrome/EpubReaderStatus';
import { EpubReaderProvider } from './context';
import { EpubSearchPanel } from '../panels/EpubSearchPanel';
import { EpubSettingsPanel } from '../panels/EpubSettingsPanel';
import { EpubViewport } from './EpubViewport';
import type { EpubSource, UseEpubReaderOptions } from '../state/model';
import type { ReaderTheme } from '../../core';
import { EpubSelectionToolbar } from '../overlays/EpubSelectionToolbar';
import { EpubMarkPopover } from '../overlays/EpubMarkPopover';
import { EpubImageViewer } from '../overlays/EpubImageViewer';
import { useEpubReader } from '../state/use-epub-reader';
import { feedbackForIntent, type ReaderFeedbackSpec } from '../chrome/feedback-model';
import { useCompactReaderLayout } from '../chrome/responsive';
import { useDelayedFlag, useHeldValue } from '../chrome/loading-delay';
import { surfaceReturnFocus, useReaderSurfaces, type ReaderPanelId, type ReaderSurface } from '../chrome/reader-surfaces';
import { CloseIcon, PinIcon, ReaderToolIcon } from '../chrome/reader-icons';
import { useReaderChrome, type ReaderChromeControls } from '../chrome/use-reader-chrome';
import { shouldLockReaderChrome } from '../chrome/reader-chrome-model';
import { CompactReaderToolsMenu, HistoryButton, PanelButton } from '../chrome/ReaderToolbar';
import { READER_PANELS } from '../chrome/reader-toolbar-model';

/** Reader shell independent of how the host obtains the EPUB source. */
export interface EpubReaderProps {
  readonly source: EpubSource;
  readonly readerOptions?: UseEpubReaderOptions;
  readonly onThemeChange?: (theme: ReaderTheme) => void;
}

export function EpubReader({ source, readerOptions, onThemeChange }: EpubReaderProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const compactLayout = useCompactReaderLayout(shellRef);
  // Panels, footnotes, the selection toolbar, mark popovers and the image
  // viewer are one thing: the surface currently over the page. Holding them as
  // a single value is what makes them mutually exclusive — see reader-surfaces.
  const surfaces = useReaderSurfaces(source);
  const { panel, footnote, selection: selectionTool, mark: activeMark, image: activeImage } = surfaces;
  const [chromeHoverLocked, setChromeHoverLocked] = useState(false);
  const [chromeFocusLocked, setChromeFocusLocked] = useState(false);
  const [feedback, setFeedback] = useState<(ReaderFeedbackSpec & { readonly id: number }) | null>(null);
  const [surfaceClosing, setSurfaceClosing] = useState(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surfaceCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackIdRef = useRef(0);
  const panelRef = useRef<HTMLElement | null>(null);
  const footnoteRef = useRef<HTMLElement | null>(null);
  const buttonRefs = useRef(new Map<ReaderPanelId, HTMLButtonElement>());
  const chromeActionsRef = useRef<Pick<ReaderChromeControls, 'show' | 'toggle'> | null>(null);
  const instanceId = useId().replaceAll(':', '');
  const panelId = `${instanceId}-reader-panel`;
  const panelTitleId = `${instanceId}-reader-panel-title`;
  const compactToolsMenuId = `${instanceId}-reader-tools-menu`;
  const viewportId = `${instanceId}-reader-viewport`;
  const instructionsId = `${instanceId}-reader-instructions`;
  const showFeedback = useCallback((next: ReaderFeedbackSpec) => {
    if (feedbackTimerRef.current != null) clearTimeout(feedbackTimerRef.current);
    setFeedback({ ...next, id: ++feedbackIdRef.current });
    feedbackTimerRef.current = setTimeout(() => {
      feedbackTimerRef.current = null;
      setFeedback(null);
    }, next.tone === 'boundary' ? 1500 : 1800);
  }, []);
  /** Focus whatever raised the surface, or the page itself if it is gone. */
  const restoreFocus = useCallback((target: HTMLElement | null) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const fallback = document.getElementById(viewportId);
        const resolve = () => (target?.isConnected ? target : fallback);
        resolve()?.focus({ preventScroll: true });
        // Browsers drop focus to the body when the element holding it is removed
        // in the same commit, so one retry after layout settles it.
        requestAnimationFrame(() => {
          if (document.activeElement === document.body) resolve()?.focus({ preventScroll: true });
        });
      });
    });
  }, [viewportId]);
  const cancelSurfaceClose = useCallback(() => {
    if (surfaceCloseTimerRef.current != null) clearTimeout(surfaceCloseTimerRef.current);
    surfaceCloseTimerRef.current = null;
    setSurfaceClosing(false);
  }, []);
  const showSurface = useCallback((next: ReaderSurface) => {
    cancelSurfaceClose();
    surfaces.show(next);
  }, [cancelSurfaceClose, surfaces]);
  const closeSurface = useCallback((withFocus = true, focusTarget?: HTMLElement | null) => {
    if (surfaceCloseTimerRef.current != null) return;
    const target = focusTarget ?? surfaceReturnFocus(surfaces.surface);
    const finish = () => {
      surfaceCloseTimerRef.current = null;
      surfaces.close();
      setSurfaceClosing(false);
      if (withFocus) restoreFocus(target);
    };
    if (surfaces.surface.kind !== 'panel' && surfaces.surface.kind !== 'footnote') {
      finish();
      return;
    }
    setSurfaceClosing(true);
    const reducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    surfaceCloseTimerRef.current = setTimeout(finish, reducedMotion ? 0 : 180);
  }, [restoreFocus, surfaces]);
  /** The element to come back to after a surface opened by a keyboard command. */
  const activeElement = useCallback(
    () => (document.activeElement instanceof HTMLElement ? document.activeElement : null),
    [],
  );
  const reader = useEpubReader(source, {
    ...readerOptions,
    // A command that fails mid-read still leaves a readable book, so it is worth
    // a line of feedback rather than a silent no-op.
    onError: error => {
      showFeedback({ message: 'That did not work. Try again.', tone: 'boundary' });
      readerOptions?.onError?.(error);
    },
    onExternalLink: href => {
      if (readerOptions?.onExternalLink) readerOptions.onExternalLink(href);
      else showFeedback({ message: 'External link opening is not enabled.', tone: 'boundary' });
    },
    onUnresolvedPublicationLink: href => {
      showFeedback({ message: 'This book link could not be opened.', tone: 'boundary' });
      readerOptions?.onUnresolvedPublicationLink?.(href);
    },
    onIntent: intent => {
      // Every branch that opens something calls `show`, which replaces whatever
      // was there. Nothing has to remember to close the other four.
      if (intent.type === 'open-search') {
        chromeActionsRef.current?.show();
        showSurface({ kind: 'panel', panel: 'search', returnFocus: activeElement() });
      }
      else if (intent.type === 'open-help') {
        chromeActionsRef.current?.show();
        showSurface({ kind: 'panel', panel: 'help', returnFocus: activeElement() });
      }
      else if (intent.type === 'toggle-chrome') {
        if (!surfaces.open) chromeActionsRef.current?.toggle();
      }
      else if (intent.type === 'open-footnote') {
        chromeActionsRef.current?.show();
        showSurface({ kind: 'footnote', source, footnote: intent.footnote, returnFocus: intent.trigger });
      }
      else if (intent.type === 'selection-changed') {
        if (intent.activation) {
          chromeActionsRef.current?.show();
          showSurface({ kind: 'selection', activation: intent.activation });
        } else if (selectionTool) {
          // Only retract the toolbar; a selection cleared while some other
          // surface is open must not close that one too.
          surfaces.close();
        }
      }
      else if (intent.type === 'open-mark') {
        chromeActionsRef.current?.show();
        showSurface({ kind: 'mark', activation: intent.activation });
      }
      else if (intent.type === 'open-image') {
        chromeActionsRef.current?.show();
        showSurface({ kind: 'image', activation: intent.activation });
      }
      else if (intent.type === 'escape') {
        // The engine already dropped any selection before raising this.
        closeSurface();
      }
      else {
        const nextFeedback = feedbackForIntent(intent);
        if (nextFeedback) showFeedback(nextFeedback);
      }
      readerOptions?.onIntent?.(intent);
    },
  });
  const activePanel = READER_PANELS.find(item => item.id === panel);
  const snapshot = reader.state.reader;
  const compatibility = snapshot?.compatibility.status;
  const title = snapshot?.publication.metadata.title?.trim() || 'Opening publication…';
  // The line under the title. A page turn empties it for a few dozen
  // milliseconds, so hold the previous chapter name across the gap; once the
  // turn settles, report what the new position actually resolves to, which for
  // front matter with no table-of-contents entry is nothing in particular.
  const turning = snapshot != null && reader.state.status !== 'ready';
  const chapterName = useHeldValue(snapshot?.accessibility.chapter?.trim() ?? '', turning);
  const turnIsSlow = useDelayedFlag(turning);
  const chapter = (turnIsSlow ? 'Loading…' : chapterName)
    || (reader.state.status === 'ready' || snapshot ? 'Reading' : 'Preparing your book');
  const plan = snapshot?.renderer.plan;
  // Reader chrome is decided by the publication, never by the page currently on
  // screen. Renderer plans are per spine item, and most light novels interleave
  // pre-paginated illustration pages with reflowable chapters, so a per-page
  // decision restyles the entire interface on an ordinary page turn.
  //
  // The shell therefore carries two families of data attributes:
  //   data-chrome / data-book-layout / data-reading-mode  publication-scoped,
  //     stable for as long as this book is open. Chrome styles use only these.
  //   data-renderer / data-writing-mode / data-page-progression / data-spread
  //     page-scoped. Only content-area styles may use these.
  const presentation = snapshot?.presentation;
  // Chrome is a shell invariant, not an optional consequence of publication
  // loading. Until the package profile is known, use the stable standard shell;
  // a fixed-layout publication may explicitly promote it to immersive once its
  // presentation resolves. Leaving the attribute absent made the same toolbar
  // fall through to its bright base surface during opening, then restyle itself
  // as soon as the snapshot arrived.
  const chromeStyle = presentation?.chrome ?? 'standard';
  const readingMode = presentation?.layout === 'fixed-layout'
    ? 'fixed'
    : presentation && presentation.writingMode !== 'horizontal-tb'
      ? 'text-vertical'
      : 'text-horizontal';
  // Only the publication-opening gap owns chrome visibility. Navigation and
  // preference changes briefly report a non-ready status too, but retain the
  // current snapshot; treating those ordinary transactions as an opening made
  // every fixed-layout page/section turn reveal the controls again.
  const readerChrome = useReaderChrome(shouldLockReaderChrome({
    hasPublicationSnapshot: snapshot != null,
    surfaceOpen: surfaces.open,
    pointerOverChrome: chromeHoverLocked,
    focusInChrome: chromeFocusLocked,
  }));
  const fullscreen = useEpubReaderFullscreen(shellRef, {
    onError: () => showFeedback({ message: 'Full screen is not available.', tone: 'boundary' }),
  });
  const chromeHidden = !readerChrome.visible;

  useEffect(() => {
    chromeActionsRef.current = readerChrome;
    return () => {
      chromeActionsRef.current = null;
    };
  }, [readerChrome]);

  useEffect(() => {
    const theme = snapshot?.preferences.theme;
    if (theme) onThemeChange?.(theme);
  }, [onThemeChange, snapshot?.preferences.theme]);

  useEffect(() => () => {
    if (feedbackTimerRef.current != null) clearTimeout(feedbackTimerRef.current);
    if (surfaceCloseTimerRef.current != null) clearTimeout(surfaceCloseTimerRef.current);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const toolbar = shell.querySelector<HTMLElement>('.epub-reader-shell__toolbar');
    const controls = shell.querySelector<HTMLElement>('.epub-reader-controls');
    const updateFocusLock = () => {
      const active = shell.ownerDocument.activeElement;
      setChromeFocusLocked(Boolean(active && (toolbar?.contains(active) || controls?.contains(active))));
    };
    const holdHoverLock = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') setChromeHoverLocked(true);
    };
    const releaseHoverLock = () => setChromeHoverLocked(false);
    let focusFrame: number | null = null;
    const deferFocusUpdate = () => {
      if (focusFrame != null) cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => {
        focusFrame = null;
        updateFocusLock();
      });
    };
    toolbar?.addEventListener('pointerenter', holdHoverLock, { passive: true });
    toolbar?.addEventListener('pointerleave', releaseHoverLock, { passive: true });
    controls?.addEventListener('pointerenter', holdHoverLock, { passive: true });
    controls?.addEventListener('pointerleave', releaseHoverLock, { passive: true });
    shell.addEventListener('focusin', updateFocusLock);
    shell.addEventListener('focusout', deferFocusUpdate);
    updateFocusLock();
    return () => {
      toolbar?.removeEventListener('pointerenter', holdHoverLock);
      toolbar?.removeEventListener('pointerleave', releaseHoverLock);
      controls?.removeEventListener('pointerenter', holdHoverLock);
      controls?.removeEventListener('pointerleave', releaseHoverLock);
      shell.removeEventListener('focusin', updateFocusLock);
      shell.removeEventListener('focusout', deferFocusUpdate);
      if (focusFrame != null) cancelAnimationFrame(focusFrame);
    };
  }, []);

  // Hand the reader the keyboard once a book is open, so page keys work without
  // having to click into the page first. Only when nothing has claimed focus:
  // never take it away from a control the reader is already using.
  useEffect(() => {
    if (reader.state.status !== 'ready') return;
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      document.getElementById(viewportId)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [reader.state.status, source, viewportId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (panel) {
        const preferred = panel === 'search'
          ? panelRef.current?.querySelector<HTMLInputElement>('input[type="search"]')
          : null;
        (preferred ?? panelRef.current)?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [panel]);

  useEffect(() => {
    if (!footnote) return;
    const frame = requestAnimationFrame(() => {
      footnoteRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [footnote]);

  useEffect(() => {
    if (!compactLayout || (!panel && !footnote)) return;
    const modal = panel ? panelRef.current : footnoteRef.current;
    const shell = shellRef.current;
    if (!modal || !shell) return;
    const isolated = [shell.querySelector<HTMLElement>('.epub-reader-shell__viewport')]
      .filter((element): element is HTMLElement => Boolean(element));
    for (const element of isolated) {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (document.activeElement === modal) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    modal.addEventListener('keydown', onKeyDown);
    return () => {
      modal.removeEventListener('keydown', onKeyDown);
      for (const element of isolated) {
        element.inert = false;
        element.removeAttribute('aria-hidden');
      }
    };
  }, [compactLayout, footnote, panel]);

  useEffect(() => {
    if (!activeImage) return;
    const shell = shellRef.current;
    if (!shell) return;
    const isolated = [shell.querySelector<HTMLElement>('.epub-reader-shell__body')]
      .filter((element): element is HTMLElement => Boolean(element));
    for (const element of isolated) {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    }
    return () => {
      for (const element of isolated) {
        element.inert = false;
        element.removeAttribute('aria-hidden');
      }
    };
  }, [activeImage]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const bars = [
      shell.querySelector<HTMLElement>('.epub-reader-shell__toolbar'),
      shell.querySelector<HTMLElement>('.epub-reader-controls'),
    ].filter((element): element is HTMLElement => Boolean(element));
    const inert = chromeHidden || (compactLayout && Boolean(panel || footnote)) || Boolean(activeImage);
    if (inert && bars.some(element => element.contains(document.activeElement))) {
      document.getElementById(viewportId)?.focus({ preventScroll: true });
    }
    for (const element of bars) {
      element.inert = inert;
      if (inert) element.setAttribute('aria-hidden', 'true');
      else element.removeAttribute('aria-hidden');
    }
    return () => {
      for (const element of bars) {
        element.inert = false;
        element.removeAttribute('aria-hidden');
      }
    };
  }, [activeImage, chromeHidden, compactLayout, footnote, panel, viewportId]);

  const togglePanel = (next: ReaderPanelId, origin: HTMLButtonElement) => {
    if (panel === next) closeSurface();
    else showSurface({ kind: 'panel', panel: next, returnFocus: origin });
  };

  const handleShellKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    const editable = target instanceof HTMLElement
      && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    // One surface is open at most, so Escape has one thing to close and no
    // ordering to get right.
    if (event.key === 'Escape' && surfaces.open) {
      event.preventDefault();
      event.stopPropagation();
      if (selectionTool) reader.clearSelection();
      closeSurface();
    } else if (event.key === '?' && !event.altKey && !event.ctrlKey && !event.metaKey && !editable) {
      event.preventDefault();
      event.stopPropagation();
      showSurface({ kind: 'panel', panel: 'help', returnFocus: activeElement() });
    }
  };

  return (
    <EpubReaderProvider reader={reader}>
      <div
        ref={shellRef}
        className={`epub-reader-shell${chromeHidden ? ' is-chrome-hidden' : ''}${fullscreen.active ? ' is-fullscreen' : ''}`}
        data-chrome={chromeStyle}
        data-book-layout={presentation?.layout ?? undefined}
        data-reading-mode={readingMode}
        data-renderer={plan?.renderer ?? undefined}
        data-writing-mode={plan?.writingMode.value ?? undefined}
        data-page-progression={plan?.pageProgression.value ?? undefined}
        data-spread={plan?.spread.mode ?? undefined}
        data-theme={snapshot?.preferences.theme ?? 'publisher'}
        data-footnote-open={footnote ? 'true' : undefined}
        data-selection-tools-open={selectionTool ? 'true' : undefined}
        data-mark-open={activeMark ? 'true' : undefined}
        data-image-open={activeImage ? 'true' : undefined}
        onKeyDownCapture={handleShellKeyDown}
      >
        <a className="epub-reader-skip-link" href={`#${viewportId}`}>Skip to reading content</a>
        <span id={instructionsId} className="epub-reader-visually-hidden">
          Use the Left and Right Arrow keys to turn pages. Press C to toggle controls or question mark for keyboard help.
        </span>
        <header className="epub-reader-shell__toolbar" aria-label="EPUB reader toolbar">
          <div className="epub-reader-shell__toolbar-start" role="toolbar" aria-label="Publication navigation">
            <HistoryButton direction="back" enabled={snapshot?.navigationHistory.canGoBack ?? false} onActivate={() => void reader.history.back()} />
            <HistoryButton direction="forward" enabled={snapshot?.navigationHistory.canGoForward ?? false} onActivate={() => void reader.history.forward()} />
            <PanelButton item={READER_PANELS[0]} panel={panel} panelId={panelId} buttonRefs={buttonRefs} onToggle={togglePanel} />
          </div>
          <div className="epub-reader-shell__book-context" aria-live="polite" aria-atomic="true">
            <strong title={title}>{title}</strong>
            <span title={chapter}>{chapter}</span>
          </div>
          <div className="epub-reader-shell__toolbar-end" role="toolbar" aria-label="Reading tools">
            {READER_PANELS.slice(1, 4).map(item => (
              <PanelButton key={item.id} item={item} panel={panel} panelId={panelId} buttonRefs={buttonRefs} onToggle={togglePanel} />
            ))}
            {compactLayout ? (
              <CompactReaderToolsMenu
                id={compactToolsMenuId}
                panel={panel}
                panelId={panelId}
                fullscreen={fullscreen}
                readerChrome={readerChrome}
                onTogglePanel={togglePanel}
              />
            ) : (
              <>
                <span className="epub-reader-shell__toolbar-divider" aria-hidden="true" />
                {READER_PANELS.slice(4).map(item => (
                  <PanelButton key={item.id} item={item} panel={panel} panelId={panelId} buttonRefs={buttonRefs} onToggle={togglePanel} secondary />
                ))}
                <EpubReaderFullscreenButton controller={fullscreen} />
                <button
                  className="epub-reader-shell__tool is-secondary epub-reader-shell__chrome-pin"
                  type="button"
                  aria-label={readerChrome.pinned ? 'Allow controls to hide automatically' : 'Keep controls visible'}
                  aria-pressed={readerChrome.pinned}
                  title={readerChrome.pinned ? 'Allow controls to hide automatically' : 'Keep controls visible'}
                  onClick={() => readerChrome.setPinned(!readerChrome.pinned)}
                >
                  <PinIcon active={readerChrome.pinned} />
                  <span>{readerChrome.pinned ? 'Unpin controls' : 'Pin controls'}</span>
                </button>
              </>
            )}
            {compatibility ? (
              <span className={`epub-reader-shell__health is-${compatibility}`} title={`Compatibility: ${compatibility}`}>
                <span aria-hidden="true" /><span className="epub-reader-visually-hidden">Compatibility: {compatibility}</span>
              </span>
            ) : null}
          </div>
        </header>
        <div className={`epub-reader-shell__body${panel ? ' has-panel' : ''}${compactLayout && (panel || footnote) ? ' has-compact-modal' : ''}`}>
          {panel || footnote ? (
            <button
              className={`epub-reader-shell__dismiss-layer${compactLayout ? ' is-modal' : ''}${surfaceClosing ? ' is-closing' : ''}`}
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onClick={() => closeSurface(true, document.getElementById(viewportId))}
            />
          ) : null}
          {panel ? (
            <aside
              id={panelId}
              key="reader-panel"
              ref={panelRef}
              className={`epub-reader-shell__panel${surfaceClosing ? ' is-closing' : ''}`}
              role={compactLayout ? 'dialog' : undefined}
              aria-modal={compactLayout ? 'true' : undefined}
              aria-labelledby={panelTitleId}
              tabIndex={-1}
            >
              <header className="epub-reader-shell__panel-head">
                <div className="epub-reader-shell__panel-context">
                  {activePanel ? <span className="epub-reader-shell__panel-icon"><ReaderToolIcon id={activePanel.id} /></span> : null}
                  <div>
                    <strong id={panelTitleId}>{activePanel?.label}</strong>
                    <span>{activePanel?.description}</span>
                  </div>
                </div>
                <button type="button" onClick={() => closeSurface()} aria-label={`Close ${activePanel?.label ?? 'panel'}`}>
                  <CloseIcon />
                </button>
              </header>
              <div className="epub-reader-shell__panel-content">
                {panel === 'contents'
                  ? <EpubContents />
                  : panel === 'search'
                    ? <EpubSearchPanel />
                    : panel === 'settings'
                      ? <EpubSettingsPanel />
                      : panel === 'marks'
                        ? (
                          <EpubMarksPanel
                            onEditMark={(mark, trigger) => {
                              const shellBounds = shellRef.current?.getBoundingClientRect();
                              const triggerBounds = trigger.getBoundingClientRect();
                              showSurface({
                                kind: 'mark',
                                activation: {
                                  mark,
                                  anchor: {
                                    x: triggerBounds.left + triggerBounds.width / 2 - (shellBounds?.left ?? 0),
                                    y: triggerBounds.bottom - (shellBounds?.top ?? 0),
                                  },
                                  returnFocus: trigger,
                                },
                              });
                            }}
                          />
                        )
                        : panel === 'compatibility'
                          ? <EpubCompatibilityPanel />
                          : <EpubKeyboardHelp />}
              </div>
            </aside>
          ) : null}
          <EpubViewport
            key="reader-viewport"
            id={viewportId}
            tabIndex={-1}
            className="epub-reader-shell__viewport"
            ariaDescribedBy={instructionsId}
          ><EpubReaderStatus /></EpubViewport>
          {footnote ? (
            <aside
              ref={footnoteRef}
              className={`epub-reader-footnote${surfaceClosing ? ' is-closing' : ''}`}
              role="dialog"
              aria-modal={compactLayout ? 'true' : 'false'}
              aria-labelledby={`${instanceId}-footnote-title`}
              aria-describedby={`${instanceId}-footnote-content`}
            >
              <header>
                <div>
                  <span>{footnote.label}</span>
                  <strong id={`${instanceId}-footnote-title`}>{footnote.title}</strong>
                </div>
                <button type="button" onClick={() => closeSurface()} aria-label="Close footnote">
                  <CloseIcon />
                </button>
              </header>
              <div id={`${instanceId}-footnote-content`} className="epub-reader-footnote__content">
                {footnote.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </div>
              <footer>
                <button
                  type="button"
                  onClick={() => {
                    const href = footnote.href;
                    closeSurface(false);
                    void reader.goTo({ kind: 'href', href });
                  }}
                >
                  Open note location
                </button>
              </footer>
            </aside>
          ) : null}
          {selectionTool ? (
            <EpubSelectionToolbar
              activation={selectionTool}
              reader={reader}
              onDismiss={(withFocus = false) => {
                reader.clearSelection();
                closeSurface(withFocus);
              }}
              onSaved={kind => showFeedback({ message: kind === 'highlight' ? 'Highlight saved' : 'Note saved', tone: 'success' })}
            />
          ) : null}
          {activeMark ? (
            <EpubMarkPopover
              activation={activeMark}
              reader={reader}
              onClose={(withFocus = false) => closeSurface(withFocus)}
              onChanged={message => showFeedback({ message, tone: 'success' })}
            />
          ) : null}
        </div>
        <EpubReaderControls />
        {activeImage ? (
          <EpubImageViewer
            activation={activeImage}
            onClose={(withFocus = false) => closeSurface(withFocus)}
          />
        ) : null}
        {feedback ? <EpubReaderFeedback feedback={feedback} feedbackId={feedback.id} /> : null}
      </div>
    </EpubReaderProvider>
  );
}
