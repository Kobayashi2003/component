import { describeReaderPosition } from '../../features/accessibility';
import { MemoryReaderMarkStore, ReaderMarkController, type ReaderMark, type ReaderMarkStore } from '../../features/annotations';
import { ReaderThemeRegistry } from '../../presentation/appearance';
import { OcfZipArchive } from '../../epub/archive';
import {
  createReaderCompatibilityProfile,
  createCompatibilityReport,
  runRenditionCompatibilityPolicies,
  type CompatibilityProfile,
} from '../../epub/compatibility';
import { BrowserDomXmlPlatform, PublicationContentDocumentCache, PublicationContentDocumentPipeline, PublicationContentPreflightSession, type PublicationContentPreflightResult } from '../../epub/content';
import { ReaderDecorationController } from '../../features/decorations';
import { BrowserReaderInputRouter, ReaderInputController, type ReaderInputMap } from '../../interaction/input';
import { locatorAtResourceStart } from '../../interaction/locator';
import { BrowserPublicationMediaRouter } from '../../features/media';
import { loadPublicationFootnote, locatorFromCfi, locatorFromHref, PublicationLinkRouter, ReaderNavigationHistory, ReaderNavigator, type NavigationPlanProvider, type NavigationTarget, type ReaderNavigationResult } from '../../interaction/navigation';
import {
  DEFAULT_READER_PREFERENCES,
  loadPublicationFromArchive,
  normalizeReaderPreferences,
  resolvePublicationLayoutProfile,
  resolveSpineRendition,
  type ContentPresentationHints,
  type Locator,
  type Publication,
  type PublicationDiagnostic,
  type ReaderPreferences,
  type WritingMode,
} from '../../epub/publication';
import { createReadingRendererFactories, RendererHost } from '../../presentation/renderer';
import {
  DEFAULT_RENDITION_PLANNER_POLICY,
  planRendition,
  type RenditionPlannerPolicy,
  type ViewportMetrics,
} from '../../presentation/rendition';
import { BrowserObjectUrlFactory, PublicationResourceSession, ResourceResolver } from '../../epub/resources';
import { BrowserPublicationSearchProvider, PublicationSearch, ReaderSearchController, type SearchOptions } from '../../features/search';
import { BrowserReaderSelectionRouter, captureSelectionFromDocuments, getDocumentSelection, type ReaderSelection } from '../../interaction/selection';
import type {
  BrowserEpubReaderMarksApi,
  BrowserEpubReaderOpenProgress,
  BrowserEpubReaderOptions,
  BrowserEpubReaderSearchApi,
  BrowserEpubReaderSnapshot,
  ReaderPublicationPresentation,
} from './model';
import { PublicationDiagnosticCollector } from './diagnostic-collector';
import { addBookmarkAndNotify } from './bookmark-event';
import { configureReaderExtensions, type ReaderExtensionConfiguration } from '../configuration';

type SnapshotListener = () => void;

export class BrowserEpubReaderOpenError extends Error {
  constructor(
    message: string,
    readonly diagnostics: readonly PublicationDiagnostic[],
  ) {
    super(message);
    this.name = 'BrowserEpubReaderOpenError';
  }
}

/**
 * Browser composition root for the React adapter and any non-React host UI.
 *
 * This class owns one opened publication session. React never needs to know how
 * parser/resources/planner/renderers/navigation/search/marks are wired together;
 * it subscribes to this immutable snapshot and invokes semantic methods.
 */
export class BrowserEpubReader {
  private readonly listeners = new Set<SnapshotListener>();
  private readonly cleanups: (() => void)[] = [];
  private readonly hints: Map<number, ContentPresentationHints>;
  /**
   * Package-level layout/chrome remain stable. Dominant writing mode starts
   * from the critical preflight window and is refined once after the staged
   * publication scan; it never tracks page-by-page renderer changes.
   */
  private presentation: ReaderPublicationPresentation;
  private readonly plannerPolicy: RenditionPlannerPolicy;
  private readonly compatibilityProfile: CompatibilityProfile;
  private readonly resources: PublicationResourceSession;
  private readonly contentPreflight: PublicationContentPreflightSession;
  private readonly contentDocumentCache: PublicationContentDocumentCache;
  private readonly host: RendererHost;
  private readonly navigator: ReaderNavigator;
  private readonly navigationHistory = new ReaderNavigationHistory();
  private readonly searchController: ReaderSearchController;
  private readonly markStore: ReaderMarkStore;
  private readonly markController: ReaderMarkController;
  private readonly decorations: ReaderDecorationController;
  private readonly inputRouter: BrowserReaderInputRouter;
  private readonly inputMap: ReaderInputMap;
  private readonly linkRouter: PublicationLinkRouter;
  private readonly selectionRouter: BrowserReaderSelectionRouter;
  private readonly mediaRouter: BrowserPublicationMediaRouter;
  private readonly selectionPollTimer: number | null;
  private cancelBackgroundPreflight: (() => void) | null = null;
  private readonly themeRegistry: ReaderThemeRegistry;
  private readonly readerEvent: BrowserEpubReaderOptions['onEvent'];
  private readonly diagnostics: PublicationDiagnosticCollector;
  private preferences: ReaderPreferences;
  private viewport: ViewportMetrics;
  private locator: Locator | null = null;
  /** Target requested by a queued navigation; protects semantic anchors while layout commits. */
  private pendingNavigationLocator: Locator | null = null;
  private selection: ReaderSelection | null = null;
  private disposed = false;
  private snapshotValue: BrowserEpubReaderSnapshot;

