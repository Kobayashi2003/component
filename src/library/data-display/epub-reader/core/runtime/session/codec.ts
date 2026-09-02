import type { ReaderMark } from '../../features/annotations';
import type { Locator } from '../../epub/publication';
import type { ReadingSessionRecord } from './model';

/** Accepts only the current reading-session shape; development data is not migrated. */
export function parseReadingSessionRecord(value: unknown): ReadingSessionRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<ReadingSessionRecord>;
  if (!isLocator(record.locator)) return null;
  if (record.preferences != null && (typeof record.preferences !== 'object' || Array.isArray(record.preferences))) return null;
  if (!Array.isArray(record.marks) || !record.marks.every(isReaderMark)) return null;
  if (typeof record.updatedAt !== 'string') return null;
  return record as ReadingSessionRecord;
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
