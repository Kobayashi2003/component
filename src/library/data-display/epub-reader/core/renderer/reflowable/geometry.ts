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