  readonly search: BrowserEpubReaderSearchApi;
  readonly marks: BrowserEpubReaderMarksApi;

  private constructor(
    readonly publication: import('../../epub/publication').Publication,
    private readonly container: HTMLElement,
    resources: PublicationResourceSession,
    contentPreflight: PublicationContentPreflightSession,
    diagnostics: readonly PublicationDiagnostic[],
    initialHints: ReadonlyMap<number, ContentPresentationHints>,
    preferences: ReaderPreferences,
    viewport: ViewportMetrics,
    compatibilityProfile: CompatibilityProfile,
    extensions: ReaderExtensionConfiguration,
    private readonly options: BrowserEpubReaderOptions,
  ) {
    this.resources = resources;
    this.contentPreflight = contentPreflight;
    this.hints = new Map(initialHints);
    // Built from preflight hints only. Renderer feedback keeps refining
    // `this.hints` per spine item, but the publication-level answer must not
    // move underneath the UI once reading has started.
    this.presentation = resolvePublicationPresentation(publication, initialHints);
    this.diagnostics = new PublicationDiagnosticCollector(diagnostics);
    this.preferences = preferences;
    this.compatibilityProfile = compatibilityProfile;
    this.viewport = viewport;
    this.plannerPolicy = mergePlannerPolicy(options.plannerPolicy);
    this.readerEvent = options.onEvent;
    // Copy the catalog so one reader owns later dynamic registrations without
    // mutating the application-level configuration shared by other readers.
    this.themeRegistry = new ReaderThemeRegistry(extensions.themeCatalog.list());
    this.inputMap = extensions.inputMap;
    this.markStore = options.markStore ?? new MemoryReaderMarkStore();

    const xmlPlatform = new BrowserDomXmlPlatform(container.ownerDocument);
    const contentPipeline = new PublicationContentDocumentPipeline(resources, xmlPlatform);
    this.contentDocumentCache = new PublicationContentDocumentCache(contentPipeline, {
      policy: options.contentDocumentCachePolicy,
      preferredSpineIndex: () => this.pendingNavigationLocator?.spineIndex ?? this.locator?.spineIndex ?? null,
    });

    this.host = new RendererHost(createReadingRendererFactories({
      container,
      publication,
      contentDocumentCache: this.contentDocumentCache,
      plannerPolicy: this.plannerPolicy,
      themeResolver: this.themeRegistry,
      onDiagnostics: next => this.appendDiagnostics(next, this.options),
      contentHintsForSpine: spineIndex => this.hints.get(spineIndex),
      onPresentationHints: (spineIndex, hints) => {
        this.hints.set(spineIndex, mergeHints(this.hints.get(spineIndex), hints));
      },
    }));

    const plans: NavigationPlanProvider = {
      planForSpine: spineIndex => this.planForSpine(spineIndex),
    };
    this.navigator = new ReaderNavigator(publication, this.host, plans);

    const searchProvider = new BrowserPublicationSearchProvider(
      publication,
      contentPipeline,
    );
    const publicationSearch = new PublicationSearch(publication, searchProvider, {
      cache: options.searchCachePolicy,
      cacheVariant: contentPipeline.analysisSignature,
      preferredSpineIndex: () => this.locator?.spineIndex ?? this.host.state.plan?.spineIndex ?? null,
    });
    this.searchController = new ReaderSearchController(
      publicationSearch,
      this.navigator,
    );
    this.markController = new ReaderMarkController(this.markStore, this.host, this.navigator);
    this.decorations = new ReaderDecorationController(publication, this.host, this.markStore, undefined, activation => {
      const mark = this.markStore.snapshot().marks.find(candidate => candidate.id === activation.decoration.id);
      if (!mark || mark.kind === 'bookmark' || !this.readerEvent) return false;
      const surfaceRect = activation.context.surfaceElement.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      const viewportWidth = activation.context.document.defaultView?.innerWidth || activation.context.surfaceElement.clientWidth || surfaceRect.width;
      const viewportHeight = activation.context.document.defaultView?.innerHeight || activation.context.surfaceElement.clientHeight || surfaceRect.height;
      this.readerEvent({
        type: 'mark-activated',
        activation: {
          mark,
          anchor: {
            x: surfaceRect.left - containerRect.left + activation.clientX * surfaceRect.width / Math.max(1, viewportWidth),
            y: surfaceRect.top - containerRect.top + activation.clientY * surfaceRect.height / Math.max(1, viewportHeight),
          },
          returnFocus: activation.context.surfaceElement,
        },
      });
      return true;
    });

    const inputController = new ReaderInputController({
      // Keys, taps and the wheel go through the reader's own navigation, not
      // straight to the navigator. The reader is what records the new position
      // and republishes the snapshot; reaching past it moved the page but left
      // every position readout showing where the reader used to be.
      navigator: {
        next: () => this.next(),
        previous: () => this.previous(),
      },
      hostCommand: command => {
        if (this.selection) this.clearSelection();
        options.onCommand?.(command);
      },
      historyBack: async () => { await this.back(); },
      historyForward: async () => { await this.forward(); },
      stepFont: delta => this.stepFont(delta),
    });
    this.inputRouter = new BrowserReaderInputRouter(
      container,
      () => this.inputState(),
      inputController,
      options.inputPolicy,
      error => this.publishError(error),
      this.inputMap,
    );
    this.linkRouter = new PublicationLinkRouter(publication, this.navigator, {
      onExternalLink: options.onExternalLink,
      onUnresolvedPublicationLink: options.onUnresolvedPublicationLink,
      onFootnoteLink: async activation => {
        if (!this.readerEvent) return false;
        const footnote = await loadPublicationFootnote(
          this.resources.resolver,
          this.container.ownerDocument,
          activation.href,
          activation.label,
        );
        if (!footnote || this.disposed) return false;
        this.readerEvent({ type: 'footnote-activated', footnote, trigger: activation.trigger });
        return true;
      },
    }, href => this.goToWithHistory({ kind: 'href', href }));
    this.selectionRouter = new BrowserReaderSelectionRouter(
      publication,
      container,
      activation => {
        this.selection = activation?.selection ?? null;
        this.readerEvent?.({ type: 'selection-changed', activation });
      },
    );
    this.mediaRouter = new BrowserPublicationMediaRouter(activation => {
      if (this.readerEvent) this.readerEvent({ type: 'image-activated', activation });
    });
    this.selectionPollTimer = container.ownerDocument.defaultView?.setInterval(() => {
      if (!this.disposed && container.ownerDocument.visibilityState !== 'hidden') {
        this.selectionRouter.pollDocuments(this.host.contentDocuments);
      }
    }, 400) ?? null;

    this.snapshotValue = this.buildSnapshot('opening', null);

    this.cleanups.push(this.host.onStateChange(state => {
      this.syncLiveDocuments();
      if (state.plan) {
        const progression = state.layout?.progression;
        if (progression != null) {
          const pending = this.pendingNavigationLocator;
          this.locator = pending?.spineIndex === state.plan.spineIndex && pending.href === state.plan.href
            ? { ...pending, locations: { ...pending.locations, progression } }
            : mergeApproximateLocator(this.locator, state.plan.spineIndex, state.plan.href, progression);
        }
      }
      this.publish(state.status === 'error' ? 'error' : state.status === 'disposed' ? 'disposed' : state.status === 'ready' ? 'ready' : 'opening', state.error);
    }));
    this.cleanups.push(this.searchController.onChange(state => {
      const current = state.index >= 0 ? state.hits[state.index]?.id ?? null : null;
      this.decorations.setSearchHits(state.hits, current);
      this.publish(this.snapshotValue.status, this.snapshotValue.error);
    }));
    this.cleanups.push(this.markStore.subscribe(() => {
      this.publish(this.snapshotValue.status, this.snapshotValue.error);
    }));

    this.search = Object.freeze<BrowserEpubReaderSearchApi>({
      run: async (query: string, searchOptions: Partial<SearchOptions> = {}) => {
        const result = await this.searchController.run(query, searchOptions);
        return result.hits;
      },
      clear: () => this.searchController.clear(),
      clearCache: () => this.searchController.clearCache(),
      goTo: async index => {
        return this.searchWithHistory(() => this.searchController.goToHit(index));
      },
      next: async () => {
        return this.searchWithHistory(() => this.searchController.next());
      },
      previous: async () => {
        return this.searchWithHistory(() => this.searchController.previous());
      },
    });

    this.marks = Object.freeze<BrowserEpubReaderMarksApi>({
      addBookmark: label => addBookmarkAndNotify(
        nextLabel => this.markController.addBookmark(nextLabel),
        label,
        options.onEvent,
      ),
      addHighlight: (range, highlight, color, label, tags) => this.markController.addHighlight(range, highlight, color, label, tags),
      addAnnotation: (range, body, highlight, color, label, tags) => this.markController.addAnnotation(range, body, highlight, color, label, tags),
      remove: id => this.markStore.remove(id),
      update: (id, patch) => this.markController.update(id, patch),
      clear: () => this.markStore.clear(),
      goTo: async id => {
        const mark = this.markStore.snapshot().marks.find(candidate => candidate.id === id);
        if (!mark) return false;
        const origin = await this.currentHistoryLocator();
        await this.markController.goToMark(mark as ReaderMark);
        this.locator = mark.kind === 'bookmark' ? mark.locator : mark.range.start;
        this.navigationHistory.record(origin, this.locator);
        this.publish(this.snapshotValue.status, this.snapshotValue.error);
        return true;
      },
    });
  }

