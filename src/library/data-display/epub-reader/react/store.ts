import { BrowserEpubReader, BrowserEpubReaderOpenError, MemoryReaderMarkStore, type BrowserEpubReaderOptions, type BrowserEpubReaderSnapshot, type Locator, type NavigationTarget, type ReaderPreferences, type SearchOptions } from '../core';
import type { EpubSource, ReactEpubReaderSnapshot, UseEpubReaderOptions } from './model';
import {
  BrowserReadingSessionStorage,
  readingSessionKey,
  type ReadingSessionRecord,
  type ReadingSessionStorage,
} from './reading-session';

type Listener = () => void;

export type ReactEpubReaderOpener = typeof BrowserEpubReader.open;

/**
 * React-facing external store. It owns async open/swap races and a viewport
 * ResizeObserver, but it contains no React imports. This makes lifecycle tests
 * deterministic and keeps hooks as a very thin subscription adapter.
 */
export class ReactEpubReaderStore {
  constructor(private readonly openReader: ReactEpubReaderOpener = BrowserEpubReader.open) {}

  private readonly listeners = new Set<Listener>();
  private container: HTMLDivElement | null = null;
  private reader: BrowserEpubReader | null = null;
  private unsubscribeReader: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private viewportDetachTicket = 0;
  private source: EpubSource | null = null;
  private options: UseEpubReaderOptions = {};
  private generation = 0;
  private retainCount = 0;
  private disposeTicket = 0;
  private disposed = false;
  private readingSessionStorage: ReadingSessionStorage | null = null;
  private readingSessionKey: string | null = null;
  private readingSessionPersistPreferences = true;
  private readingSessionCleared = false;
  private readingSessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private openAbortController: AbortController | null = null;
  private snapshotValue: ReactEpubReaderSnapshot = Object.freeze({ status: 'idle', reader: null, diagnostics: [], error: null });

  get snapshot(): ReactEpubReaderSnapshot { return this.snapshotValue; }
  get activeReader(): BrowserEpubReader | null { return this.reader; }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ReactEpubReaderSnapshot => this.snapshotValue;
  getServerSnapshot = (): ReactEpubReaderSnapshot => SERVER_SNAPSHOT;

