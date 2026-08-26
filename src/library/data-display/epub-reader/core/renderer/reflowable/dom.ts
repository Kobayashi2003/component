import { normalizeProgression, type Locator, type TextDirection, type WritingMode } from '../../publication';
import type { RenditionPlan } from '../../rendition';
import { isSemanticTextNode } from '../../text';
import {
  calculatePaginatedGeometry,
  createPaginatedPageMap,
  pageMapNavigationTarget,
  pageMapOffsetForProgression,
  pageMapPosition,
  pageOffsetForProgression,
  scrollProgression,
  type PaginatedPageMap,
} from './geometry';
import { reflowableNeedsLeadingBlankPage, reflowablePageGap, reflowablePageWidth } from './styles';
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
    scrollAxis: plan.renderer === 'reflowable-paginated'
      ? 'horizontal'
      : writingMode === 'horizontal-tb' ? 'vertical' : 'horizontal',
    horizontalFlow: horizontalFlow(writingMode, textDirection),
  };
}

export function snapshotReflowableLayout(
  document: Document,
  plan: RenditionPlan,
  presentation: ReflowablePresentation,
  policy: ReflowableRendererPolicy,
  pageMap: PaginatedPageMap | null = null,
): ReflowableLayoutSnapshot {
  const scrolling = getScrollingElement(document);
  const measurement = measureDocument(document);

  if (plan.renderer === 'reflowable-paginated') {
    if (pageMap) {
      const logical = getHorizontalLogicalOffset(
        scrolling,
        presentation.horizontalFlow,
        pageMap.maxLogicalOffset,
        usesRightAnchoredVerticalExtent(presentation, pageMap),
      );
      const position = pageMapPosition(pageMap, logical);
      return {
        measurement,
        pageCount: pageMap.pageCount,
        currentPage: position.currentPage,
        progression: position.progression,
        writingMode: presentation.writingMode,
        textDirection: presentation.textDirection,
        scrollAxis: 'horizontal',
        pageGap: pageMap.pageGap,
        pageWidth: pageMap.pageExtent,
        visiblePageCount: pageMap.visiblePageCount,
      };
    }

    const max = Math.max(0, measurement.scrollWidth - plan.viewport.width);
    const logical = getHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max);
    const pageGap = reflowablePageGap(plan, policy, presentation.writingMode);
    const pageWidth = reflowablePageWidth(plan, policy, presentation.writingMode);
    const geometry = calculatePaginatedGeometry({
      scrollExtent: measurement.scrollWidth,
      pageExtent: pageWidth,
      pageGap,
      logicalOffset: logical,
    });
    return {
      measurement,
      pageCount: geometry.pageCount,
      currentPage: geometry.currentPage,
      progression: geometry.progression,
      writingMode: presentation.writingMode,
      textDirection: presentation.textDirection,
      scrollAxis: 'horizontal',
      pageGap,
      pageWidth,
      visiblePageCount: plan.spread.execution === 'intra-document' ? 2 : 1,
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
  pageMap: PaginatedPageMap | null = null,
): Locator {
  const snapshot = snapshotReflowableLayout(document, plan, presentation, policy, pageMap);
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
  pageMap: PaginatedPageMap | null = null,
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
    restoreProgression(document, plan, presentation, policy, locator.locations.progression, pageMap);
    return;
  }

  if (plan.renderer === 'reflowable-paginated') {
    snapHorizontalToPage(document, plan, presentation, policy, pageMap);
  } else if (!restored && locator.locations.progression != null) {
    restoreProgression(document, plan, presentation, policy, locator.locations.progression, pageMap);
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
  pageMap: PaginatedPageMap | null = null,
): void {
  const scrolling = getScrollingElement(document);
  const measurement = measureDocument(document);
  const normalized = normalizeProgression(progression);

  if (plan.renderer === 'reflowable-paginated') {
    if (pageMap) {
      setHorizontalLogicalOffset(
        scrolling,
        presentation.horizontalFlow,
        pageMap.maxLogicalOffset,
        pageMapOffsetForProgression(pageMap, normalized),
        usesRightAnchoredVerticalExtent(presentation, pageMap),
      );
      return;
    }
    const pageGap = reflowablePageGap(plan, policy, presentation.writingMode);
    const pageWidth = reflowablePageWidth(plan, policy, presentation.writingMode);
    const geometry = calculatePaginatedGeometry({
      scrollExtent: measurement.scrollWidth,
      pageExtent: pageWidth,
      pageGap,
      logicalOffset: 0,
    });
    const logical = pageOffsetForProgression(normalized, geometry.pageCount, geometry.pageAdvance);
    setHorizontalLogicalOffset(
      scrolling,
      presentation.horizontalFlow,
      Math.max(0, measurement.scrollWidth - plan.viewport.width),
      logical,
    );
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

function snapHorizontalToPage(
  document: Document,
  plan: RenditionPlan,
  presentation: ReflowablePresentation,
  policy: ReflowableRendererPolicy,
  pageMap: PaginatedPageMap | null = null,
): void {
  const scrolling = getScrollingElement(document);
  if (pageMap) {
    const logical = getHorizontalLogicalOffset(
      scrolling,
      presentation.horizontalFlow,
      pageMap.maxLogicalOffset,
      usesRightAnchoredVerticalExtent(presentation, pageMap),
    );
    const position = pageMapPosition(pageMap, logical);
    setHorizontalLogicalOffset(
      scrolling,
      presentation.horizontalFlow,
      pageMap.maxLogicalOffset,
      position.snappedOffset,
      usesRightAnchoredVerticalExtent(presentation, pageMap),
    );
    return;
  }
  const measurement = measureDocument(document);
  const max = Math.max(0, measurement.scrollWidth - plan.viewport.width);
  const logical = getHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max);
  const geometry = calculatePaginatedGeometry({
    scrollExtent: measurement.scrollWidth,
    pageExtent: reflowablePageWidth(plan, policy, presentation.writingMode),
    pageGap: reflowablePageGap(plan, policy, presentation.writingMode),
    logicalOffset: logical,
  });
  setHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max, geometry.snappedOffset);
}


/**
 * Measure vertical reflow after fonts/images settle and convert the authored
 * horizontal block-flow extent into logical pages. This intentionally measures
 * DOM geometry before the reader pads the body to a complete spread; measuring
 * scrollWidth after padding would count reader-added blank slots as content.
 */
export function measureVerticalPaginatedPageMap(
  document: Document,
  plan: RenditionPlan,
  presentation: ReflowablePresentation,
  policy: ReflowableRendererPolicy,
): PaginatedPageMap | null {
  if (plan.renderer !== 'reflowable-paginated' || presentation.writingMode === 'horizontal-tb') {
    return null;
  }

  const body = document.body;
  if (!body) return null;
  const pageExtent = reflowablePageWidth(plan, policy, presentation.writingMode);
  const visiblePageCount = plan.spread.execution === 'intra-document' ? 2 : 1;
  const bodyRect = body.getBoundingClientRect();
  let minX = bodyRect.left;
  let maxX = bodyRect.right;

  const includeRect = (rect: DOMRect | DOMRectReadOnly): void => {
    if (!Number.isFinite(rect.left) || !Number.isFinite(rect.right)) return;
    if (rect.width <= 0 && rect.height <= 0) return;
    minX = Math.min(minX, rect.left);
    maxX = Math.max(maxX, rect.right);
  };

  // Text is the primary pagination fact for normal books. Measuring text ranges
  // catches overflow that scrollWidth can hide for vertical-rl negative X flow.
  const walker = document.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.data.trim() || !isSemanticTextNode(node)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) includeRect(rect);
    range.detach?.();
  }

  // Replaced/atomic content can occupy pages without any semantic text.
  for (const element of Array.from(body.querySelectorAll(
    'img,svg,video,canvas,object,embed,iframe,table,pre,figure',
  ))) {
    includeRect(element.getBoundingClientRect());
  }

  const geometricExtent = presentation.writingMode === 'vertical-rl'
    ? bodyRect.right - minX
    : maxX - bodyRect.left;
  const authoredExtent = Math.max(pageExtent, geometricExtent, body.scrollWidth);
  const pageCount = Math.max(1, Math.ceil((authoredExtent - 0.5) / pageExtent));

  return createPaginatedPageMap({
    pageCount,
    pageExtent,
    pageGap: 0,
    visiblePageCount,
    leadingBlankCount: reflowableNeedsLeadingBlankPage(plan) ? 1 : 0,
  });
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
  rightAnchoredNegative = false,
): number {
  if (flow === 'left-to-right') return clamp(Math.max(0, element.scrollLeft), 0, max);
  const raw = element.scrollLeft;
  // Reader-padded vertical-rl content is right anchored and advances into
  // negative overflow. Its zero position is therefore unambiguously the
  // authored start; probing positive RTL models at zero misclassifies it as
  // start-at-max in Chromium.
  if (rightAnchoredNegative) return rightAnchoredVerticalLogicalOffset(raw, max);
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
  rightAnchoredNegative = false,
): void {
  const value = clamp(logical, 0, max);
  if (flow === 'left-to-right') {
    element.scrollLeft = value;
    return;
  }

  if (rightAnchoredNegative) {
    element.scrollLeft = rightAnchoredVerticalRawOffset(value, max);
    return;
  }

  const original = element.scrollLeft;
  element.scrollLeft = -value;
  if (value === 0 || element.scrollLeft < 0) return;

  element.scrollLeft = original;
  const model = detectPositiveRtlModel(element, original);
  element.scrollLeft = model === 'start-at-max' ? max - value : value;
}