  static async open(
    source: Uint8Array | ArrayBuffer,
    container: HTMLElement,
    options: BrowserEpubReaderOptions = {},
  ): Promise<BrowserEpubReader> {
    assertUsableContainer(container);
    throwIfAborted(options.signal);
    const preferences = normalizeReaderPreferences({
      ...DEFAULT_READER_PREFERENCES,
      ...options.preferences,
      compatibility: {
        ...DEFAULT_READER_PREFERENCES.compatibility,
        ...options.preferences?.compatibility,
      },
    });
    const extensions = options.extensions ?? configureReaderExtensions();
    const compatibilityProfile = createReaderCompatibilityProfile(
      preferences.compatibility,
      extensions.compatibilityModules,
    );
    reportOpenProgress(options, 'archive', 'Opening EPUB container', 1);
    const opened = await OcfZipArchive.open(
      source,
      options.archiveLimits,
      options.compatibilityMode ?? (preferences.compatibility.recoverContainerStructure ? 'compatible' : 'strict'),
    );
    throwIfAborted(options.signal);
    if (!opened.archive) {
      throw new BrowserEpubReaderOpenError('The EPUB container could not be opened.', opened.diagnostics);
    }
    reportOpenProgress(options, 'package', 'Reading publication metadata', 2);
    const loaded = await loadPublicationFromArchive(opened.archive, opened.diagnostics, {
      controlDocumentLimits: options.controlDocumentLimits,
      compatibilityProfile,
    });
    throwIfAborted(options.signal);
    if (!loaded.publication) {
      throw new BrowserEpubReaderOpenError('The EPUB package could not be parsed.', loaded.diagnostics);
    }
    const initial = resolveInitialLocator(loaded.publication, options);
    const contentPreflight = new PublicationContentPreflightSession(
      opened.archive,
      loaded.publication,
      options.signal,
      compatibilityProfile,
    );
    let reader: BrowserEpubReader | null = null;
    try {
      const initialWindow = preflightWindowIndexes(loaded.publication, initial.spineIndex);
      reportOpenProgress(options, 'preflight', `Inspecting ${initialWindow.length} render-critical reading sections`, 3);
      const preflight = await contentPreflight.inspect(initialWindow);
      throwIfAborted(options.signal);
      reportOpenProgress(options, 'resources', 'Preparing publication resources', 4);
      const resource = await ResourceResolver.create(
        opened.archive,
        loaded.publication,
        compatibilityProfile,
        options.resourcePolicy,
      );
      throwIfAborted(options.signal);
      const resources = new PublicationResourceSession(resource.resolver, new BrowserObjectUrlFactory());
      const diagnostics = [...loaded.diagnostics, ...preflight.diagnostics, ...resource.diagnostics];
      const viewport = measureViewport(container);
      reader = new BrowserEpubReader(
        loaded.publication,
        container,
        resources,
        contentPreflight,
        diagnostics,
        preflight.hints,
        preferences,
        viewport,
        compatibilityProfile,
        extensions,
        options,
      );

      reportOpenProgress(options, 'rendition', 'Laying out the first section', 5);
      await reader.goToLocator(initial);
      throwIfAborted(options.signal);
      contentPreflight.detachParentSignal();
      reader.publish('ready', null);
      reader.startBackgroundPreflight();
      return reader;
    } catch (error) {
      if (reader) reader.dispose();
      else contentPreflight.dispose();
      throw error;
    }
  }

