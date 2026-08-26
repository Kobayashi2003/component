import { parseSrcset } from '../../core/content';
import {
  DEFAULT_READER_PREFERENCES,
  resolvePublicationDocumentBase,
  resolvePublicationDocumentReference,
  type Publication,
  type SpineItem,
} from '../../core/publication';
import { planRendition } from '../../core/rendition';
import {
  calculatePaginatedGeometry,
  createPaginatedPageMap,
  pageMapNavigationTarget,
  pageMapPosition,
  pageOffsetForProgression,
  scrollProgression,
} from '../../core/renderer/reflowable/geometry';
import { DEFAULT_REFLOWABLE_RENDERER_POLICY } from '../../core/renderer/reflowable/model';
import {
  rightAnchoredVerticalLogicalOffset,
  rightAnchoredVerticalRawOffset,
} from '../../core/renderer/reflowable/dom';
import {
  buildReaderPreferenceCss,
  buildReflowableLayoutCss,
  reflowablePageGap,
  reflowablePageInset,
  reflowablePageWidth,
} from '../../core/renderer/reflowable/styles';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makePublication(): Publication {
  const spineItem: SpineItem = {
    index: 0,
    idref: 'chapter',
    href: 'EPUB/text/chapter.xhtml',
    path: 'EPUB/text/chapter.xhtml',
    remote: false,
    mediaType: 'application/xhtml+xml',
    linear: true,
    properties: [],
    rendition: { layout: 'reflowable' },
  };
  return {
    version: '3.3',
    packagePath: 'EPUB/package.opf',
    metadata: {
      title: 'Reflowable pagination fixture',
      creators: [],
      contributors: [],
      entries: [],
    },
    manifest: [{
      id: 'chapter',
      sourceHref: 'text/chapter.xhtml',
      href: spineItem.href,
      path: spineItem.path,
      remote: false,
      mediaType: spineItem.mediaType,
      properties: [],
    }],
    spine: [spineItem],
    navigation: { source: 'none', toc: [], landmarks: [], pageList: [] },
    pageProgressionDirection: 'ltr',
    rendition: {
      layout: 'reflowable',
      orientation: 'auto',
      spread: 'none',
      flow: 'paginated',
    },
  };
}

// 1. Dynamic pages come from the post-layout CSS multicol extent, not an
// arbitrary generated-location sampling interval.
{
  const geometry = calculatePaginatedGeometry({
    scrollExtent: 5 * 800 + 4 * 32,
    pageExtent: 800,
    pageGap: 32,
    logicalOffset: 2 * 832,
  });
  assert(geometry.pageCount === 5, 'five physical columns must produce five virtual pages');
  assert(geometry.currentPage === 3, 'offset of two page advances must select page three');
  assert(geometry.progression === 0.5, 'middle of five pages must report 50% progression');
  assert(geometry.snappedOffset === 1664, 'page geometry must snap to an exact page advance');
  assert(pageOffsetForProgression(1, 5, 832) === 3328, '100% progression must map to the last page');
  assert(scrollProgression(500, 1000) === 0.5, 'scroll progression must be continuous and normalized');
}

// 1a. An exact two-column extent must not acquire a third phantom page.
{
  const geometry = calculatePaginatedGeometry({
    scrollExtent: 2 * 440 + 32,
    pageExtent: 440,
    pageGap: 32,
    logicalOffset: 0,
  });
  assert(geometry.pageCount === 2, 'exact column extents must not report a phantom trailing page');
}

const publication = makePublication();
const item = publication.spine[0]!;

// 2. The renderer receives the exact viewport used by the planner. Horizontal
// writing uses its physical width as CSS multicol inline size.
{
  const plan = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 800, height: 600 },
    preferences: DEFAULT_READER_PREFERENCES,
    contentHints: { writingMode: 'horizontal-tb', direction: 'ltr' },
  });
  assert(plan.viewport.width === 800 && plan.viewport.height === 600, 'planner must retain viewport metrics');
  const css = buildReflowableLayoutCss(plan, DEFAULT_REFLOWABLE_RENDERER_POLICY, 'horizontal-tb');
  assert(css.includes('column-width: 800px'), 'horizontal writing column inline size must use page width');
  assert(css.includes('column-fill: auto'), 'paginated reflow must fill fixed-height columns sequentially');
}

