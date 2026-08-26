import { normalizeProgression, type TextDirection, type WritingMode } from '../../publication';
import type { ReflowablePresentation } from './model';

export interface PaginatedGeometryInput {
  readonly scrollExtent: number;
  readonly pageExtent: number;
  readonly pageGap: number;
  readonly logicalOffset: number;
}

export interface PaginatedGeometry {
  readonly pageAdvance: number;
  readonly pageCount: number;
  readonly currentPage: number;
  readonly progression: number;
  readonly snappedOffset: number;
}

/**
 * Logical page map used when browser scroll extents are not a trustworthy page
 * source. Vertical writing is the important case: authored block flow can
 * overflow toward negative physical X, while scrollWidth also includes the
 * viewport itself. The reader therefore measures content first, then creates
 * an explicit page/slot map and only uses scrolling as the transport.
 */
export interface PaginatedPageMap {
  readonly pageExtent: number;
  readonly pageGap: number;
  readonly pageAdvance: number;
  /** Authored/content pages. Does not include reader-added trailing blanks. */
  readonly pageCount: number;
  /** Physical slots after rounding up to a complete visible spread. */
  readonly slotCount: number;
  /** Reader-owned blank slot before authored page 1 for page-spread placement. */
  readonly leadingBlankCount: 0 | 1;
  readonly visiblePageCount: 1 | 2;
  readonly maxLogicalOffset: number;
}

export function resolveReflowablePresentation(
  writingMode: WritingMode,
  textDirection: TextDirection,
): ReflowablePresentation {
  if (writingMode === 'vertical-rl') {
    return {
      writingMode,
      textDirection,
      scrollAxis: 'horizontal',
      horizontalFlow: 'right-to-left',
    };
  }
  if (writingMode === 'vertical-lr') {
    return {
      writingMode,
      textDirection,
      scrollAxis: 'horizontal',
      horizontalFlow: 'left-to-right',
    };
  }
  return {
    writingMode,
    textDirection,
    scrollAxis: 'vertical',
    horizontalFlow: textDirection === 'rtl' ? 'right-to-left' : 'left-to-right',
  };
}

/**
 * CSS multicol horizontal pagination geometry. This remains appropriate for
 * horizontal writing, where the generated columns themselves are laid out on
 * physical X and scrollWidth represents the positive overflow extent.
 */
export function calculatePaginatedGeometry(input: PaginatedGeometryInput): PaginatedGeometry {
  const page = positive(input.pageExtent, 'pageExtent');
  const gap = nonNegative(input.pageGap, 'pageGap');
  const extent = Math.max(page, finite(input.scrollExtent, 'scrollExtent'));
  const advance = page + gap;
  // `scrollExtent` already includes the trailing portion of the final column
  // and the inter-column gaps. Adding another gap here creates a phantom page
  // for exact two-column documents (for example 2 * page + 1 * gap), which can
  // make the Next control appear to do nothing at the end of a section.
  const pageCount = Math.max(1, Math.ceil((extent - 0.5) / advance));
  const maxPage = pageCount - 1;
  const pageIndex = Math.max(0, Math.min(maxPage, Math.round(Math.max(0, input.logicalOffset) / advance)));
  const snappedOffset = pageIndex * advance;
  return {
    pageAdvance: advance,
    pageCount,
    currentPage: pageIndex + 1,
    progression: maxPage === 0 ? 0 : pageIndex / maxPage,
    snappedOffset,
  };
}

