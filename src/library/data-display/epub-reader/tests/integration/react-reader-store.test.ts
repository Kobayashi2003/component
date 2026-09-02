import { DEFAULT_READER_PREFERENCES, type BrowserEpubReader, type BrowserEpubReaderSnapshot, type Locator, type ReaderMark, type ReadingSessionRecord, type ReadingSessionStorage } from '../../core';
import { BrowserReadingSessionStorage } from '../../react/state/browser-reading-session-storage';
import { readingSessionKey } from '../../react/state/reading-session';
import { ReactEpubReaderStore, type ReactEpubReaderOpener } from '../../react/state/store';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`React reader store test failed: ${message}`);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

class FakeReader {
  disposed = false;
  readonly snapshot: BrowserEpubReaderSnapshot;
  constructor(readonly id: string, locator?: Locator, marks: readonly ReaderMark[] = []) {
    this.snapshot = {
      status: 'ready',
      publication: { metadata: { title: id } },
      locator: locator ?? null,
      preferences: DEFAULT_READER_PREFERENCES,
      marks: { revision: marks.length, marks },
      error: null,
    } as unknown as BrowserEpubReaderSnapshot;
  }
  subscribe(): () => void { return () => {}; }
  dispose(): void { this.disposed = true; }
}

class MemoryReadingSessionStorage implements ReadingSessionStorage {
  readonly records = new Map<string, ReadingSessionRecord>();
  load(key: string) { return this.records.get(key) ?? null; }
  save(key: string, record: ReadingSessionRecord) { this.records.set(key, record); }
  remove(key: string) { this.records.delete(key); }
}

