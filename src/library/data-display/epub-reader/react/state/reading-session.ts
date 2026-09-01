import type { Locator, ReaderMark, ReaderPreferences } from '../../core';
import type { EpubSource } from './model';

export interface ReadingSessionRecord {
  readonly locator: Locator;
  readonly preferences?: ReaderPreferences;
  readonly marks?: readonly ReaderMark[];
  readonly updatedAt: string;
}

export interface ReadingSessionStorage {
  load(key: string): ReadingSessionRecord | null;
  save(key: string, record: ReadingSessionRecord): void;
  remove(key: string): void;
}

export interface ReadingSessionOptions {
  readonly key?: string;
  readonly storage?: ReadingSessionStorage;
  readonly persistPreferences?: boolean;
  readonly saveDelayMs?: number;
}

export class BrowserReadingSessionStorage implements ReadingSessionStorage {
  constructor(
    private readonly storage: Storage,
    private readonly namespace = 'component-atlas:epub-reader:v1:',
  ) {}

  load(key: string): ReadingSessionRecord | null {
    try {
      const raw = this.storage.getItem(this.namespace + key);
      if (!raw) return null;
      return parseReadingSessionRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  save(key: string, record: ReadingSessionRecord): void {
    try { this.storage.setItem(this.namespace + key, JSON.stringify(record)); } catch { /* storage is best effort */ }
  }

  remove(key: string): void {
    try { this.storage.removeItem(this.namespace + key); } catch { /* storage is best effort */ }
  }
}

export function readingSessionKey(source: EpubSource, bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const sourceName = isNamedSource(source) ? source.name.trim().toLowerCase() : 'publication';
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  const sample = 32_768;
  const update = (byte: number, index: number) => {
    first = Math.imul(first ^ byte, 0x01000193) >>> 0;
    second = Math.imul(second ^ (byte + index), 0x85ebca6b) >>> 0;
  };
  const head = Math.min(view.length, sample);
  for (let index = 0; index < head; index += 1) update(view[index]!, index);
  const tailStart = Math.max(head, view.length - sample);
  for (let index = tailStart; index < view.length; index += 1) update(view[index]!, index);
  const nameHash = [...sourceName].reduce((hash, char) => Math.imul(hash ^ char.codePointAt(0)!, 0x01000193) >>> 0, 0x811c9dc5);
  return `${view.length.toString(36)}-${nameHash.toString(36)}-${first.toString(36)}${second.toString(36)}`;
}

function parseReadingSessionRecord(value: unknown): ReadingSessionRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<ReadingSessionRecord>;
  if (!isLocator(record.locator)) return null;
  if (record.preferences != null && typeof record.preferences !== 'object') return null;
  return {
    locator: record.locator,
    ...(record.preferences ? { preferences: record.preferences as ReaderPreferences } : {}),
    ...(Array.isArray(record.marks) ? { marks: record.marks.filter(isReaderMark) } : {}),
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
  };
}

function isReaderMark(value: unknown): value is ReaderMark {
  if (!value || typeof value !== 'object') return false;
  const mark = value as Partial<ReaderMark>;
  if (typeof mark.id !== 'string' || typeof mark.createdAt !== 'string' || typeof mark.updatedAt !== 'string') return false;
  if (mark.kind === 'bookmark') return isLocator(mark.locator);
  if (mark.kind !== 'highlight' && mark.kind !== 'annotation') return false;
  const range = mark.range;
  return Boolean(range && isLocator(range.start) && isLocator(range.end))
    && (mark.kind !== 'annotation' || typeof mark.body === 'string');
}

function isLocator(value: unknown): value is Locator {
  if (!value || typeof value !== 'object') return false;
  const locator = value as Partial<Locator>;
  return typeof locator.href === 'string'
    && Number.isInteger(locator.spineIndex)
    && locator.spineIndex! >= 0
    && Boolean(locator.locations && typeof locator.locations === 'object');
}

function isNamedSource(source: EpubSource): source is EpubSource & { readonly name: string } {
  return typeof (source as { readonly name?: unknown }).name === 'string';
}