export function createPaginatedPageMap(input: {
  readonly pageCount: number;
  readonly pageExtent: number;
  readonly pageGap?: number;
  readonly visiblePageCount?: 1 | 2;
  readonly leadingBlankCount?: 0 | 1;
}): PaginatedPageMap {
  if (!Number.isInteger(input.pageCount) || input.pageCount < 1) {
    throw new RangeError('pageCount must be an integer >= 1.');
  }
  const pageExtent = positive(input.pageExtent, 'pageExtent');
  const pageGap = nonNegative(input.pageGap ?? 0, 'pageGap');
  const visiblePageCount: 1 | 2 = input.visiblePageCount ?? 1;
  const leadingBlankCount: 0 | 1 = input.leadingBlankCount ?? 0;
  const physicalContentSlots = leadingBlankCount + input.pageCount;
  const slotCount = Math.max(
    visiblePageCount,
    Math.ceil(physicalContentSlots / visiblePageCount) * visiblePageCount,
  );
  const pageAdvance = pageExtent + pageGap;
  const maxLogicalOffset = Math.max(0, (slotCount - visiblePageCount) * pageAdvance);
  return Object.freeze({
    pageExtent,
    pageGap,
    pageAdvance,
    pageCount: input.pageCount,
    slotCount,
    leadingBlankCount,
    visiblePageCount,
    maxLogicalOffset,
  });
}

export function pageMapPosition(map: PaginatedPageMap, logicalOffset: number): {
  readonly pageIndex: number;
  readonly currentPage: number;
  readonly progression: number;
  readonly snappedOffset: number;
} {
  const logical = clamp(logicalOffset, 0, map.maxLogicalOffset);
  const spreadAdvance = map.pageAdvance * map.visiblePageCount;
  const spreadIndex = Math.floor((logical + 0.5) / spreadAdvance);
  const physicalSpreadStart = spreadIndex * map.visiblePageCount;
  const pageIndex = Math.max(
    0,
    Math.min(map.pageCount - 1, physicalSpreadStart - map.leadingBlankCount),
  );
  return {
    pageIndex,
    currentPage: pageIndex + 1,
    progression: map.pageCount === 1 ? 0 : pageIndex / (map.pageCount - 1),
    snappedOffset: Math.min(map.maxLogicalOffset, spreadIndex * spreadAdvance),
  };
}

export function pageMapOffsetForProgression(map: PaginatedPageMap, progression: number): number {
  if (map.pageCount === 1) return 0;
  const requestedPage = Math.round(normalizeProgression(progression) * (map.pageCount - 1));
  const physicalSlot = map.leadingBlankCount + requestedPage;
  const spreadStart = Math.floor(physicalSlot / map.visiblePageCount) * map.visiblePageCount;
  return Math.min(map.maxLogicalOffset, spreadStart * map.pageAdvance);
}

export function pageMapNavigationTarget(
  map: PaginatedPageMap,
  logicalOffset: number,
  direction: 'forward' | 'backward',
): { readonly status: 'moved'; readonly pageIndex: number; readonly logicalOffset: number }
  | { readonly status: 'boundary'; readonly edge: 'start' | 'end' } {
  const current = pageMapPosition(map, logicalOffset);
  const spreadAdvance = map.pageAdvance * map.visiblePageCount;
  const targetLogical = current.snappedOffset + (direction === 'forward' ? spreadAdvance : -spreadAdvance);
  if (targetLogical < 0) return { status: 'boundary', edge: 'start' };
  if (targetLogical > map.maxLogicalOffset) return { status: 'boundary', edge: 'end' };
  const target = pageMapPosition(map, targetLogical);
  return {
    status: 'moved',
    pageIndex: target.pageIndex,
    logicalOffset: target.snappedOffset,
  };
}

export function pageOffsetForProgression(
  progression: number,
  pageCount: number,
  pageAdvance: number,
): number {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new RangeError('pageCount must be an integer >= 1.');
  positive(pageAdvance, 'pageAdvance');
  if (pageCount === 1) return 0;
  const pageIndex = Math.round(normalizeProgression(progression) * (pageCount - 1));
  return pageIndex * pageAdvance;
}

export function scrollProgression(offset: number, maximum: number): number {
  if (!Number.isFinite(maximum) || maximum <= 0) return 0;
  return normalizeProgression(Math.max(0, offset) / maximum);
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a positive finite number.`);
  return value;
}

function nonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a finite non-negative number.`);
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
