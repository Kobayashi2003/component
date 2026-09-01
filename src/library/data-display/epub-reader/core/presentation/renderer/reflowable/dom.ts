import { normalizeProgression, type Locator, type TextDirection, type WritingMode } from '../../../epub/publication';
import type { RenditionPlan } from '../../rendition';
import { isSemanticTextNode } from '../../../epub/text';
import {
  calculatePaginatedGeometry,
  pageOffsetForProgression,
  scrollProgression,
} from './geometry';
import { reflowablePageGap, reflowablePageWidth } from './styles';
import type {
  HorizontalFlowDirection,
  ReflowableLayoutSnapshot,
  ReflowablePresentation,
  ReflowableRendererPolicy,
} from './model';

export function inspectComputedPresentation(
  document: Document,
  plan: RenditionPlan,
): ReflowablePresentation {
  const win = document.defaultView;
  const root = document.documentElement;
  const body = document.body;
  const rootStyle = root && win ? win.getComputedStyle(root) : null;
  const bodyStyle = body && win ? win.getComputedStyle(body) : null;

  const writingMode = normalizeWritingMode(
    bodyStyle?.writingMode || rootStyle?.writingMode || plan.writingMode.value,
  );
  const textDirection = normalizeDirection(
    bodyStyle?.direction || rootStyle?.direction || plan.textDirection.value,
  );

  return {
    writingMode,
    textDirection,
    scrollAxis: reflowableScrollAxis(writingMode, plan.renderer),
    horizontalFlow: horizontalFlow(writingMode, textDirection),
  };
}

/**
 * Physical axis the reader scrolls along to move through content.
 *
 * Paginated content fragments through CSS multicol, and column boxes are placed
 * along the multicol container's *inline* axis — physical X for `horizontal-tb`,
 * physical Y for vertical writing. Scrolled content just overflows along its
 * block axis, which is the other one in each case.
 */
export function reflowableScrollAxis(
  writingMode: WritingMode,
  renderer: RenditionPlan['renderer'],
): 'horizontal' | 'vertical' {
  if (renderer === 'reflowable-paginated') {
    return writingMode === 'horizontal-tb' ? 'horizontal' : 'vertical';
  }
  return writingMode === 'horizontal-tb' ? 'vertical' : 'horizontal';
}

/**
 * How many authored pages one viewport shows.
 *
 * Horizontal two-up puts two half-width column boxes side by side, so a page
 * turn advances by two. Vertical two-up is not that: a Japanese spread is one
 * continuous flow running right-to-left across both leaves, so it is a single
 * fragmentainer the full width of the viewport, and the division between the
 * leaves is a gutter the shell may draw rather than a fragmentation boundary.
 */
function visiblePageCount(plan: RenditionPlan, presentation: ReflowablePresentation): 1 | 2 {
  if (presentation.writingMode !== 'horizontal-tb') return 1;
  return plan.spread.execution === 'intra-document' ? 2 : 1;
}

/**
 * The paging axis of a paginated document, as a read/write pair.
 *
 * Vertical writing stacks its column boxes down the page, so paging there is an
 * ordinary positive `scrollTop`. Horizontal writing stacks them across, where
 * right-to-left content still has to be normalized out of the browser's several
 * `scrollLeft` conventions. Callers work in distance-from-the-authored-start and
 * never touch either directly.
 */
interface PagingAxis {
  /** Content extent along the paging axis. */
  readonly extent: number;
  readonly max: number;
  read(): number;
  write(logicalOffset: number): void;
}

function pagingAxis(
  scrolling: HTMLElement,
  measurement: { readonly scrollWidth: number; readonly scrollHeight: number },
  plan: RenditionPlan,
  presentation: ReflowablePresentation,
): PagingAxis {
  if (presentation.scrollAxis === 'vertical') {
    const extent = measurement.scrollHeight;
    const max = Math.max(0, extent - plan.viewport.height);
    return {
      extent,
      max,
      read: () => clamp(Math.max(0, scrolling.scrollTop), 0, max),
      write: value => { scrolling.scrollTop = clamp(value, 0, max); },
    };
  }
  const extent = measurement.scrollWidth;
  const max = Math.max(0, extent - plan.viewport.width);
  return {
    extent,
    max,
    read: () => getHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max),
    write: value => setHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max, value),
  };
}