  /** StrictMode-safe lifecycle lease: the final release disposes in a microtask. */
  retain(): () => void {
    this.assertAlive();
    this.retainCount += 1;
    const ticket = ++this.disposeTicket;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.retainCount = Math.max(0, this.retainCount - 1);
      queueMicrotask(() => {
        if (this.disposed || this.retainCount !== 0 || ticket !== this.disposeTicket) return;
        this.dispose();
      });
    };
  }

  setSource(source: EpubSource, options: UseEpubReaderOptions = {}): void {
    this.assertAlive();
    if (this.source === source) {
      this.options = options;
      return;
    }
    this.source = source;
    this.options = options;
    void this.reopen();
  }

  attachViewport(element: HTMLDivElement | null): void {
    this.assertAlive();

    if (!element) {
      const detached = this.container;
      if (!detached) return;
      const ticket = ++this.viewportDetachTicket;
      // React StrictMode intentionally replays callback refs in development.
      // Defer destructive teardown by one microtask so null → same-node replay
      // does not close and reopen a large publication session. A real detach
      // still tears down before the next task.
      queueMicrotask(() => {
        if (this.disposed || ticket !== this.viewportDetachTicket || this.container !== detached) return;
        this.detachResizeObserver();
        this.container = null;
        this.closeReader();
        this.publish({ status: this.source ? 'loading' : 'idle', reader: null, diagnostics: [], error: null });
      });
      return;
    }

    ++this.viewportDetachTicket;
    if (this.container === element) return;
    this.detachResizeObserver();
    this.container = element;
    this.resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => this.scheduleResize())
      : null;
    this.resizeObserver?.observe(element);
    void this.reopen();
  }

  next() { return this.requireReader().next(); }
  async retry(): Promise<void> {
    this.assertAlive();
    if (!this.source || !this.container) return;
    return this.reopen();
  }
  previous() { return this.requireReader().previous(); }
  async goTo(target: NavigationTarget): Promise<Locator | null> { return this.requireReader().goTo(target); }
  async goToLocator(locator: Locator): Promise<Locator | null> { return this.requireReader().goToLocator(locator); }
  async historyBack(): Promise<Locator | null> { return this.requireReader().back(); }
  async historyForward(): Promise<Locator | null> { return this.requireReader().forward(); }
  async setPreferences(patch: Partial<ReaderPreferences>): Promise<void> { return this.requireReader().setPreferences(patch); }
  captureLocator() { return this.requireReader().captureLocator(); }
  registerTheme(theme: import('../core').ReaderThemeDefinition): void { this.requireReader().registerTheme(theme); }
  captureSelection() { return this.requireReader().captureSelection(); }
  clearSelection(): void { this.requireReader().clearSelection(); }
  clearReadingSession(): void {
    if (this.readingSessionStorage && this.readingSessionKey) {
      this.readingSessionStorage.remove(this.readingSessionKey);
    }
    if (this.readingSessionSaveTimer != null) clearTimeout(this.readingSessionSaveTimer);
    this.readingSessionSaveTimer = null;
    this.readingSessionCleared = true;
  }
  addHighlightFromSelection(highlight?: import('../core').AnnotationHighlightStyle, color?: import('../core').AnnotationColor) {
    return this.requireReader().addHighlightFromSelection(highlight, color);
  }
  searchRun(query: string, options?: Partial<SearchOptions>) { return this.requireReader().search.run(query, options); }
  searchClear(): void { this.requireReader().search.clear(); }
  searchGoTo(index: number) { return this.requireReader().search.goTo(index); }
  searchNext() { return this.requireReader().search.next(); }
  searchPrevious() { return this.requireReader().search.previous(); }
  addBookmark(label?: string) { return this.requireReader().marks.addBookmark(label); }
  addHighlight(
    range: import('../core').LocatorRange,
    highlight?: import('../core').AnnotationHighlightStyle,
    color?: import('../core').AnnotationColor,
    label?: string,
    tags?: readonly string[],
  ) { return this.requireReader().marks.addHighlight(range, highlight, color, label, tags); }
  addAnnotation(
    range: import('../core').LocatorRange,
    body: string,
    highlight?: import('../core').AnnotationHighlightStyle,
    color?: import('../core').AnnotationColor,
    label?: string,
    tags?: readonly string[],
  ) { return this.requireReader().marks.addAnnotation(range, body, highlight, color, label, tags); }
  removeMark(id: string): boolean { return this.requireReader().marks.remove(id); }
  updateMark(id: string, patch: import('../core').ReaderMarkPatch) { return this.requireReader().marks.update(id, patch); }
  clearMarks(): void { this.requireReader().marks.clear(); }
  goToMark(id: string): Promise<boolean> { return this.requireReader().marks.goTo(id); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.detachResizeObserver();
    this.closeReader();
    this.publish({ status: 'disposed', reader: null, diagnostics: [], error: null });
    this.listeners.clear();
  }

  private async reopen(): Promise<void> {
    if (this.disposed || !this.source || !this.container) return;
    const element = this.container;
    const rect = element.getBoundingClientRect();
    const width = rect.width || element.clientWidth;
    const height = rect.height || element.clientHeight;
    // A React tree can attach the ref before layout has assigned its final size.
    // Wait for ResizeObserver rather than opening the engine with an invalid 0×0 viewport.
    if (!(width > 0 && height > 0)) {
      this.publish({ status: 'loading', reader: null, diagnostics: [], error: null });
      return;
    }

    const generation = ++this.generation;
    this.closeReader();
    const openController = new AbortController();
    const openSignal = combineAbortSignals(this.options.signal, openController.signal);
    this.openAbortController = openController;
    this.publish({ status: 'loading', reader: null, diagnostics: [], error: null });
    try {
      const bytes = await sourceBytes(this.source);
      if (this.disposed || generation !== this.generation || this.container !== element) return;
      const session = this.resolveReadingSession(this.source, bytes, element.ownerDocument.defaultView);
      const saved = session.storage?.load(session.key) ?? null;
      const restoredMarkStore = saved?.marks && !this.options.markStore
        ? createRestoredMarkStore(saved.marks)
        : undefined;
      this.readingSessionStorage = session.storage;
      this.readingSessionKey = session.storage ? session.key : null;
      this.readingSessionPersistPreferences = session.persistPreferences;
      this.readingSessionCleared = false;
      const readerOptions: BrowserEpubReaderOptions = {
        ...stripReactCallbacks(this.options),
        ...(saved && this.options.initialLocator == null ? { initialLocator: saved.locator } : {}),
        preferences: {
          ...(saved && session.persistPreferences ? saved.preferences ?? {} : {}),
          ...this.options.preferences,
        },
        ...(restoredMarkStore ? { markStore: restoredMarkStore } : {}),
        signal: openSignal,
        onOpenProgress: progress => {
          if (this.disposed || generation !== this.generation || openSignal.aborted) return;
          this.publish({ status: 'loading', reader: null, diagnostics: [], error: null, openProgress: progress });
          this.options.onOpenProgress?.(progress);
        },
        // Keep host callbacks live without reopening the publication when a
        // parent React component re-renders with new callback identities.
        onIntent: intent => this.options.onIntent?.(intent),
        onDiagnostics: diagnostics => this.options.onDiagnostics?.(diagnostics),
        onExternalLink: href => this.options.onExternalLink?.(href),
        onUnresolvedPublicationLink: href => this.options.onUnresolvedPublicationLink?.(href),
      };
      const reader = await this.openReader(bytes, element, readerOptions);
      if (this.disposed || generation !== this.generation || this.container !== element) {
        reader.dispose();
        return;
      }
      this.reader = reader;
      if (this.openAbortController === openController) this.openAbortController = null;
      this.unsubscribeReader = reader.subscribe(() => {
        if (this.reader !== reader) return;
        this.publish({ status: statusFromReader(reader.snapshot), reader: reader.snapshot, diagnostics: reader.snapshot.diagnostics, error: reader.snapshot.error });
        this.scheduleReadingSessionSave(reader.snapshot, session.saveDelayMs, session.persistPreferences);
      });
      this.publish({ status: 'ready', reader: reader.snapshot, diagnostics: reader.snapshot.diagnostics, error: null });
      this.scheduleReadingSessionSave(reader.snapshot, session.saveDelayMs, session.persistPreferences);
      this.options.onReady?.(reader.snapshot);
    } catch (error) {
      if (this.openAbortController === openController) this.openAbortController = null;
      if (openSignal.aborted) return;
      if (this.disposed || generation !== this.generation) return;
      this.publish({ status: 'error', reader: null, diagnostics: error instanceof BrowserEpubReaderOpenError ? error.diagnostics : [], error });
      this.options.onError?.(error);
    }
  }

  private scheduleResize(): void {
    if (!this.container || this.disposed) return;
    if (!this.reader) {
      // ResizeObserver can fire repeatedly while an open error is visible.
      // Keep the failure stable until the source/container changes or the user retries.
      if (this.snapshotValue.status === 'error') return;
      // The observer also delivers notifications while a slow publication is
      // still opening. Restarting here aborts that open and can create an
      // endless loop for layout-heavy books. A missing controller means the
      // store is only waiting for its previously zero-sized viewport to become
      // measurable, which is the one case where a resize should start opening.
      if (this.openAbortController) return;
      void this.reopen();
      return;
    }
    if (this.resizeFrame != null) return;
    const ownerWindow = this.container.ownerDocument.defaultView;
    const request = ownerWindow?.requestAnimationFrame?.bind(ownerWindow)
      ?? ((callback: FrameRequestCallback) => globalThis.setTimeout(() => callback(Date.now()), 16) as unknown as number);
    this.resizeFrame = request(() => {
      this.resizeFrame = null;
      const reader = this.reader;
      if (!reader) return;
      void reader.syncViewportFromElement().catch(error => {
        if (this.reader !== reader || this.disposed) return;
        // A resize/reflow failure is an operational error on an already-open
        // reader. Preserve the core lifecycle status instead of inventing a
        // React-only fatal state.
        this.publish({
          status: statusFromReader(reader.snapshot),
          reader: reader.snapshot,
          diagnostics: reader.snapshot.diagnostics,
          error,
        });
        this.options.onError?.(error);
      });
    });
  }

  private detachResizeObserver(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeFrame != null && this.container) {
      const ownerWindow = this.container.ownerDocument.defaultView;
      if (ownerWindow?.cancelAnimationFrame) ownerWindow.cancelAnimationFrame(this.resizeFrame);
      else clearTimeout(this.resizeFrame);
      this.resizeFrame = null;
    }
  }

  private closeReader(): void {
    this.openAbortController?.abort(new DOMException('Publication replaced or closed.', 'AbortError'));
    this.openAbortController = null;
    if (this.reader && !this.readingSessionCleared) this.saveReadingSession(this.reader.snapshot, this.readingSessionPersistPreferences);
    if (this.readingSessionSaveTimer != null) clearTimeout(this.readingSessionSaveTimer);
    this.readingSessionSaveTimer = null;
    this.unsubscribeReader?.();
    this.unsubscribeReader = null;
    this.reader?.dispose();
    this.reader = null;
    this.readingSessionStorage = null;
    this.readingSessionKey = null;
  }

  private resolveReadingSession(
    source: EpubSource,
    bytes: Uint8Array | ArrayBuffer,
    ownerWindow: Window | null,
  ): { storage: ReadingSessionStorage | null; key: string; persistPreferences: boolean; saveDelayMs: number } {
    const options = this.options.readingSession;
    if (options === false) return { storage: null, key: '', persistPreferences: false, saveDelayMs: 0 };
    let storage = options?.storage ?? null;
    if (!storage && ownerWindow) {
      try { storage = new BrowserReadingSessionStorage(ownerWindow.localStorage); } catch { storage = null; }
    }
    return {
      storage,
      key: options?.key?.trim() || readingSessionKey(source, bytes),
      persistPreferences: options?.persistPreferences !== false,
      saveDelayMs: Math.max(0, options?.saveDelayMs ?? 300),
    };
  }

  private scheduleReadingSessionSave(
    snapshot: BrowserEpubReaderSnapshot,
    delayMs: number,
    persistPreferences: boolean,
  ): void {
    if (!this.readingSessionStorage || !this.readingSessionKey || !snapshot.locator) return;
    this.readingSessionCleared = false;
    if (this.readingSessionSaveTimer != null) clearTimeout(this.readingSessionSaveTimer);
    this.readingSessionSaveTimer = setTimeout(() => {
      this.readingSessionSaveTimer = null;
      this.saveReadingSession(snapshot, persistPreferences);
    }, delayMs);
  }

  private saveReadingSession(snapshot: BrowserEpubReaderSnapshot, persistPreferences: boolean): void {
    if (!this.readingSessionStorage || !this.readingSessionKey || !snapshot.locator) return;
    const record: ReadingSessionRecord = {
      // Precise DOM/CFI channels are valuable for annotations, but an engine
      // snapshot can briefly retain an older text anchor while pagination has
      // already advanced. Session position follows the renderer's canonical
      // progression so reopening never jumps one page backwards.
      locator: progressionOnlyLocator(snapshot.locator, snapshot.renderer?.layout?.progression),
      ...(persistPreferences ? { preferences: snapshot.preferences } : {}),
      marks: (snapshot.marks?.marks ?? []).map(mark => mark.kind === 'bookmark'
        ? { ...mark, locator: progressionOnlyLocator(mark.locator) }
        : mark),
      updatedAt: new Date().toISOString(),
    };
    this.readingSessionStorage.save(this.readingSessionKey, record);
  }

  private requireReader(): BrowserEpubReader {
    if (!this.reader) throw new Error('EPUB reader is not ready.');
    return this.reader;
  }

  private publish(snapshot: ReactEpubReaderSnapshot): void {
    this.snapshotValue = Object.freeze(snapshot);
    for (const listener of this.listeners) listener();
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('ReactEpubReaderStore has been disposed.');
  }
}