  get snapshot(): BrowserEpubReaderSnapshot {
    return this.snapshotValue;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.assertAlive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async next(): Promise<ReaderNavigationResult> {
    this.assertAlive();
    const result = await this.navigator.next();
    if (result.status === 'moved') this.locator = result.locator;
    this.publish(this.snapshotValue.status, this.snapshotValue.error);
    if (result.status === 'boundary') this.readerEvent?.({ type: 'navigation-boundary', edge: result.edge });
    return result;
  }

  async previous(): Promise<ReaderNavigationResult> {
    this.assertAlive();
    const result = await this.navigator.previous();
    if (result.status === 'moved') this.locator = result.locator;
    this.publish(this.snapshotValue.status, this.snapshotValue.error);
    if (result.status === 'boundary') this.readerEvent?.({ type: 'navigation-boundary', edge: result.edge });
    return result;
  }

  async goTo(target: NavigationTarget): Promise<Locator | null> {
    this.assertAlive();
    return this.goToWithHistory(target);
  }

  async back(): Promise<Locator | null> {
    this.assertAlive();
    return this.restoreHistory('back');
  }

  async forward(): Promise<Locator | null> {
    this.assertAlive();
    return this.restoreHistory('forward');
  }

  async goToLocator(locator: Locator): Promise<Locator | null> {
    this.assertAlive();
    return this.withPendingNavigation(locator, async () => {
      const restored = await this.navigator.goToLocator(locator);
      this.locator = restored ?? locator;
      this.publish(this.snapshotValue.status, this.snapshotValue.error);
      return restored;
    });
  }

  async setPreferences(patch: import('../../epub/publication').ReaderPreferencesPatch): Promise<void> {
    this.assertAlive();
    const next = normalizeReaderPreferences({
      ...this.preferences,
      ...patch,
      compatibility: {
        ...this.preferences.compatibility,
        ...patch.compatibility,
      },
    });
    if (samePreferences(this.preferences, next)) return;
    const previous = this.preferences;
    this.preferences = next;
    try {
      if (this.host.state.plan && renderPreferencesChanged(previous, next)) {
        await this.navigator.relayout(spreadChanged(previous, next) ? 'spread-change' : 'preferences');
      }
    } catch (error) {
      // The public snapshot must never claim a preference was applied when the
      // renderer rejected that transition. The host owns renderer rollback/error
      // state; the composition root owns preference-state rollback.
      if (this.preferences === next) this.preferences = previous;
      this.publish(this.snapshotValue.status, error);
      throw error;
    }
    this.publish(this.snapshotValue.status, this.snapshotValue.error);
  }

  async setViewport(viewport: ViewportMetrics): Promise<void> {
    this.assertAlive();
    const next = normalizeViewport(viewport);
    if (sameViewport(this.viewport, next)) return;
    const previous = this.viewport;
    this.viewport = next;
    try {
      if (this.host.state.plan) {
        await this.navigator.relayout('viewport-resize');
      }
    } catch (error) {
      // ResizeObserver can race with renderer work. Keep the externally visible
      // viewport aligned with the last successfully committed layout.
      if (this.viewport === next) this.viewport = previous;
      this.publish(this.snapshotValue.status, error);
      throw error;
    }
    this.decorations.refresh();
    this.publish(this.snapshotValue.status, this.snapshotValue.error);
  }

  async syncViewportFromElement(): Promise<void> {
    return this.setViewport(measureViewport(this.container));
  }

  captureSelection(): ReaderSelection | null {
    this.assertAlive();
    this.selection = captureSelectionFromDocuments(this.host.contentDocuments, this.publication);
    this.publish(this.snapshotValue.status, this.snapshotValue.error);
    return this.selection;
  }

  clearSelection(): void {
    this.selection = null;
    for (const context of this.host.contentDocuments) getDocumentSelection(context.document)?.removeAllRanges();
    this.publish(this.snapshotValue.status, this.snapshotValue.error);
  }

  async addHighlightFromSelection(
    highlight: import('../../features/annotations').AnnotationHighlightStyle = 'solid',
    color: import('../../features/annotations').AnnotationColor = 'yellow',
  ): Promise<import('../../features/annotations').Highlight | null> {
    const selection = this.captureSelection();
    if (!selection || selection.collapsed || !selection.text.trim()) return null;
    const mark = this.markController.addHighlight(selection.range, highlight, color);
    this.clearSelection();
    return mark;
  }

  async captureLocator(): Promise<Locator | null> {
    this.assertAlive();
    const locator = await this.host.captureLocator();
    if (locator) {
      this.locator = locator;
      this.publish(this.snapshotValue.status, this.snapshotValue.error);
    }
    return locator;
  }

  async registerTheme(theme: import('../../presentation/appearance').ReaderThemeDefinition): Promise<void> {
    this.assertAlive();
    const unregister = this.themeRegistry.register(theme);
    try {
      if (this.host.state.plan && this.preferences.theme === theme.id) {
        await this.navigator.relayout('preferences');
      }
    } catch (error) {
      unregister();
      throw error;
    }
    this.publish(this.snapshotValue.status, this.snapshotValue.error);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelBackgroundPreflight?.();
    this.cancelBackgroundPreflight = null;
    this.contentPreflight.dispose();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.inputRouter.dispose();
    this.linkRouter.dispose();
    if (this.selectionPollTimer != null) this.container.ownerDocument.defaultView?.clearInterval(this.selectionPollTimer);
    this.selectionRouter.dispose();
    this.mediaRouter.dispose();
    this.decorations.dispose();
    this.searchController.dispose();
    this.host.dispose();
    this.contentDocumentCache.dispose();
    this.resources.dispose();
    this.snapshotValue = this.buildSnapshot('disposed', null);
    for (const listener of this.listeners) listener();
    this.listeners.clear();
  }

  private async planForSpine(spineIndex: number) {
    const preflight = await this.contentPreflight.inspect(preflightWindowIndexes(this.publication, spineIndex));
    this.applyContentPreflight(preflight, false);
    return this.buildPlanForSpine(spineIndex);
  }

  private buildPlanForSpine(spineIndex: number) {
    const spineItem = this.publication.spine[spineIndex];
    if (!spineItem) throw new RangeError(`Spine index ${spineIndex} is outside the publication reading order.`);
    const contentHints = this.hints.get(spineIndex);
    const compatibility = runRenditionCompatibilityPolicies(
      this.compatibilityProfile.renditionPolicies,
      {
        publication: this.publication,
        spineItem,
        contentHints,
        preferences: this.preferences,
      },
      { fitSingleImagePage: false },
    );
    return planRendition({
      publication: this.publication,
      spineItem,
      viewport: this.viewport,
      preferences: this.preferences,
      contentHints,
      policy: this.plannerPolicy,
      compatibility: compatibility.value,
      compatibilityDiagnostics: compatibility.diagnostics,
    });
  }

  private inputState(): import('../../interaction/input').ReaderInputState {
    const plan = this.host.state.plan;
    return {
      enabled: !this.disposed && this.host.state.status === 'ready',
      pageProgression: plan?.pageProgression.value ?? 'ltr',
      contentKind: plan?.renderer === 'fixed-layout' ? 'fixed-layout' : 'reflowable',
      presentation: plan && (plan.overflow.value === 'scrolled-doc' || plan.overflow.value === 'scrolled-continuous')
        ? 'scrolled'
        : 'paginated',
      wheelBoundaryNavigation: plan?.renderer === 'fixed-layout',
      touchNavigation: this.preferences.touchNavigation,
      pageTurnZonePercent: this.preferences.pageTurnZonePercent,
    };
  }

  private syncLiveDocuments(): void {
    const documents = this.host.contentDocuments;
    this.inputRouter?.syncDocuments(documents);
    this.linkRouter?.syncDocuments(documents);
    this.selectionRouter?.syncDocuments(documents);
    this.mediaRouter?.syncDocuments(documents.filter(context => this.buildPlanForSpine(context.spineIndex).renderer !== 'fixed-layout'));
  }

  private async goToWithHistory(target: NavigationTarget): Promise<Locator | null> {
    const origin = await this.currentHistoryLocator();
    const requested = 'kind' in target
      ? target.kind === 'href' ? locatorFromHref(this.publication, target.href) : locatorFromCfi(this.publication, target.cfi)
      : target;
    return this.withPendingNavigation(requested, async () => {
      const locator = await this.navigator.goTo(target);
      this.locator = locator;
      this.navigationHistory.record(origin, locator);
      this.publish(this.snapshotValue.status, this.snapshotValue.error);
      return locator;
    });
  }

  private async withPendingNavigation<T>(locator: Locator, operation: () => Promise<T>): Promise<T> {
    this.pendingNavigationLocator = locator;
    try {
      return await operation();
    } finally {
      if (this.pendingNavigationLocator === locator) this.pendingNavigationLocator = null;
    }
  }

  private async searchWithHistory(operation: () => Promise<import('../../features/search').SearchHit | null>): Promise<import('../../features/search').SearchHit | null> {
    const origin = await this.currentHistoryLocator();
    const hit = await operation();
    if (hit) {
      this.locator = hit.range.start;
      this.navigationHistory.record(origin, this.locator);
    }
    this.publish(this.snapshotValue.status, this.snapshotValue.error);
    return hit;
  }

  private async restoreHistory(direction: 'back' | 'forward'): Promise<Locator | null> {
    const target = direction === 'back'
      ? this.navigationHistory.peekBack()
      : this.navigationHistory.peekForward();
    if (!target) return null;
    const current = await this.currentHistoryLocator();
    const restored = await this.navigator.goToLocator(target);
    this.locator = restored ?? target;
    if (direction === 'back') this.navigationHistory.commitBack(current);
    else this.navigationHistory.commitForward(current);
    this.publish(this.snapshotValue.status, this.snapshotValue.error);
    return this.locator;
  }

  private async currentHistoryLocator(): Promise<Locator | null> {
    return await this.host.captureLocator() ?? this.locator;
  }

  private stepFont(delta: 1 | -1): Promise<void> {
    const step = delta > 0 ? 10 : -10;
    return this.setPreferences({ fontSizePercent: this.preferences.fontSizePercent + step });
  }

  private appendDiagnostics(next: readonly PublicationDiagnostic[], options: BrowserEpubReaderOptions): void {
    if (next.length === 0) return;
    const unique = this.diagnostics.append(next);
    if (unique.length === 0) return;
    options.onDiagnostics?.(unique);
    this.publish(this.snapshotValue.status, this.snapshotValue.error);
  }

  private startBackgroundPreflight(): void {
    if (this.disposed || this.cancelBackgroundPreflight) return;
    const run = () => {
      this.cancelBackgroundPreflight = null;
      void this.contentPreflight.inspect().then(
        result => {
          if (!this.disposed) this.applyContentPreflight(result, true);
        },
        error => {
          if (this.disposed || isAbortError(error)) return;
          this.appendDiagnostics([{
            code: 'CONTENT_PREFLIGHT_BACKGROUND_FAILED',
            severity: 'warning',
            phase: 'content',
            message: 'Background content preflight stopped unexpectedly; renderer-side inspection remains available.',
            cause: error,
          }], this.options);
        },
      );
    };
    const view = this.container.ownerDocument.defaultView;
    if (!view) {
      run();
      return;
    }
    if (typeof view.requestIdleCallback === 'function') {
      const handle = view.requestIdleCallback(run, { timeout: 250 });
      this.cancelBackgroundPreflight = () => view.cancelIdleCallback(handle);
      return;
    }
    const handle = view.setTimeout(run, 0);
    this.cancelBackgroundPreflight = () => view.clearTimeout(handle);
  }

  private applyContentPreflight(result: PublicationContentPreflightResult, complete: boolean): void {
    let hintsChanged = false;
    for (const [spineIndex, hints] of result.hints) {
      const current = this.hints.get(spineIndex);
      // Renderer-computed presentation is more authoritative than the static
      // CSS subset, while preflight still fills page/viewport fields the live
      // renderer does not report.
      const merged = mergeHints(hints, current ?? {});
      if (!sameContentHints(current, merged)) hintsChanged = true;
      this.hints.set(spineIndex, merged);
    }
    const previousPresentation = this.presentation;
    if (complete) this.presentation = resolvePublicationPresentation(this.publication, this.hints);
    const unique = this.diagnostics.append(result.diagnostics);
    if (unique.length > 0) this.options.onDiagnostics?.(unique);
    if (hintsChanged || unique.length > 0 || previousPresentation !== this.presentation) {
      this.publish(this.snapshotValue.status, this.snapshotValue.error);
    }
  }

  private publishError(error: unknown): void {
    // Input/host-callback failures are operational errors, not evidence that the
    // active publication can no longer render. Preserve the current lifecycle status.
    this.publish(this.snapshotValue.status, error);
  }

  private publish(status: BrowserEpubReaderSnapshot['status'], error: unknown | null): void {
    if (this.disposed && status !== 'disposed') return;
    this.snapshotValue = this.buildSnapshot(status, error);
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(status: BrowserEpubReaderSnapshot['status'], error: unknown | null): BrowserEpubReaderSnapshot {
    const renderer = this.host?.state ?? emptyRendererState();
    const accessibility = describeReaderPosition(this.publication, { locator: this.locator, layout: renderer.layout });
    return Object.freeze({
      status,
      publication: this.publication,
      presentation: this.presentation,
      diagnostics: Object.freeze([...this.diagnostics.all]),
      compatibility: createCompatibilityReport(this.diagnostics.all),
      preferences: this.preferences,
      viewport: this.viewport,
      renderer,
      locator: this.locator,
      navigationHistory: this.navigationHistory.snapshot,
      search: this.searchController?.state ?? emptySearchState(),
      marks: this.markStore?.snapshot() ?? { revision: 0, marks: [] },
      selection: this.selection,
      accessibility,
      appearance: Object.freeze({ themes: this.themeRegistry.list() }),
      input: this.inputMap.description,
      error,
    });
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('BrowserEpubReader has been disposed.');
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException('EPUB open aborted.', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function preflightWindowIndexes(publication: Publication, spineIndex: number): readonly number[] {
  const indexes: number[] = [];
  for (let index = spineIndex - 1; index <= spineIndex + 1; index += 1) {
    if (publication.spine[index]) indexes.push(index);
  }
  return indexes;
}

function sameContentHints(a: ContentPresentationHints | undefined, b: ContentPresentationHints): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b);
}

function reportOpenProgress(
  options: BrowserEpubReaderOptions,
  phase: BrowserEpubReaderOpenProgress['phase'],
  label: string,
  completed: number,
): void {
  options.onOpenProgress?.({ phase, label, completed, total: 5 });
}

function resolveInitialLocator(
  publication: import('../../epub/publication').Publication,
  options: BrowserEpubReaderOptions,
): Locator {
  if (options.initialLocator) return options.initialLocator;
  let index = options.initialSpineIndex;
  if (index == null) index = publication.spine.find(item => item.linear)?.index ?? 0;
  if (!publication.spine[index]) throw new RangeError(`Initial spine index ${index} is outside the publication.`);
  return locatorAtResourceStart(publication, index);
}

/**
 * Measured viewports are floored to whole pixels.
 *
 * `getBoundingClientRect()` reports sub-pixel sizes, but the page geometry
 * derived from it is written into the content document as literal pixel widths
 * and multiplied by the page index to reach page N. A fractional page extent
 * therefore drifts against the browser's own integer-rounded iframe viewport,
 * a little more with every page, until the trailing column of a page is sliced.
 *
 * Flooring rather than rounding keeps the declared page no wider than the space
 * that actually exists, so the error can only ever leave a sliver unused; a page
 * one pixel too wide would clip its own last column instead.
 */
function measureViewport(container: HTMLElement): ViewportMetrics {
  const rect = container.getBoundingClientRect();
  return normalizeViewport({
    width: Math.max(1, Math.floor(rect.width || container.clientWidth)),
    height: Math.max(1, Math.floor(rect.height || container.clientHeight)),
  });
}

function normalizeViewport(viewport: ViewportMetrics): ViewportMetrics {
  if (!Number.isFinite(viewport.width) || viewport.width <= 0 || !Number.isFinite(viewport.height) || viewport.height <= 0) {
    throw new RangeError('Reader viewport width and height must both be positive finite numbers.');
  }
  return Object.freeze({ width: viewport.width, height: viewport.height });
}

function assertUsableContainer(container: HTMLElement): void {
  if (!container?.ownerDocument) throw new TypeError('BrowserEpubReader requires a live HTMLElement container.');
  measureViewport(container);
}

function mergePlannerPolicy(input: BrowserEpubReaderOptions['plannerPolicy']): RenditionPlannerPolicy {
  return {
    ...DEFAULT_RENDITION_PLANNER_POLICY,
    ...input,
    syntheticSpreads: {
      ...DEFAULT_RENDITION_PLANNER_POLICY.syntheticSpreads,
      ...input?.syntheticSpreads,
    },
  };
}

function mergeHints(previous: ContentPresentationHints | undefined, next: ContentPresentationHints): ContentPresentationHints {
  return { ...previous, ...next };
}

/**
 * Publication-level presentation. Only fully pre-paginated publications get the
 * immersive treatment: a mixed publication that switched chrome on its
 * illustration pages would restyle its whole interface several times per
 * chapter, which reads as the reader itself changing rather than the book.
 */
function resolvePublicationPresentation(
  publication: Publication,
  hints: ReadonlyMap<number, ContentPresentationHints>,
): ReaderPublicationPresentation {
  const layout = resolvePublicationLayoutProfile(publication);
  return Object.freeze({
    layout,
    writingMode: dominantWritingMode(publication, hints),
    chrome: layout === 'fixed-layout' ? 'immersive' : 'standard',
  });
}

/**
 * Vertical publications routinely leave a horizontal colophon or copyright page
 * in the spine, so a single dissenting document must not decide the answer.
 */
function dominantWritingMode(
  publication: Publication,
  hints: ReadonlyMap<number, ContentPresentationHints>,
): WritingMode {
  const tally = new Map<WritingMode, number>();
  for (const item of publication.spine) {
    if (resolveSpineRendition(publication, item).layout === 'pre-paginated') continue;
    const mode = hints.get(item.index)?.writingMode;
    if (mode) tally.set(mode, (tally.get(mode) ?? 0) + 1);
  }

  let best: WritingMode = 'horizontal-tb';
  let bestCount = 0;
  for (const [mode, count] of tally) {
    if (count > bestCount) {
      best = mode;
      bestCount = count;
    }
  }
  return best;
}

function sameViewport(a: ViewportMetrics, b: ViewportMetrics): boolean {
  return a.width === b.width && a.height === b.height;
}

function samePreferences(a: ReaderPreferences, b: ReaderPreferences): boolean {
  return a.flow === b.flow
    && a.spread === b.spread
    && a.pageProgression === b.pageProgression
    && a.fontSizePercent === b.fontSizePercent
    && a.fontFamily === b.fontFamily
    && a.lineHeight === b.lineHeight
    && a.pageMarginPercent === b.pageMarginPercent
    && a.fixedLayoutFit === b.fixedLayoutFit
    && a.fixedLayoutGutter === b.fixedLayoutGutter
    && a.touchNavigation === b.touchNavigation
    && a.pageTurnZonePercent === b.pageTurnZonePercent
    && sameCompatibilityPreferences(a, b)
    && a.theme === b.theme;
}

function renderPreferencesChanged(a: ReaderPreferences, b: ReaderPreferences): boolean {
  return a.flow !== b.flow
    || a.spread !== b.spread
    || a.pageProgression !== b.pageProgression
    || a.fontSizePercent !== b.fontSizePercent
    || a.fontFamily !== b.fontFamily
    || a.lineHeight !== b.lineHeight
    || a.pageMarginPercent !== b.pageMarginPercent
    || a.fixedLayoutFit !== b.fixedLayoutFit
    || a.fixedLayoutGutter !== b.fixedLayoutGutter
    || a.theme !== b.theme;
}

function sameCompatibilityPreferences(a: ReaderPreferences, b: ReaderPreferences): boolean {
  return a.compatibility.recoverContainerStructure === b.compatibility.recoverContainerStructure
    && a.compatibility.selectPreferredRootfile === b.compatibility.selectPreferredRootfile
    && a.compatibility.recoverMalformedXhtml === b.compatibility.recoverMalformedXhtml
    && a.compatibility.useLegacyNavigationFallback === b.compatibility.useLegacyNavigationFallback
    && a.compatibility.normalizeLegacyCss === b.compatibility.normalizeLegacyCss
    && a.compatibility.fitSingleImagePages === b.compatibility.fitSingleImagePages
    && a.compatibility.deobfuscateIdpfFonts === b.compatibility.deobfuscateIdpfFonts;
}

function spreadChanged(a: ReaderPreferences, b: ReaderPreferences): boolean {
  return a.spread !== b.spread;
}

function mergeApproximateLocator(
  previous: Locator | null,
  spineIndex: number,
  href: string,
  progression: number,
): Locator {
  if (previous?.spineIndex === spineIndex && previous.href === href) {
    return { ...previous, locations: { ...previous.locations, progression } };
  }
  return { spineIndex, href, locations: { progression } };
}

function emptyRendererState(): import('../../presentation/renderer').RendererHostState {
  return { status: 'idle', generation: 0, plan: null, rendererKind: null, layout: null, stability: null, error: null };
}

function emptySearchState(): import('../../features/search').ReaderSearchState {
  return { query: '', hits: [], index: -1, searching: false, truncated: false, diagnostics: [], error: null };
}