export function snapshotReflowableLayout(
  document: Document,
  plan: RenditionPlan,
  presentation: ReflowablePresentation,
  policy: ReflowableRendererPolicy,
): ReflowableLayoutSnapshot {
  const scrolling = getScrollingElement(document);
  const measurement = measureDocument(document);

  if (plan.renderer === 'reflowable-paginated') {
    const axis = pagingAxis(scrolling, measurement, plan, presentation);
    const pageGap = reflowablePageGap(plan, policy, presentation.writingMode);
    const pageWidth = reflowablePageWidth(plan, policy, presentation.writingMode);
    const geometry = calculatePaginatedGeometry({
      scrollExtent: axis.extent,
      pageExtent: pageWidth,
      pageGap,
      logicalOffset: axis.read(),
    });
    return {
      measurement,
      pageCount: geometry.pageCount,
      currentPage: geometry.currentPage,
      progression: geometry.progression,
      writingMode: presentation.writingMode,
      textDirection: presentation.textDirection,
      scrollAxis: presentation.scrollAxis,
      pageGap,
      pageWidth,
      visiblePageCount: visiblePageCount(plan, presentation),
    };
  }

  const horizontal = presentation.scrollAxis === 'horizontal';
  const max = horizontal
    ? Math.max(0, measurement.scrollWidth - plan.viewport.width)
    : Math.max(0, measurement.scrollHeight - plan.viewport.height);
  const logical = horizontal
    ? getHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max)
    : Math.max(0, scrolling.scrollTop);

  return {
    measurement,
    progression: scrollProgression(logical, max),
    writingMode: presentation.writingMode,
    textDirection: presentation.textDirection,
    scrollAxis: presentation.scrollAxis,
  };
}

export function captureProvisionalLocator(
  document: Document,
  plan: RenditionPlan,
  presentation: ReflowablePresentation,
  policy: ReflowableRendererPolicy,
): Locator {
  const snapshot = snapshotReflowableLayout(document, plan, presentation, policy);
  const visible = findVisibleTextAnchor(document, presentation, policy.locatorTextLength);

  return {
    href: plan.href,
    spineIndex: plan.spineIndex,
    locations: {
      progression: snapshot.progression,
      ...(visible?.fragment ? { fragment: visible.fragment } : {}),
    },
    ...(visible?.text ? { text: visible.text } : {}),
  };
}

export function restoreProvisionalLocator(
  document: Document,
  plan: RenditionPlan,
  presentation: ReflowablePresentation,
  policy: ReflowableRendererPolicy,
  locator: Locator,
): void {
  const scrolling = getScrollingElement(document);
  let restored = false;

  if (locator.locations.fragment) {
    const element = document.getElementById(locator.locations.fragment);
    if (element) {
      element.scrollIntoView({ block: 'start', inline: 'start', behavior: 'auto' });
      restored = true;
    }
  }

  if (!restored && locator.text?.highlight) {
    const node = findText(document, locator.text.highlight);
    const parent = node?.parentElement;
    if (parent) {
      parent.scrollIntoView({ block: 'start', inline: 'start', behavior: 'auto' });
      restored = true;
    }
  }

  if (!restored && locator.locations.progression != null) {
    restoreProgression(document, plan, presentation, policy, locator.locations.progression);
    return;
  }

  if (plan.renderer === 'reflowable-paginated') {
    snapPaginatedToPage(document, plan, presentation, policy);
  } else if (!restored && locator.locations.progression != null) {
    restoreProgression(document, plan, presentation, policy, locator.locations.progression);
  }

  // Clamp browsers that leave fractional/subpixel scroll positions after
  // scrollIntoView into the supported content extent.
  if (!Number.isFinite(scrolling.scrollTop)) scrolling.scrollTop = 0;
}

export function restoreProgression(
  document: Document,
  plan: RenditionPlan,
  presentation: ReflowablePresentation,
  policy: ReflowableRendererPolicy,
  progression: number,
): void {
  const scrolling = getScrollingElement(document);
  const measurement = measureDocument(document);
  const normalized = normalizeProgression(progression);

  if (plan.renderer === 'reflowable-paginated') {
    const axis = pagingAxis(scrolling, measurement, plan, presentation);
    const geometry = calculatePaginatedGeometry({
      scrollExtent: axis.extent,
      pageExtent: reflowablePageWidth(plan, policy, presentation.writingMode),
      pageGap: reflowablePageGap(plan, policy, presentation.writingMode),
      logicalOffset: 0,
    });
    axis.write(pageOffsetForProgression(normalized, geometry.pageCount, geometry.pageAdvance));
    return;
  }

  if (presentation.scrollAxis === 'vertical') {
    const max = Math.max(0, measurement.scrollHeight - plan.viewport.height);
    scrolling.scrollTop = normalized * max;
  } else {
    const max = Math.max(0, measurement.scrollWidth - plan.viewport.width);
    setHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max, normalized * max);
  }
}