function createRestoredMarkStore(marks: readonly import('../core').ReaderMark[]): MemoryReaderMarkStore {
  const store = new MemoryReaderMarkStore();
  for (const mark of marks) store.put(mark);
  return store;
}

function progressionOnlyLocator(locator: Locator, rendererProgression?: number): Locator {
  const progression = rendererProgression ?? locator.locations.progression ?? 0;
  return {
    href: locator.href,
    spineIndex: locator.spineIndex,
    locations: { progression: Math.max(0, Math.min(1, progression)) },
  };
}

function combineAbortSignals(external: AbortSignal | undefined, internal: AbortSignal): AbortSignal {
  if (!external) return internal;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([external, internal]);
  const controller = new AbortController();
  const abort = (signal: AbortSignal) => controller.abort(signal.reason);
  if (external.aborted) abort(external);
  else if (internal.aborted) abort(internal);
  else {
    external.addEventListener('abort', () => abort(external), { once: true });
    internal.addEventListener('abort', () => abort(internal), { once: true });
  }
  return controller.signal;
}

const SERVER_SNAPSHOT: ReactEpubReaderSnapshot = Object.freeze({ status: 'idle', reader: null, diagnostics: [], error: null });

async function sourceBytes(source: EpubSource): Promise<Uint8Array | ArrayBuffer> {
  if (source instanceof Uint8Array || source instanceof ArrayBuffer) return source;
  return source.arrayBuffer();
}

function stripReactCallbacks(options: UseEpubReaderOptions): BrowserEpubReaderOptions {
  const core = { ...options };
  delete core.onReady;
  delete core.onError;
  delete core.readingSession;
  return core;
}

function statusFromReader(snapshot: BrowserEpubReaderSnapshot): ReactEpubReaderSnapshot['status'] {
  if (snapshot.status === 'disposed') return 'disposed';
  if (snapshot.status === 'error') return 'error';
  if (snapshot.status === 'ready') return 'ready';
  return 'loading';
}