function usesRightAnchoredVerticalExtent(
  presentation: ReflowablePresentation,
  pageMap: PaginatedPageMap | null,
): boolean {
  return presentation.writingMode === 'vertical-rl' && pageMap !== null;
}

export function rightAnchoredVerticalLogicalOffset(rawScrollLeft: number, max: number): number {
  return clamp(-rawScrollLeft, 0, Math.max(0, max));
}

export function rightAnchoredVerticalRawOffset(logicalOffset: number, max: number): number {
  return -clamp(logicalOffset, 0, Math.max(0, max));
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
): import('../../locator').DomPoint | null {
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
  point: import('../../locator').DomPoint,
  pageMap: PaginatedPageMap | null = null,
): void {
  const scrolling = getScrollingElement(document);

  // Fragment locators resolve to the target element at offset zero. A
  // collapsed range at that boundary is ambiguous in vertical writing (it can
  // report the preceding page edge), so paginated flow uses the element's own
  // box while scrolled flow delegates to scrollIntoView.
  if (point.node.nodeType === 1 && point.offset === 0) {
    const element = point.node as Element;
    if (plan.renderer === 'reflowable-paginated') {
      const max = pageMap?.maxLogicalOffset
        ?? Math.max(0, measureDocument(document).scrollWidth - plan.viewport.width);
      const rightAnchored = usesRightAnchoredVerticalExtent(presentation, pageMap);
      const current = getHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max, rightAnchored);
      const rect = element.getBoundingClientRect();
      const delta = presentation.horizontalFlow === 'right-to-left'
        ? plan.viewport.width - rect.right
        : rect.left;
      setHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max, current + delta, rightAnchored);
      snapHorizontalToPage(document, plan, presentation, policy, pageMap);
    } else {
      element.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'start' });
    }
    return;
  }

  const range = document.createRange();
  try {
    range.setStart(point.node, Math.max(0, point.offset));
    range.collapse(true);
  } catch {
    const element = point.node.nodeType === 1 ? point.node as Element : point.node.parentElement;
    element?.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'start' });
    if (plan.renderer === 'reflowable-paginated') snapHorizontalToPage(document, plan, presentation, policy, pageMap);
    return;
  }
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  range.detach?.();
  if (!rect) return;

  if (plan.renderer === 'reflowable-paginated') {
    const max = pageMap?.maxLogicalOffset
      ?? Math.max(0, measureDocument(document).scrollWidth - plan.viewport.width);
    const rightAnchored = usesRightAnchoredVerticalExtent(presentation, pageMap);
    const current = getHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max, rightAnchored);
    const delta = presentation.horizontalFlow === 'right-to-left'
      ? plan.viewport.width - rect.right
      : rect.left;
    setHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max, current + delta, rightAnchored);
    snapHorizontalToPage(document, plan, presentation, policy, pageMap);
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
  pageMap: PaginatedPageMap | null = null,
): import('../model').RendererNavigationResult {
  const scrolling = getScrollingElement(document);
  const measurement = measureDocument(document);

  if (plan.renderer === 'reflowable-paginated') {
    if (pageMap) {
      const rightAnchored = usesRightAnchoredVerticalExtent(presentation, pageMap);
      const logical = getHorizontalLogicalOffset(
        scrolling,
        presentation.horizontalFlow,
        pageMap.maxLogicalOffset,
        rightAnchored,
      );
      const target = pageMapNavigationTarget(pageMap, logical, direction);
      if (target.status === 'boundary') return target;
      setHorizontalLogicalOffset(
        scrolling,
        presentation.horizontalFlow,
        pageMap.maxLogicalOffset,
        target.logicalOffset,
        rightAnchored,
      );
      return {
        status: 'moved',
        layout: snapshotReflowableLayout(document, plan, presentation, policy, pageMap),
      };
    }

    const pageGap = reflowablePageGap(plan, policy, presentation.writingMode);
    const pageWidth = reflowablePageWidth(plan, policy, presentation.writingMode);
    const max = Math.max(0, measurement.scrollWidth - plan.viewport.width);
    const logical = getHorizontalLogicalOffset(scrolling, presentation.horizontalFlow, max);
    const geometry = calculatePaginatedGeometry({
      scrollExtent: measurement.scrollWidth,
      pageExtent: pageWidth,
      pageGap,
      logicalOffset: logical,
    });
    const visible = plan.spread.execution === 'intra-document' ? 2 : 1;
    const deltaPages = direction === 'forward' ? visible : -visible;
    const targetPage = geometry.currentPage - 1 + deltaPages;
    if (targetPage < 0) return { status: 'boundary', edge: 'start' };
    if (targetPage >= geometry.pageCount) return { status: 'boundary', edge: 'end' };
    setHorizontalLogicalOffset(
      scrolling,
      presentation.horizontalFlow,
      max,
      targetPage * geometry.pageAdvance,
    );
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