function snapPaginatedToPage(
  document: Document,
  plan: RenditionPlan,
  presentation: ReflowablePresentation,
  policy: ReflowableRendererPolicy,
): void {
  const axis = pagingAxis(getScrollingElement(document), measureDocument(document), plan, presentation);
  const geometry = calculatePaginatedGeometry({
    scrollExtent: axis.extent,
    pageExtent: reflowablePageWidth(plan, policy, presentation.writingMode),
    pageGap: reflowablePageGap(plan, policy, presentation.writingMode),
    logicalOffset: axis.read(),
  });
  axis.write(geometry.snappedOffset);
}


function findVisibleTextAnchor(
  document: Document,
  presentation: ReflowablePresentation,
  maxLength: number,
): { fragment?: string; text?: { before?: string; highlight?: string; after?: string } } | null {
  const win = document.defaultView;
  const body = document.body;
  if (!win || !body) return null;

  const walker = document.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */);
  let best: { node: Text; score: number } | null = null;
  const viewportWidth = win.innerWidth;
  const viewportHeight = win.innerHeight;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.data.trim() || !isSemanticTextNode(node)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects());
    range.detach?.();

    for (const rect of rects) {
      if (rect.bottom <= 0 || rect.top >= viewportHeight || rect.right <= 0 || rect.left >= viewportWidth) continue;
      const score = visibleRectScore(rect, presentation);
      if (!best || score < best.score) best = { node, score };
      break;
    }
  }

  if (!best) return null;
  const raw = best.node.data.replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const highlight = raw.slice(0, Math.max(8, maxLength));
  const parent = best.node.parentElement;
  const fragment = nearestElementId(parent);
  return {
    ...(fragment ? { fragment } : {}),
    text: { highlight },
  };
}

function visibleRectScore(rect: DOMRect, presentation: ReflowablePresentation): number {
  if (presentation.writingMode === 'vertical-rl') {
    return Math.max(0, 100_000 - rect.right) + Math.max(0, rect.top);
  }
  if (presentation.writingMode === 'vertical-lr') {
    return Math.max(0, rect.left) * 100_000 + Math.max(0, rect.top);
  }
  return Math.max(0, rect.top) * 100_000 + Math.max(0, rect.left);
}

function nearestElementId(element: Element | null): string | undefined {
  let current = element;
  while (current) {
    if (current.id) return current.id;
    current = current.parentElement;
  }
  return undefined;
}

function findText(document: Document, needle: string): Text | null {
  const body = document.body;
  if (!body || !needle) return null;
  const walker = document.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */);
  while (walker.nextNode()) {
    const text = walker.currentNode as Text;
    if (isSemanticTextNode(text) && text.data.includes(needle)) return text;
  }
  return null;
}

function measureDocument(document: Document) {
  const root = document.documentElement;
  const body = document.body;
  return {
    clientWidth: root?.clientWidth ?? body?.clientWidth ?? 0,
    clientHeight: root?.clientHeight ?? body?.clientHeight ?? 0,
    scrollWidth: Math.max(root?.scrollWidth ?? 0, body?.scrollWidth ?? 0),
    scrollHeight: Math.max(root?.scrollHeight ?? 0, body?.scrollHeight ?? 0),
  };
}

function getScrollingElement(document: Document): HTMLElement {
  const element = document.scrollingElement ?? document.documentElement ?? document.body;
  if (!element || element.nodeType !== 1 || !("scrollLeft" in element)) {
    throw new Error('Reflowable document does not expose an HTML scrolling element.');
  }
  // The element belongs to the iframe realm, so checking against the parent
  // realm's HTMLElement constructor would incorrectly reject it.
  return element as HTMLElement;
}

/**
 * Normalize the three historical RTL scrollLeft models plus vertical-rl's
 * negative physical overflow into distance from the authored content start.
 */
