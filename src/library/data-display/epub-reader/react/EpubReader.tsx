import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { EpubContents } from './EpubContents';
import { EpubCompatibilityPanel } from './EpubCompatibilityPanel';
import { EpubMarksPanel } from './EpubMarksPanel';
import { EpubKeyboardHelp } from './EpubKeyboardHelp';
import { EpubReaderControls } from './EpubReaderControls';
import { EpubReaderFeedback } from './EpubReaderFeedback';
import { EpubReaderStatus } from './EpubReaderStatus';
import { EpubReaderProvider } from './context';
import { EpubSearchPanel } from './EpubSearchPanel';
import { EpubSettingsPanel } from './EpubSettingsPanel';
import { EpubViewport } from './EpubViewport';
import type { EpubSource } from './model';
import type { ReaderFootnote, ReaderImageActivation, ReaderMarkActivation, ReaderSelectionActivation, ReaderTheme } from '../core';
import { EpubSelectionToolbar } from './EpubSelectionToolbar';
import { EpubMarkPopover } from './EpubMarkPopover';
import { EpubImageViewer } from './EpubImageViewer';
import { useEpubReader } from './use-epub-reader';
import { feedbackForIntent, type ReaderFeedbackSpec } from './feedback-model';
import { useCompactReaderLayout } from './responsive';
import { useDelayedFlag, useHeldValue } from './loading-delay';
import { ChromeIcon, CloseIcon, FullscreenIcon, HistoryIcon, PinIcon, ReaderToolIcon } from './reader-icons';

type Panel = 'contents' | 'search' | 'settings' | 'marks' | 'compatibility' | 'help' | null;

const PANELS: readonly { id: Exclude<Panel, null>; label: string; shortLabel: string; description: string }[] = [
  { id: 'contents', label: 'Contents', shortLabel: 'Contents', description: 'Navigate the publication' },
  { id: 'search', label: 'Search', shortLabel: 'Search', description: 'Find text in this book' },
  { id: 'marks', label: 'Bookmarks and annotations', shortLabel: 'Marks', description: 'Saved places and selections' },
  { id: 'settings', label: 'Reading settings', shortLabel: 'Appearance', description: 'Theme, type and layout' },
  { id: 'compatibility', label: 'Book information', shortLabel: 'Book info', description: 'Compatibility and repairs' },
  { id: 'help', label: 'Keyboard shortcuts', shortLabel: 'Help', description: 'Reader keyboard commands' },
] as const;

/**
 * Dependency-free reader shell.
 *
 * It deliberately accepts an EPUB source and nothing related to file picking;
 * host applications can obtain that source from upload, fetch, IndexedDB, a
 * desktop bridge or any other mechanism.
 */
