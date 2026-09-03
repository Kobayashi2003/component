import { useEffect, useId, useMemo, useRef } from 'react';
import { EpubReaderStatus } from '../chrome/EpubReaderStatus';
import { EpubReaderProvider } from './context';
import { EpubViewport } from './EpubViewport';
import type { EpubSource, UseEpubReaderOptions } from '../state/model';
import type { ReaderTheme } from '../../core';
import { useCompactReaderLayout } from '../chrome/responsive';
import { useDelayedFlag, useHeldValue } from '../chrome/loading-delay';
import type { ReaderChromeControls } from '../chrome/use-reader-chrome';
import { useReaderEventRouting } from './shell/use-reader-event-routing';
import { useReaderFeedback } from './shell/use-reader-feedback';
import { useReaderFocusManagement } from './shell/use-reader-focus-management';
import { useReaderShellChrome } from './shell/use-reader-shell-chrome';
import { useReaderShellKeyboard } from './shell/use-reader-shell-keyboard';
import { useReaderSurfaceController } from './shell/use-reader-surface-controller';
import { ReaderModalHost } from './shell/components/ReaderModalHost';
import { ReaderPanelHost } from './shell/components/ReaderPanelHost';
import { ReaderShell } from './shell/components/ReaderShell';
import { ReaderToolbar } from './shell/components/ReaderToolbar';
import { ReaderTransientSurfaceHost } from './shell/components/ReaderTransientSurfaceHost';
import type { ReaderUiConfiguration } from '../configuration/model';
import { DEFAULT_READER_UI_CONFIGURATION } from '../configuration/reader-ui-configuration';
import { ReaderUiConfigurationProvider, resolveReaderUiConfiguration } from '../configuration/context';

/** Reader shell independent of how the host obtains the EPUB source. */
export interface EpubReaderProps {
  readonly source: EpubSource;
  readonly readerOptions?: Omit<UseEpubReaderOptions, 'extensions'>;
  /** Validated UI, theme, input, and book-compatibility composition for this reader. */
  readonly configuration?: ReaderUiConfiguration;
  readonly onThemeChange?: (theme: ReaderTheme) => void;
}