function getHorizontalLogicalOffset(
  element: HTMLElement,
  flow: HorizontalFlowDirection,
  max: number,
): number {
  if (flow === 'left-to-right') return clamp(Math.max(0, element.scrollLeft), 0, max);
  const raw = element.scrollLeft;
  if (raw < 0) return clamp(-raw, 0, max); // negative model / leftward overflow

  const model = detectPositiveRtlModel(element, raw);
  return model === 'start-at-max'
    ? clamp(max - raw, 0, max)
    : clamp(raw, 0, max);
}

function setHorizontalLogicalOffset(
  element: HTMLElement,
  flow: HorizontalFlowDirection,
  max: number,
  logical: number,
): void {
  const value = clamp(logical, 0, max);
  if (flow === 'left-to-right') {
    element.scrollLeft = value;
    return;
  }

  const original = element.scrollLeft;
  element.scrollLeft = -value;
  if (value === 0 || element.scrollLeft < 0) return;

  element.scrollLeft = original;
  const model = detectPositiveRtlModel(element, original);
  element.scrollLeft = model === 'start-at-max' ? max - value : value;
}

function detectPositiveRtlModel(element: HTMLElement, current: number): 'start-at-zero' | 'start-at-max' {
  if (current > 0) return 'start-at-max';
  const original = element.scrollLeft;
  element.scrollLeft = 1;
  const acceptsPositive = element.scrollLeft > 0;
  element.scrollLeft = original;
  return acceptsPositive ? 'start-at-zero' : 'start-at-max';
}

function normalizeWritingMode(value: string): WritingMode {
  const normalized = value.trim().toLowerCase();
  return normalized === 'vertical-rl' || normalized === 'vertical-lr'
    ? normalized
    : 'horizontal-tb';
}

function normalizeDirection(value: string): TextDirection {
  const normalized = value.trim().toLowerCase();
  return normalized === 'rtl' || normalized === 'ltr' ? normalized : 'auto';
}

function horizontalFlow(writingMode: WritingMode, direction: TextDirection): HorizontalFlowDirection {
  if (writingMode === 'vertical-rl') return 'right-to-left';
  if (writingMode === 'vertical-lr') return 'left-to-right';
  return direction === 'rtl' ? 'right-to-left' : 'left-to-right';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Find a structural point near the visual reading-start edge of the viewport. */
export function findVisibleDomPoint(
  document: Document,
  presentation: ReflowablePresentation,
): import('../../../interaction/locator').DomPoint | null {
  const win = document.defaultView;
  const body = document.body;
  if (!win || !body) return null;
  const walker = document.createTreeWalker(body, 4 /* SHOW_TEXT */);
  let best: { node: Text; score: number } | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.data.trim() || !isSemanticTextNode(node)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects());
    range.detach?.();
    for (const rect of rects) {
      if (rect.bottom <= 0 || rect.top >= win.innerHeight || rect.right <= 0 || rect.left >= win.innerWidth) continue;
      const score = visibleRectScore(rect, presentation);
      if (!best || score < best.score) best = { node, score };
      break;
    }
  }
  if (!best) return null;
  return { node: best.node, offset: firstVisibleTextOffset(document, best.node, win.innerWidth, win.innerHeight) };
}

function firstVisibleTextOffset(
  document: Document,
  node: Text,
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (node.data.length === 0) return 0;
  let low = 1;
  let high = node.data.length;
  let answer = node.data.length;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, mid);
    const visible = Array.from(range.getClientRects()).some(rect =>
      rect.bottom > 0 && rect.top < viewportHeight && rect.right > 0 && rect.left < viewportWidth,
    );
    range.detach?.();
    if (visible) {
      answer = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return Math.max(0, answer - 1);
}