// 3. Vertical writing must NOT use CSS multicol pagination. In vertical-rl,
// block flow already advances horizontally; multicol would fragment along the
// physical Y axis and can leave the second half of a spread blank.
{
  const plan = planRendition({
    publication: {
      ...publication,
      rendition: { ...publication.rendition, spread: 'auto' },
    },
    spineItem: item,
    viewport: { width: 800, height: 600 },
    preferences: { ...DEFAULT_READER_PREFERENCES, spread: 'double' },
    contentHints: { writingMode: 'vertical-rl', direction: 'rtl' },
  });
  assert(plan.spread.execution === 'intra-document', 'double reflowable text should remain one spine document');
  const css = buildReflowableLayoutCss(plan, DEFAULT_REFLOWABLE_RENDERER_POLICY, 'vertical-rl');
  assert(css.includes('column-width: auto'), 'vertical pagination must leave CSS multicol disabled');
  assert(css.includes('overflow-y: hidden'), 'vertical pagination must expose horizontal block overflow only');
  assert(css.includes('html::-webkit-scrollbar, body::-webkit-scrollbar { display: none'), 'paginated documents must hide publisher and root scrollbars');
  assert(css.includes('margin: 0 0 0 auto'), 'vertical-rl content must remain anchored to the physical right edge');
  assert(reflowablePageWidth(plan, DEFAULT_REFLOWABLE_RENDERER_POLICY, 'vertical-rl') === 400,
    'two-up vertical pagination must divide the viewport into two logical 400px slots');
  assert(rightAnchoredVerticalLogicalOffset(0, 1_600) === 0,
    'right-anchored vertical-rl zero scroll must remain the authored start');
  assert(rightAnchoredVerticalLogicalOffset(-800, 1_600) === 800,
    'negative physical scroll must advance from the vertical-rl authored start');
  assert(rightAnchoredVerticalRawOffset(1_600, 1_600) === -1_600,
    'the vertical-rl logical end must map back to maximum negative overflow');
}

// 4. PageMap separates authored pages from physical spread slots. An odd final
// page gets a reader-owned trailing blank instead of becoming an early chapter
// boundary (the regression behind one-click chapter skips).
{
  const map = createPaginatedPageMap({
    pageCount: 5,
    pageExtent: 480,
    visiblePageCount: 2,
  });
  assert(map.slotCount === 6, 'five authored pages in two-up mode need one trailing blank slot');
  assert(map.maxLogicalOffset === 1920, 'the last authored spread must remain horizontally reachable');

  const firstTurn = pageMapNavigationTarget(map, 0, 'forward');
  assert(firstTurn.status === 'moved' && firstTurn.pageIndex === 2 && firstTurn.logicalOffset === 960,
    'first turn must move from pages 1-2 to pages 3-4');
  const secondTurn = pageMapNavigationTarget(map, 960, 'forward');
  assert(secondTurn.status === 'moved' && secondTurn.pageIndex === 4 && secondTurn.logicalOffset === 1920,
    'second turn must expose authored page 5 plus a reader-owned blank');
  const end = pageMapNavigationTarget(map, 1920, 'forward');
  assert(end.status === 'boundary' && end.edge === 'end', 'only the final authored spread may report the chapter end');
  assert(pageMapPosition(map, 1920).currentPage === 5, 'reader-added blank slots must not inflate the logical page number');

  const placed = createPaginatedPageMap({
    pageCount: 5,
    pageExtent: 480,
    visiblePageCount: 2,
    leadingBlankCount: 1,
  });
  assert(placed.slotCount === 6 && placed.leadingBlankCount === 1,
    'authored first-page placement must reserve one leading reader-owned blank without changing authored page count');
  const placedTurn = pageMapNavigationTarget(placed, 0, 'forward');
  assert(placedTurn.status === 'moved' && placedTurn.pageIndex === 1 && placedTurn.logicalOffset === 960,
    'after a leading blank spread, the next spread must begin at authored page 2 rather than skipping to page 3');
  assert(pageMapPosition(placed, 1920).currentPage === 4,
    'the final placed spread should expose authored pages 4-5 while excluding the leading blank from logical numbering');
}