async function main(): Promise<void> {
  // React Strict Mode can perform setup → cleanup → setup before the real
  // lifetime begins. A lifecycle lease must survive that replay.
  {
    const replay = new ReactEpubReaderStore(async () => { throw new Error('not opened'); });
    const releaseFirst = replay.retain();
    releaseFirst();
    const releaseSecond = replay.retain();
    await Promise.resolve();
    assert(String(replay.snapshot.status) !== 'disposed', 'StrictMode effect replay must not dispose a re-retained store');
    releaseSecond();
    await Promise.resolve();
    assert(String(replay.snapshot.status) === 'disposed', 'final lifecycle release must dispose the store');
  }

  // Cancelling the currently requested publication is different from silently
  // superseding an older generation. With no successor open to publish another
  // state, the store must leave its loading state when the host aborts it.
  {
    const external = new AbortController();
    const cancelled = new ReactEpubReaderStore(async (_source, _element, options) => {
      return await new Promise<BrowserEpubReader>((_resolve, reject) => {
        const signal = options?.signal;
        if (signal?.aborted) reject(signal.reason);
        else signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    });
    const cancelledContainer = {
      ownerDocument: { defaultView: null },
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
    } as unknown as HTMLDivElement;
    cancelled.setSource(new Uint8Array([7]), { signal: external.signal });
    cancelled.attachViewport(cancelledContainer);
    await Promise.resolve();
    assert(String(cancelled.snapshot.status) === 'loading', 'external-cancellation fixture must begin opening');
    external.abort(new DOMException('Host cancelled publication open.', 'AbortError'));
    await Promise.resolve();
    await Promise.resolve();
    assert(String(cancelled.snapshot.status) === 'idle', 'external cancellation must leave the store idle rather than permanently loading');
    cancelled.dispose();
  }

  // A host callback runs outside the publication lifecycle boundary. Its own
  // exception may be reported, but it must not turn a successfully opened and
  // still-live reader into a React-only fatal state.
  {
    const opened = new FakeReader('callback-safe');
    let reported: unknown = null;
    const callbackSafe = new ReactEpubReaderStore(async () => opened as unknown as BrowserEpubReader);
    const callbackContainer = {
      ownerDocument: { defaultView: null },
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
    } as unknown as HTMLDivElement;
    callbackSafe.setSource(new Uint8Array([6]), {
      onReady: () => { throw new Error('host onReady failed'); },
      onError: error => { reported = error; },
    });
    callbackSafe.attachViewport(callbackContainer);
    await Promise.resolve();
    await Promise.resolve();
    assert(String(callbackSafe.snapshot.status) === 'ready', 'onReady failure must not replace a successful reader with an error snapshot');
    assert(callbackSafe.activeReader === opened as unknown as BrowserEpubReader, 'onReady failure must retain the successfully opened reader instance');
    assert(reported instanceof Error && reported.message === 'host onReady failed', 'onReady failure should still be reported to the host error channel');
    callbackSafe.dispose();
  }

  // Open failures stay terminal until the user explicitly retries. This keeps
  // ResizeObserver/ref churn from turning one failure into an open loop.
  {
    let attempts = 0;
    const attemptedMalformedRecovery: boolean[] = [];
    const failing = new ReactEpubReaderStore(async (_source, _element, options) => {
      attempts += 1;
      attemptedMalformedRecovery.push(options?.preferences?.compatibility?.recoverMalformedXhtml ?? true);
      options?.onOpenProgress?.({ phase: 'preflight', label: 'Parsing invalid chapter', completed: 4, total: 5 });
      throw new Error('expected open failure');
    });
    const failedContainer = {
      ownerDocument: { defaultView: null },
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
    } as unknown as HTMLDivElement;
    failing.setSource(new Uint8Array([9]), {
      preferences: { compatibility: { recoverMalformedXhtml: false } },
    });
    failing.attachViewport(failedContainer);
    await Promise.resolve();
    await Promise.resolve();
    assert(String(failing.snapshot.status) === 'error', 'open failure must publish a stable error state');
    assert(attempts === 1, 'one source/container pair must make one automatic open attempt');
    assert(failing.snapshot.preferences?.compatibility.recoverMalformedXhtml === false, 'failed compatibility preferences must remain editable');
    await failing.setPreferences({ compatibility: DEFAULT_READER_PREFERENCES.compatibility });
    assert(String(failing.snapshot.preferences?.compatibility.recoverMalformedXhtml) === 'true', 'restore defaults must work without an active core reader');
    await failing.retry();
    assert(Number(attempts) === 2, 'explicit retry must make exactly one new open attempt');
    assert(attemptedMalformedRecovery.join(',') === 'false,true', 'retry must use compatibility preferences repaired from the error state');
    assert(String(failing.snapshot.status) === 'error', 'failed retry must return to error state');
    failing.dispose();
  }

  // ResizeObserver notifications during a slow open must not abort and restart
  // the same publication. Large vertical books can spend long enough in layout
  // stabilization for several notifications to arrive before the reader exists.
  {
    const gate = deferred<FakeReader>();
    let attempts = 0;
    let openSignal: AbortSignal | undefined;
    const slow = new ReactEpubReaderStore(async (_source, _element, options) => {
      attempts += 1;
      openSignal = options?.signal;
      return await gate.promise as unknown as BrowserEpubReader;
    });
    const slowContainer = {
      ownerDocument: { defaultView: null },
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
    } as unknown as HTMLDivElement;
    slow.setSource(new Uint8Array([8]));
    slow.attachViewport(slowContainer);
    await Promise.resolve();
    const triggerResize = (slow as unknown as { scheduleResize(): void }).scheduleResize.bind(slow);
    triggerResize();
    await new Promise<void>(resolve => setTimeout(resolve, 20));
    triggerResize();
    await new Promise<void>(resolve => setTimeout(resolve, 20));
    assert(attempts === 1, 'resize notifications must not restart an in-flight open');
    assert(!openSignal?.aborted, 'resize notifications must not abort an in-flight open');
    gate.resolve(new FakeReader('slow'));
    await Promise.resolve();
    await Promise.resolve();
    assert(String(slow.snapshot.status) === 'ready', 'slow open must be allowed to finish');
    slow.dispose();
  }

  // Reading sessions restore before the core reader opens and save the latest
  // durable locator without relying on React component lifetime.
  {
    const sessions = new MemoryReadingSessionStorage();
    const restored: Locator = { href: 'EPUB/c1.xhtml', spineIndex: 1, locations: { progression: 0.6 } };
    const bookmark: ReaderMark = {
      id: 'bookmark:fixture', kind: 'bookmark', locator: restored,
      createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    };
    sessions.save('fixture', {
      locator: restored,
      preferences: DEFAULT_READER_PREFERENCES,
      marks: [bookmark],
      updatedAt: new Date(0).toISOString(),
    });
    let receivedLocator: Locator | undefined;
    let restoredMarkCount = 0;
    const persistent = new ReactEpubReaderStore(async (_source, _element, options) => {
      receivedLocator = options?.initialLocator;
      restoredMarkCount = options?.markStore?.snapshot().marks.length ?? 0;
      return new FakeReader('persistent', { ...restored, locations: { progression: 0.75, cfi: 'epubcfi(/6/4)' } }, [bookmark]) as unknown as BrowserEpubReader;
    });
    const persistentContainer = {
      ownerDocument: { defaultView: null },
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
    } as unknown as HTMLDivElement;
    persistent.setSource(new Uint8Array([3, 4, 5]), { readingSession: { key: 'fixture', storage: sessions, saveDelayMs: 0 } });
    persistent.attachViewport(persistentContainer);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    assert(receivedLocator?.locations.progression === 0.6, 'saved locator must be supplied before reader open');
    assert(restoredMarkCount === 1, 'saved marks must hydrate the default mark store before reader open');
    assert(sessions.load('fixture')?.locator.locations.progression === 0.75, 'ready reader locator must replace the stored position');
    assert(sessions.load('fixture')?.locator.locations.cfi == null, 'session positions must not retain a stale precise anchor over progression');
    assert(sessions.load('fixture')?.marks?.length === 1, 'ready reader marks must be retained with the reading session');
    persistent.clearReadingSession();
    assert(sessions.load('fixture') === null, 'clearReadingSession must remove the active publication record');
    persistent.dispose();
  }

  // Browser storage is deliberately best-effort: corrupt or unavailable
  // localStorage must never prevent a publication from opening.
  {
    const brokenStorage = {
      getItem: () => '{not json',
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('blocked'); },
    } as unknown as Storage;
    const browserSessions = new BrowserReadingSessionStorage(brokenStorage);
    assert(browserSessions.load('broken') === null, 'malformed persisted sessions must be ignored');
    browserSessions.save('broken', {
      locator: { href: 'c.xhtml', spineIndex: 0, locations: {} },
      marks: [],
      updatedAt: new Date().toISOString(),
    });
    browserSessions.remove('broken');
  }

  // Development data is disposable: only the exact current shape is loaded.
  // Incomplete records are rejected rather than migrated.
  {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } as unknown as Storage;
    const browserSessions = new BrowserReadingSessionStorage(storage, 'test:');
    const locator: Locator = { href: 'c.xhtml', spineIndex: 0, locations: { progression: 0.25 } };
    values.set('test:incomplete', JSON.stringify({ locator, updatedAt: new Date().toISOString() }));
    values.set('test:partial-marks', JSON.stringify({
      locator,
      marks: [{ kind: 'bookmark' }],
      updatedAt: new Date().toISOString(),
    }));
    assert(browserSessions.load('incomplete') === null, 'incomplete reading sessions must not be migrated');
    assert(browserSessions.load('partial-marks') === null, 'partially valid reading sessions must be rejected as a whole');
    browserSessions.save('current', {
      locator,
      marks: [],
      updatedAt: new Date().toISOString(),
    });
    assert(browserSessions.load('current')?.locator.href === 'c.xhtml', 'the exact current reading-session schema must load');
  }

  assert(
    readingSessionKey(new Uint8Array([1, 2]), new Uint8Array([1, 2]))
      === readingSessionKey(new Uint8Array([1, 2]), new Uint8Array([1, 2])),
    'reading-session fingerprints must be deterministic',
  );
  const firstPublication = new Uint8Array(98_304).fill(7);
  const secondPublication = firstPublication.slice();
  secondPublication[49_152] = 8;
  assert(
    readingSessionKey(firstPublication, firstPublication) !== readingSessionKey(secondPublication, secondPublication),
    'reading-session fingerprints must include bytes outside the first and last 32 KiB',
  );

  const pending = new Map<number, ReturnType<typeof deferred<FakeReader>>>();
  const opened: FakeReader[] = [];
  const openSignals = new Map<number, AbortSignal | undefined>();
  const opener: ReactEpubReaderOpener = async (source, _element, options) => {
    const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
    const key = bytes[0] ?? 0;
    openSignals.set(key, options?.signal);
    options?.onOpenProgress?.({ phase: 'archive', label: 'Opening fixture', completed: 1, total: 5 });
    const gate = deferred<FakeReader>();
    pending.set(key, gate);
    const reader = await gate.promise;
    opened.push(reader);
    return reader as unknown as BrowserEpubReader;
  };

  const store = new ReactEpubReaderStore(opener);
  const container = {
    ownerDocument: { defaultView: null },
    clientWidth: 800,
    clientHeight: 600,
    getBoundingClientRect: () => ({ width: 800, height: 600 }),
  } as unknown as HTMLDivElement;

  store.setSource(new Uint8Array([1]));
  store.attachViewport(container);
  await Promise.resolve();
  assert(String(store.snapshot.status) === 'loading', 'first source begins loading');
  assert(store.snapshot.openProgress?.phase === 'archive', 'core open progress must be observable through the React store');
  assert(pending.has(1), 'first source opener must start');

  store.setSource(new Uint8Array([2]));
  await Promise.resolve();
  assert(openSignals.get(1)?.aborted, 'replacing a source must abort the previous open pipeline');
  assert(pending.has(2), 'second source opener must start');
  const second = new FakeReader('second');
  pending.get(2)!.resolve(second);
  await Promise.resolve();
  await Promise.resolve();
  assert(String(store.snapshot.status) === 'ready', 'newest source must become ready');
  assert(store.snapshot.reader?.publication.metadata.title === 'second', 'newest source owns the external-store snapshot');

  const first = new FakeReader('first');
  pending.get(1)!.resolve(first);
  await Promise.resolve();
  await Promise.resolve();
  assert(first.disposed, 'late reader from a stale source generation must be disposed');
  assert(store.snapshot.reader?.publication.metadata.title === 'second', 'late source must not overwrite newer source state');

  const stable = store.getSnapshot();
  assert(store.getSnapshot() === stable, 'getSnapshot must be referentially stable between publications');

  // React StrictMode also replays callback refs. A transient null followed by
  // the same node must not destroy an otherwise healthy publication session.
  store.attachViewport(null);
  store.attachViewport(container);
  await Promise.resolve();
  assert(!second.disposed, 'StrictMode callback-ref replay must not dispose a reattached viewport reader');

  store.attachViewport(null);
  await Promise.resolve();
  assert(second.disposed, 'a real viewport detach must dispose the active browser reader');
  store.dispose();
  assert(String(store.snapshot.status) === 'disposed', 'store dispose publishes terminal state');

  console.log('React reader store integration test: PASS');
}

void main().catch(error => {
  console.error(error);
  throw error;
});