/** Map a logical DOM point back into the active pagination/scroll geometry. */
export function restoreDomPoint(
  document: Document,
  plan: RenditionPlan,
  presentation: ReflowablePresentation,
  policy: ReflowableRendererPolicy,
  point: import('../../../interaction/locator').DomPoint,
): void {
  const scrolling = getScrollingElement(document);

  // Move `rect` to the reading-start edge of the viewport, then let the page
  // snap take over. Which edge that is follows the axis the pages advance
  // along, not the writing mode on its own.
  const bringToPageStart = (rect: DOMRect): void => {
    const axis = pagingAxis(scrolling, measureDocument(document), plan, presentation);
    const delta = presentation.scrollAxis === 'vertical'
      ? rect.top
      : presentation.horizontalFlow === 'right-to-left'
        ? plan.viewport.width - rect.right
        : rect.left;
    axis.write(axis.read() + delta);
    snapPaginatedToPage(document, plan, presentation, policy);
  };

  // Fragment locators resolve to the target element at offset zero. A
  // collapsed range at that boundary is ambiguous in vertical writing (it can
  // report the preceding page edge), so paginated flow uses the element's own
  // box while scrolled flow delegates to scrollIntoView.
  if (point.node.nodeType === 1 && point.offset === 0) {
    const element = point.node as Element;
    if (plan.renderer === 'reflowable-paginated') bringToPageStart(element.getBoundingClientRect());
    else element.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'start' });
    return;
  }

  const range = document.createRange();
  try {
    range.setStart(point.node, Math.max(0, point.offset));
    range.collapse(true);
  } catch {
    const element = point.node.nodeType === 1 ? point.node as Element : point.node.parentElement;
    element?.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'start' });
    if (plan.renderer === 'reflowable-paginated') snapPaginatedToPage(document, plan, presentation, policy);
    return;
  }
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  range.detach?.();
  if (!rect) return;

  if (plan.renderer === 'reflowable-paginated') {
    bringToPageStart(rect);
    return;
  }

  if (presentation.scrollAxis === 'vertical') {
    scrolling.scrollTop += rect.top;
  } else {
    const measurement = measureDocument(document);
    const max = Math.max(0, measurement.scrollWidth - plan.viewport.width);
    const current = getHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max);
    const delta = presentation.horizontalFlow === 'right-to-left'
      ? plan.viewport.width - rect.right
      : rect.left;
    setHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max, current + delta);
  }
}

export function navigateReflowable(
  document: Document,
  plan: RenditionPlan,
  presentation: ReflowablePresentation,
  policy: ReflowableRendererPolicy,
  direction: import('../model').ReadingDirection,
): import('../model').RendererNavigationResult {
  const scrolling = getScrollingElement(document);
  const measurement = measureDocument(document);

  if (plan.renderer === 'reflowable-paginated') {
    const axis = pagingAxis(scrolling, measurement, plan, presentation);
    const geometry = calculatePaginatedGeometry({
      scrollExtent: axis.extent,
      pageExtent: reflowablePageWidth(plan, policy, presentation.writingMode),
      pageGap: reflowablePageGap(plan, policy, presentation.writingMode),
      logicalOffset: axis.read(),
    });
    const visible = visiblePageCount(plan, presentation);
    const deltaPages = direction === 'forward' ? visible : -visible;
    const targetPage = geometry.currentPage - 1 + deltaPages;
    if (targetPage < 0) return { status: 'boundary', edge: 'start' };
    if (targetPage >= geometry.pageCount) return { status: 'boundary', edge: 'end' };
    const requested = targetPage * geometry.pageAdvance;
    axis.write(requested);
    // The scroll range is the authority on where a page turn can land, and the
    // page count is arithmetic derived from a measurement. When the two
    // disagree, believing the arithmetic reports a turn that never happened,
    // and the section never yields to the next one. The scrolled branches below
    // have always verified their own movement; this one has to as well.
    if (Math.abs(axis.read() - requested) > geometry.pageAdvance / 2) {
      return { status: 'boundary', edge: direction === 'forward' ? 'end' : 'start' };
    }
    return {
      status: 'moved',
      layout: snapshotReflowableLayout(document, plan, presentation, policy),
    };
  }

  if (presentation.scrollAxis === 'vertical') {
    const max = Math.max(0, measurement.scrollHeight - plan.viewport.height);
    const current = Math.max(0, scrolling.scrollTop);
    const advance = Math.max(1, plan.viewport.height * 0.9);
    const target = direction === 'forward' ? Math.min(max, current + advance) : Math.max(0, current - advance);
    if (Math.abs(target - current) < 0.5) return { status: 'boundary', edge: direction === 'forward' ? 'end' : 'start' };
    scrolling.scrollTop = target;
  } else {
    const max = Math.max(0, measurement.scrollWidth - plan.viewport.width);
    const current = getHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max);
    const advance = Math.max(1, plan.viewport.width * 0.9);
    const target = direction === 'forward' ? Math.min(max, current + advance) : Math.max(0, current - advance);
    if (Math.abs(target - current) < 0.5) return { status: 'boundary', edge: direction === 'forward' ? 'end' : 'start' };
    setHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max, target);
  }
  return {
    status: 'moved',
    layout: snapshotReflowableLayout(document, plan, presentation, policy),
  };
}