export function EpubReader({ source, onThemeChange }: { readonly source: EpubSource; readonly onThemeChange?: (theme: ReaderTheme) => void }) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const compactLayout = useCompactReaderLayout(shellRef);
  const [panel, setPanel] = useState<Panel>(null);
  const [autoChromeHidden, setAutoChromeHidden] = useState(false);
  const [manualChromeHidden, setManualChromeHidden] = useState(false);
  const [chromePinned, setChromePinned] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [footnoteState, setFootnote] = useState<{ readonly source: EpubSource; readonly footnote: ReaderFootnote } | null>(null);
  const footnote = footnoteState?.source === source ? footnoteState.footnote : null;
  const [selectionTool, setSelectionTool] = useState<ReaderSelectionActivation | null>(null);
  const [activeMark, setActiveMark] = useState<ReaderMarkActivation | null>(null);
  const [activeImage, setActiveImage] = useState<ReaderImageActivation | null>(null);
  const [feedback, setFeedback] = useState<(ReaderFeedbackSpec & { readonly id: number }) | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackIdRef = useRef(0);
  const panelRef = useRef<HTMLElement | null>(null);
  const footnoteRef = useRef<HTMLElement | null>(null);
  const footnoteReturnFocusRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const previousPanelRef = useRef<Panel>(null);
  const buttonRefs = useRef(new Map<Exclude<Panel, null>, HTMLButtonElement>());
  const instanceId = useId().replaceAll(':', '');
  const panelId = `${instanceId}-reader-panel`;
  const panelTitleId = `${instanceId}-reader-panel-title`;
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
  const rememberFocus = useCallback(() => {
    if (returnFocusRef.current?.isConnected) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement) returnFocusRef.current = active;
  }, []);
  const closePanel = useCallback(() => {
    const closingPanel = previousPanelRef.current;
    const target = returnFocusRef.current ?? (closingPanel ? buttonRefs.current.get(closingPanel) : null) ?? null;
    setPanel(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const fallback = closingPanel ? buttonRefs.current.get(closingPanel) : null;
        const resolved = target?.isConnected ? target : fallback;
        resolved?.focus({ preventScroll: true });
        requestAnimationFrame(() => {
          if (document.activeElement === document.body) {
            const retry = target?.isConnected ? target : fallback;
            retry?.focus({ preventScroll: true });
            if (document.activeElement === document.body) fallback?.focus({ preventScroll: true });
          }
          returnFocusRef.current = null;
        });
      });
    });
  }, []);
  const closeFootnote = useCallback((restoreFocus = true) => {
    const target = footnoteReturnFocusRef.current;
    setFootnote(null);
    footnoteReturnFocusRef.current = null;
    if (!restoreFocus) return;
    requestAnimationFrame(() => {
      if (target?.isConnected && typeof target.focus === 'function') target.focus({ preventScroll: true });
      else document.getElementById(viewportId)?.focus({ preventScroll: true });
    });
  }, [viewportId]);
  const reader = useEpubReader(source, {
    onIntent: intent => {
      if (intent.type === 'open-search') { setManualChromeHidden(false); setActiveImage(null); rememberFocus(); setPanel('search'); }
      else if (intent.type === 'open-help') { setManualChromeHidden(false); setActiveImage(null); rememberFocus(); setPanel('help'); }
      else if (intent.type === 'toggle-chrome') {
        setPanel(null);
        setFootnote(null);
        setSelectionTool(null);
        setActiveMark(null);
        setActiveImage(null);
        setManualChromeHidden(current => !current);
      }
      else if (intent.type === 'open-footnote') {
        setManualChromeHidden(false);
        setPanel(null);
        setActiveImage(null);
        returnFocusRef.current = null;
        footnoteReturnFocusRef.current = intent.trigger;
        setFootnote({ source, footnote: intent.footnote });
      }
      else if (intent.type === 'selection-changed') {
        setSelectionTool(intent.activation);
        if (intent.activation) {
          setManualChromeHidden(false);
          setPanel(null);
          setFootnote(null);
          setActiveImage(null);
        }
      }
      else if (intent.type === 'open-mark') {
        setManualChromeHidden(false);
        setPanel(null);
        setFootnote(null);
        setSelectionTool(null);
        setActiveImage(null);
        setActiveMark(intent.activation);
      }
      else if (intent.type === 'open-image') {
        setManualChromeHidden(false);
        setPanel(null);
        setFootnote(null);
        setSelectionTool(null);
        setActiveMark(null);
        setActiveImage(intent.activation);
      }
      else if (intent.type === 'escape') {
        if (activeImage) setActiveImage(null);
        else if (activeMark) setActiveMark(null);
        else if (selectionTool) setSelectionTool(null);
        else if (footnote) closeFootnote();
        else closePanel();
      }
      else {
        const nextFeedback = feedbackForIntent(intent);
        if (nextFeedback) showFeedback(nextFeedback);
      }
    },
  });
  const activePanel = PANELS.find(item => item.id === panel);
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
  const immersive = presentation?.chrome === 'immersive';
  const readingMode = presentation?.layout === 'fixed-layout'
    ? 'fixed'
    : presentation && presentation.writingMode !== 'horizontal-tb'
      ? 'text-vertical'
      : 'text-horizontal';
  const chromeHidden = manualChromeHidden || autoChromeHidden;

  useEffect(() => {
    const theme = snapshot?.preferences.theme;
    if (theme) onThemeChange?.(theme);
  }, [onThemeChange, snapshot?.preferences.theme]);

  useEffect(() => () => {
    if (feedbackTimerRef.current != null) clearTimeout(feedbackTimerRef.current);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !immersive || chromePinned || panel || footnote || selectionTool || activeMark || activeImage || manualChromeHidden) {
      setAutoChromeHidden(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (timer != null) clearTimeout(timer);
      timer = null;
    };
    const reveal = () => {
      setAutoChromeHidden(false);
      clear();
      timer = setTimeout(() => {
        if (!shell.matches(':focus-within')) setAutoChromeHidden(true);
      }, 2400);
    };
    const hold = () => {
      setAutoChromeHidden(false);
      clear();
    };
    shell.addEventListener('pointermove', reveal, { passive: true });
    shell.addEventListener('pointerdown', reveal, { passive: true });
    shell.addEventListener('click', reveal);
    shell.addEventListener('pointerleave', reveal, { passive: true });
    shell.addEventListener('focusin', hold);
    shell.addEventListener('focusout', reveal);
    reveal();
    return () => {
      clear();
      shell.removeEventListener('pointermove', reveal);
      shell.removeEventListener('pointerdown', reveal);
      shell.removeEventListener('click', reveal);
      shell.removeEventListener('pointerleave', reveal);
      shell.removeEventListener('focusin', hold);
      shell.removeEventListener('focusout', reveal);
    };
  }, [activeImage, activeMark, chromePinned, immersive, footnote, manualChromeHidden, panel, selectionTool]);

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
    const update = () => setFullscreen(document.fullscreenElement === shellRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const toggleFullscreen = async () => {
    const shell = shellRef.current;
    if (!shell) return;
    try {
      if (document.fullscreenElement === shell) await document.exitFullscreen();
      else await shell.requestFullscreen();
    } catch {
      setFullscreen(false);
    }
  };

  useEffect(() => {
    previousPanelRef.current = panel;
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
    const isolated = [
      shell.querySelector<HTMLElement>('.epub-reader-shell__toolbar'),
      shell.querySelector<HTMLElement>('.epub-reader-shell__viewport'),
      shell.querySelector<HTMLElement>('.epub-reader-controls'),
    ].filter((element): element is HTMLElement => Boolean(element));
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
    const isolated = [
      shell.querySelector<HTMLElement>('.epub-reader-shell__toolbar'),
      shell.querySelector<HTMLElement>('.epub-reader-shell__body'),
      shell.querySelector<HTMLElement>('.epub-reader-controls'),
    ].filter((element): element is HTMLElement => Boolean(element));
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

  const togglePanel = (next: Exclude<Panel, null>, origin: HTMLButtonElement) => {
    setSelectionTool(null);
    setActiveMark(null);
    setActiveImage(null);
    returnFocusRef.current = origin;
    if (panel === next) closePanel();
    else setPanel(next);
  };

  const handleShellKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    const editable = target instanceof HTMLElement
      && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (event.key === 'Escape' && activeImage) {
      event.preventDefault();
      event.stopPropagation();
      const image = activeImage.trigger;
      setActiveImage(null);
      requestAnimationFrame(() => image.isConnected ? image.focus({ preventScroll: true }) : document.getElementById(viewportId)?.focus({ preventScroll: true }));
    } else if (event.key === 'Escape' && activeMark) {
      event.preventDefault();
      event.stopPropagation();
      const target = activeMark.returnFocus;
      setActiveMark(null);
      requestAnimationFrame(() => target.isConnected ? target.focus({ preventScroll: true }) : document.getElementById(viewportId)?.focus({ preventScroll: true }));
    } else if (event.key === 'Escape' && selectionTool) {
      event.preventDefault();
      event.stopPropagation();
      const target = selectionTool.returnFocus;
      reader.clearSelection();
      setSelectionTool(null);
      requestAnimationFrame(() => target.isConnected ? target.focus({ preventScroll: true }) : document.getElementById(viewportId)?.focus({ preventScroll: true }));
    } else if (event.key === 'Escape' && footnote) {
      event.preventDefault();
      event.stopPropagation();
      closeFootnote();
    } else if (event.key === 'Escape' && panel) {
      event.preventDefault();
      event.stopPropagation();
      closePanel();
    } else if (event.key === '?' && !event.altKey && !event.ctrlKey && !event.metaKey && !editable) {
      event.preventDefault();
      event.stopPropagation();
      rememberFocus();
      setActiveImage(null);
      setPanel('help');
    }
  };

  return (
    <EpubReaderProvider reader={reader}>
      <div
        ref={shellRef}
        className={`epub-reader-shell${chromeHidden ? ' is-chrome-hidden' : ''}${manualChromeHidden ? ' is-chrome-manual' : ''}${fullscreen ? ' is-fullscreen' : ''}`}
        data-chrome={presentation?.chrome ?? undefined}
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
        {manualChromeHidden ? (
          <button
            className="epub-reader-shell__chrome-restore"
            type="button"
            aria-label="Show reader controls"
            title="Show reader controls (C)"
            onClick={() => setManualChromeHidden(false)}
          >
            <ChromeIcon hidden />
          </button>
        ) : null}
        <header className="epub-reader-shell__toolbar" aria-label="EPUB reader toolbar">
          <div className="epub-reader-shell__toolbar-start" role="toolbar" aria-label="Publication navigation">
            <HistoryButton direction="back" enabled={snapshot?.navigationHistory.canGoBack ?? false} onActivate={() => void reader.history.back()} />
            <HistoryButton direction="forward" enabled={snapshot?.navigationHistory.canGoForward ?? false} onActivate={() => void reader.history.forward()} />
            <PanelButton item={PANELS[0]} panel={panel} panelId={panelId} buttonRefs={buttonRefs} onToggle={togglePanel} />
          </div>
          <div className="epub-reader-shell__book-context" aria-live="polite" aria-atomic="true">
            <strong title={title}>{title}</strong>
            <span title={chapter}>{chapter}</span>
          </div>
          <div className="epub-reader-shell__toolbar-end" role="toolbar" aria-label="Reading tools">
            {PANELS.slice(1, 4).map(item => (
              <PanelButton key={item.id} item={item} panel={panel} panelId={panelId} buttonRefs={buttonRefs} onToggle={togglePanel} />
            ))}
            <span className="epub-reader-shell__toolbar-divider" aria-hidden="true" />
            {PANELS.slice(4).map(item => (
              <PanelButton key={item.id} item={item} panel={panel} panelId={panelId} buttonRefs={buttonRefs} onToggle={togglePanel} secondary />
            ))}
            {immersive ? (
              <button
                className="epub-reader-shell__tool is-secondary epub-reader-shell__fullscreen"
                type="button"
                aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'}
                title={fullscreen ? 'Exit full screen' : 'Enter full screen'}
                onClick={() => void toggleFullscreen()}
              >
                <FullscreenIcon active={fullscreen} />
                <span>{fullscreen ? 'Exit full screen' : 'Full screen'}</span>
              </button>
            ) : null}
            {immersive ? (
              <button
                className="epub-reader-shell__tool is-secondary epub-reader-shell__chrome-pin"
                type="button"
                aria-label={chromePinned ? 'Allow controls to hide automatically' : 'Keep controls visible'}
                aria-pressed={chromePinned}
                title={chromePinned ? 'Allow controls to hide automatically' : 'Keep controls visible'}
                onClick={() => {
                  setChromePinned(current => !current);
                  setAutoChromeHidden(false);
                }}
              >
                <PinIcon active={chromePinned} />
                <span>{chromePinned ? 'Unpin controls' : 'Pin controls'}</span>
              </button>
            ) : null}
            <button
              className="epub-reader-shell__tool is-secondary epub-reader-shell__chrome-hide"
              type="button"
              aria-label="Hide reader controls"
              aria-keyshortcuts="C"
              title="Hide reader controls (C)"
              onClick={() => {
                reader.clearSelection();
                setSelectionTool(null);
                setActiveMark(null);
                setActiveImage(null);
                setManualChromeHidden(true);
              }}
            >
              <ChromeIcon hidden={false} />
              <span>Hide controls</span>
            </button>
            {compatibility ? (
              <span className={`epub-reader-shell__health is-${compatibility}`} title={`Compatibility: ${compatibility}`}>
                <span aria-hidden="true" /><span className="epub-reader-visually-hidden">Compatibility: {compatibility}</span>
              </span>
            ) : null}
          </div>
        </header>
        <div className={`epub-reader-shell__body${panel ? ' has-panel' : ''}`}>
          {compactLayout && (panel || footnote) ? (
            <button
              className="epub-reader-shell__modal-scrim"
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onClick={() => panel ? closePanel() : closeFootnote()}
            />
          ) : null}
          {panel ? (
            <aside
              id={panelId}
              key="reader-panel"
              ref={panelRef}
              className="epub-reader-shell__panel"
              role={compactLayout ? 'dialog' : undefined}
              aria-modal={compactLayout ? 'true' : undefined}
              aria-labelledby={panelTitleId}
              tabIndex={-1}
            >
              <header className="epub-reader-shell__panel-head">
                <div>
                  <strong id={panelTitleId}>{activePanel?.label}</strong>
                  <span>{activePanel?.description}</span>
                </div>
                <button type="button" onClick={closePanel} aria-label={`Close ${activePanel?.label ?? 'panel'}`}>
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
                              setPanel(null);
                              setActiveMark({
                                mark,
                                anchor: {
                                  x: triggerBounds.left + triggerBounds.width / 2 - (shellBounds?.left ?? 0),
                                  y: triggerBounds.bottom - (shellBounds?.top ?? 0),
                                },
                                returnFocus: trigger,
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
              className="epub-reader-footnote"
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
                <button type="button" onClick={() => closeFootnote()} aria-label="Close footnote">
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
                    closeFootnote(false);
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
              onDismiss={(restoreFocus = false) => {
                const target = selectionTool.returnFocus;
                reader.clearSelection();
                setSelectionTool(null);
                if (restoreFocus) requestAnimationFrame(() => target.isConnected ? target.focus({ preventScroll: true }) : document.getElementById(viewportId)?.focus({ preventScroll: true }));
              }}
              onSaved={kind => showFeedback({ message: kind === 'highlight' ? 'Highlight saved' : 'Note saved', tone: 'success' })}
            />
          ) : null}
          {activeMark ? (
            <EpubMarkPopover
              activation={activeMark}
              reader={reader}
              onClose={(restoreFocus = false) => {
                const target = activeMark.returnFocus;
                setActiveMark(null);
                if (restoreFocus) requestAnimationFrame(() => target.isConnected ? target.focus({ preventScroll: true }) : document.getElementById(viewportId)?.focus({ preventScroll: true }));
              }}
              onChanged={message => showFeedback({ message, tone: 'success' })}
            />
          ) : null}
        </div>
        <EpubReaderControls />
        {activeImage ? (
          <EpubImageViewer
            activation={activeImage}
            onClose={(restoreFocus = false) => {
              const target = activeImage.trigger;
              setActiveImage(null);
              if (restoreFocus) requestAnimationFrame(() => target.isConnected ? target.focus({ preventScroll: true }) : document.getElementById(viewportId)?.focus({ preventScroll: true }));
            }}
          />
        ) : null}
        {feedback ? <EpubReaderFeedback feedback={feedback} feedbackId={feedback.id} /> : null}
      </div>
    </EpubReaderProvider>
  );
}

function HistoryButton({ direction, enabled, onActivate }: { readonly direction: 'back' | 'forward'; readonly enabled: boolean; readonly onActivate: () => void }) {
  const back = direction === 'back';
  const label = back ? 'Back to previous reading location' : 'Forward to next reading location';
  return (
    <button
      className={`epub-reader-shell__tool is-secondary epub-reader-shell__history is-${direction}`}
      type="button"
      disabled={!enabled}
      aria-label={label}
      aria-keyshortcuts={back ? 'Alt+ArrowLeft' : 'Alt+ArrowRight'}
      title={`${label} (${back ? 'Alt+Left' : 'Alt+Right'})`}
      onClick={onActivate}
    >
      <HistoryIcon direction={direction} />
      <span>{back ? 'Back' : 'Forward'}</span>
    </button>
  );
}

interface PanelButtonProps {
  readonly key?: string;
  readonly item: (typeof PANELS)[number];
  readonly panel: Panel;
  readonly panelId: string;
  readonly buttonRefs: import('react').MutableRefObject<Map<Exclude<Panel, null>, HTMLButtonElement>>;
  readonly onToggle: (panel: Exclude<Panel, null>, origin: HTMLButtonElement) => void;
  readonly secondary?: boolean;
}

function PanelButton({ item, panel, panelId, buttonRefs, onToggle, secondary = false }: PanelButtonProps) {
  return (
    <button
      className={`epub-reader-shell__tool${secondary ? ' is-secondary' : ''}`}
      type="button"
      ref={(element: HTMLButtonElement | null) => {
        if (element) buttonRefs.current.set(item.id, element);
        else buttonRefs.current.delete(item.id);
      }}
      aria-pressed={panel === item.id}
      aria-expanded={panel === item.id}
      aria-controls={panel === item.id ? panelId : undefined}
      aria-keyshortcuts={item.id === 'search' ? 'Control+F Meta+F' : item.id === 'help' ? '?' : undefined}
      aria-label={item.label}
      title={item.label}
      onClick={(event: import('react').MouseEvent<HTMLButtonElement>) => onToggle(item.id, event.currentTarget)}
    >
      <ReaderToolIcon id={item.id} />
      <span>{item.shortLabel}</span>
    </button>
  );
}