// 5. Scrolled documents explicitly remove multicol pagination.
{
  const plan = planRendition({
    publication: {
      ...publication,
      rendition: { ...publication.rendition, flow: 'scrolled-doc' },
    },
    spineItem: item,
    viewport: { width: 800, height: 600 },
  });
  assert(plan.renderer === 'reflowable-scroll', 'scrolled-doc must select the scroll renderer');
  const css = buildReflowableLayoutCss(plan, DEFAULT_REFLOWABLE_RENDERER_POLICY);
  assert(css.includes('column-width: auto'), 'scroll renderer must disable forced column width');
  assert(css.includes('overflow: auto'), 'scroll renderer must expose document overflow');
  assert(css.includes('scrollbar-color: rgba(96, 98, 94, 0.58) transparent'), 'scroll renderer must use the reader scrollbar treatment');
}

// 6. User font names are CSS-string escaped instead of being injected as raw
// declarations into the publication document.
{
  const plan = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 800, height: 600 },
    preferences: {
      ...DEFAULT_READER_PREFERENCES,
      fontFamily: 'Reader"; color: red',
    },
  });
  const css = buildReaderPreferenceCss(plan);
  assert(css.includes('font-family: "Reader\\"; color: red"'), 'font family must remain one escaped CSS string');
  assert(!css.includes('font-family: "Reader"; color: red'), 'authored user value must not break out of the declaration');
}

// 7. Reader page margins narrow each horizontal text column without changing
// the physical page advance used by navigation.
{
  const plan = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 800, height: 600 },
    preferences: { ...DEFAULT_READER_PREFERENCES, pageMarginPercent: 10 },
  });
  const pageWidth = reflowablePageWidth(plan, DEFAULT_REFLOWABLE_RENDERER_POLICY);
  const pageGap = reflowablePageGap(plan, DEFAULT_REFLOWABLE_RENDERER_POLICY);
  const inset = reflowablePageInset(plan, DEFAULT_REFLOWABLE_RENDERER_POLICY);
  assert(pageWidth === 640 && inset === 80, '10% margins should leave a 640px text column inside an 800px page');
  assert(pageWidth + pageGap === 832, 'margin space must preserve the original page width plus renderer gutter');
  const css = buildReflowableLayoutCss(plan, DEFAULT_REFLOWABLE_RENDERER_POLICY);
  assert(css.includes('inset-inline-start: 80px') && css.includes('column-gap: 192px'), 'layout CSS should center every text column inside its physical page slot');
}

// 8. srcset tokenization must not mistake the comma inside a data URL for a
// candidate separator.
{
  const candidates = parseSrcset('data:image/svg+xml,%3Csvg%3E 1x, images/a.png 2x');
  assert(candidates.length === 2, 'data URL srcset must remain one candidate');
  assert(candidates[0]?.url === 'data:image/svg+xml,%3Csvg%3E', 'data URL payload comma must be retained');
  assert(candidates[0]?.descriptor === '1x' && candidates[1]?.descriptor === '2x', 'srcset descriptors must be retained');
}

// 8. XHTML <base href> participates in resource resolution, including an
// intentionally remote base, while local bases remain container constrained.
{
  const local = resolvePublicationDocumentReference(
    'EPUB/text/chapter.xhtml',
    '../assets/',
    'images/cover.png',
  );
  assert(local.path === 'EPUB/assets/images/cover.png', 'local document base must resolve relative to the XHTML document');

  const remote = resolvePublicationDocumentReference(
    'EPUB/text/chapter.xhtml',
    'https://example.com/book/',
    'images/cover.png',
  );
  assert(remote.remote && remote.href === 'https://example.com/book/images/cover.png', 'remote HTML base must preserve remote URL semantics');

  assertThrows(
    () => resolvePublicationDocumentReference('EPUB/text/chapter.xhtml', '../../../outside/', 'a.png'),
    'local document base must not walk above the OCF root',
  );

  const sectionBase = resolvePublicationDocumentBase('EPUB/text/chapter.xhtml', '../assets/', 'sections/');
  assert(sectionBase === '../assets/sections/', 'nested xml:base must retain inherited directory semantics');
  const nested = resolvePublicationDocumentReference('EPUB/text/chapter.xhtml', sectionBase, 'images/figure.png');
  assert(nested.path === 'EPUB/assets/sections/images/figure.png', 'descendant resources must resolve through nested xml:base');

  const remoteSection = resolvePublicationDocumentBase(
    'EPUB/text/chapter.xhtml',
    'https://example.com/book/',
    'parts/',
  );
  assert(remoteSection === 'https://example.com/book/parts/', 'nested xml:base must preserve an inherited remote base');
}

console.log('Reflowable pagination unit test: PASS');

function assertThrows(fn: () => unknown, message: string): void {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(message);
}