export function EpubReader({
  source,
  readerOptions,
  configuration = DEFAULT_READER_UI_CONFIGURATION,
  onThemeChange,
}: EpubReaderProps) {
  const runtimeConfiguration = useMemo(
    () => resolveReaderUiConfiguration(configuration),
    [configuration],
  );
  const shellRef = useRef<HTMLDivElement | null>(null);
  const compactLayout = useCompactReaderLayout(shellRef, configuration.layout.compactBreakpointPx);
  const instanceId = useId().replaceAll(':', '');
  const panelId = `${instanceId}-reader-panel`;
  const panelTitleId = `${instanceId}-reader-panel-title`;
  const compactToolsMenuId = `${instanceId}-reader-tools-menu`;
  const viewportId = `${instanceId}-reader-viewport`;
  const instructionsId = `${instanceId}-reader-instructions`;
  const { feedback, show: showFeedback } = useReaderFeedback();
  const surfaceController = useReaderSurfaceController(source, viewportId, configuration.appearance.motion);
  const {
    surfaces,
    closing: surfaceClosing,
    panelRef,
    footnoteRef,
    buttonRefs,
    activeElement,
    show: showSurface,
    close: closeSurface,
    togglePanel,
  } = surfaceController;
  const { panel, footnote, selection: selectionTool, mark: activeMark, image: activeImage, externalLink } = surfaces;
  const chromeActionsRef = useRef<Pick<ReaderChromeControls, 'show' | 'toggle'> | null>(null);
  const reader = useReaderEventRouting({
    source,
    readerOptions: { ...readerOptions, extensions: configuration.extensions },
    messages: configuration.messages,
    tools: runtimeConfiguration.tools,
    surfaces,
    showSurface,
    closeSurface,
    activeElement,
    showFeedback,
    chromeActionsRef,
  });
  const availableTools = runtimeConfiguration.tools.available({ reader });
  const snapshot = reader.state.reader;
  const activeTheme = snapshot?.appearance.themes.find(theme => theme.id === snapshot.preferences.theme);
  const compatibility = snapshot?.compatibility.status;
  const title = snapshot?.publication.metadata.title?.trim() || configuration.messages.openingPublicationTitle;
  // The line under the title. A page turn empties it for a few dozen
  // milliseconds, so hold the previous chapter name across the gap; once the
  // turn settles, report what the new position actually resolves to, which for
  // front matter with no table-of-contents entry is nothing in particular.
  const turning = snapshot != null && reader.state.status !== 'ready';
  const chapterName = useHeldValue(snapshot?.accessibility.chapter?.trim() ?? '', turning);
  const turnIsSlow = useDelayedFlag(turning);
  const chapter = (turnIsSlow ? configuration.messages.loadingChapter : chapterName)
    || (reader.state.status === 'ready' || snapshot ? configuration.messages.reading : configuration.messages.preparingBook);
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
  const shellChrome = useReaderShellChrome({
    shellRef,
    hasPublicationSnapshot: snapshot != null,
    surfaceOpen: surfaces.open,
    onFullscreenError: () => showFeedback({ message: configuration.messages.fullscreenUnavailable, tone: 'boundary' }),
    actionsRef: chromeActionsRef,
  });
  const { chrome: readerChrome, fullscreen, hidden: chromeHidden } = shellChrome;
  const modalOverlayOpen = Boolean(activeImage || externalLink);

  useEffect(() => {
    const theme = snapshot?.preferences.theme;
    if (theme) onThemeChange?.(theme);
  }, [onThemeChange, snapshot?.preferences.theme]);

  useEffect(() => {
    if (panel && !availableTools.some(tool => tool.id === panel)) closeSurface(false);
  }, [availableTools, closeSurface, panel]);

  useReaderFocusManagement({
    shellRef,
    panelRef,
    footnoteRef,
    viewportId,
    source,
    readerStatus: reader.state.status,
    panel,
    footnote,
    compactLayout,
    modalOverlayOpen,
    chromeHidden,
  });
  const handleShellKeyDown = useReaderShellKeyboard(reader, surfaces, surfaceController, runtimeConfiguration.tools);

  return (
    <ReaderUiConfigurationProvider configuration={runtimeConfiguration}>
      <EpubReaderProvider reader={reader}>
        <ReaderShell
        shellRef={shellRef}
        chromeHidden={chromeHidden}
        fullscreenActive={fullscreen.active}
        compactLayout={compactLayout}
        chrome={chromeStyle}
        bookLayout={presentation?.layout}
        readingMode={readingMode}
        renderer={plan?.renderer}
        writingMode={plan?.writingMode.value}
        pageProgression={plan?.pageProgression.value}
        spread={plan?.spread.mode}
        theme={snapshot?.preferences.theme ?? 'publisher'}
        themeUi={activeTheme?.ui}
        footnoteOpen={Boolean(footnote)}
        selectionToolsOpen={Boolean(selectionTool)}
        markOpen={Boolean(activeMark)}
        imageOpen={Boolean(activeImage)}
        externalLinkOpen={Boolean(externalLink)}
        viewportId={viewportId}
        instructionsId={instructionsId}
        onKeyDownCapture={handleShellKeyDown}
        toolbar={(
          <ReaderToolbar
            title={title}
            chapter={chapter}
            compatibility={compatibility}
            panel={panel}
            panelId={panelId}
            compactToolsMenuId={compactToolsMenuId}
            compactLayout={compactLayout}
            buttonRefs={buttonRefs}
            fullscreen={fullscreen}
            readerChrome={readerChrome}
            tools={availableTools}
            onTogglePanel={togglePanel}
          />
        )}
        modalLayer={<ReaderModalHost surface={surfaces.surface} onClose={closeSurface} showFeedback={showFeedback} />}
        feedback={feedback}
      >
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
          <ReaderPanelHost
            panel={panel}
            panelId={panelId}
            panelTitleId={panelTitleId}
            compactLayout={compactLayout}
            closing={surfaceClosing}
            panelRef={panelRef}
            shellRef={shellRef}
            shortcutGroups={snapshot?.input.shortcutGroups}
            tools={availableTools}
            onShowSurface={showSurface}
            onClose={closeSurface}
          />
          <EpubViewport
            key="reader-viewport"
            id={viewportId}
            tabIndex={-1}
            className="epub-reader-shell__viewport"
            ariaDescribedBy={instructionsId}
          ><EpubReaderStatus /></EpubViewport>
          <ReaderTransientSurfaceHost
            surface={surfaces.surface}
            instanceId={instanceId}
            compactLayout={compactLayout}
            closing={surfaceClosing}
            footnoteRef={footnoteRef}
            onClose={closeSurface}
            showFeedback={showFeedback}
          />
        </div>
        </ReaderShell>
      </EpubReaderProvider>
    </ReaderUiConfigurationProvider>
  );
}
