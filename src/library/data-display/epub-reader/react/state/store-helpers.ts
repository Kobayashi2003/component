import {
  MemoryReaderMarkStore,
  normalizeReaderPreferences,
  type BrowserEpubReaderOptions,
  type BrowserEpubReaderSnapshot,
  type Locator,
  type ReaderMark,
  type ReaderPreferences,
  type ReaderPreferencesPatch,
} from '../../core';
import type { EpubSource, ReactEpubReaderSnapshot, UseEpubReaderOptions } from './model';

export const SERVER_SNAPSHOT: ReactEpubReaderSnapshot = Object.freeze({ status: 'idle', reader: null, diagnostics: [], error: null });

export function createRestoredMarkStore(marks: readonly ReaderMark[]): MemoryReaderMarkStore {
  const store = new MemoryReaderMarkStore();
  for (const mark of marks) store.put(mark);
  return store;
}

export function progressionOnlyLocator(locator: Locator, rendererProgression?: number): Locator {
  const progression = rendererProgression ?? locator.locations.progression ?? 0;
  return {
    href: locator.href,
    spineIndex: locator.spineIndex,
    locations: { progression: Math.max(0, Math.min(1, progression)) },
  };
}

export function combineAbortSignals(external: AbortSignal | undefined, internal: AbortSignal): AbortSignal {
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

export async function sourceBytes(source: EpubSource): Promise<Uint8Array | ArrayBuffer> {
  if (source instanceof Uint8Array || source instanceof ArrayBuffer) return source;
  return source.arrayBuffer();
}

export function mergePreferences(base: ReaderPreferences, patch: ReaderPreferencesPatch): ReaderPreferences {
  return normalizeReaderPreferences({
    ...base,
    ...patch,
    compatibility: {
      ...base.compatibility,
      ...patch.compatibility,
    },
  });
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal);
}

export function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Publication open aborted.', 'AbortError');
}

export function stripReactCallbacks(options: UseEpubReaderOptions): BrowserEpubReaderOptions {
  const core = { ...options };
  delete core.onReady;
  delete core.onError;
  delete core.readingSession;
  return core;
}

export function statusFromReader(snapshot: BrowserEpubReaderSnapshot): ReactEpubReaderSnapshot['status'] {
  if (snapshot.status === 'disposed') return 'disposed';
  if (snapshot.status === 'error') return 'error';
  if (snapshot.status === 'ready') return 'ready';
  return 'loading';
}
