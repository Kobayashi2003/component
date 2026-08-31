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
  pageOffsetForProgression,
  scrollProgression,
} from '../../core/renderer/reflowable/geometry';
import { DEFAULT_REFLOWABLE_RENDERER_POLICY } from '../../core/renderer/reflowable/model';
import { reflowableScrollAxis } from '../../core/renderer/reflowable/dom';
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

// 3. Vertical writing paginates through CSS multicol, exactly like horizontal
// writing does. The reader never computes a page boundary itself: an arithmetic
// boundary at `index * pageSize` has no relation to where the line boxes fall,
// so it slices whichever line sits there and splits that line across two pages.
// A fragmentation break lands between line boxes by construction.
//
// In vertical-rl the inline axis is vertical, so column boxes stack DOWN the
// page and paging is a positive scrollTop. An earlier revision read that
// stacking as a multicol failure and replaced fragmentation with a sliding
// window; the stacking was right, the horizontal transport under it was wrong.
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
  assert(css.includes('column-fill: auto'), 'vertical pagination must fragment through CSS multicol');
  assert(!/column-width: auto/.test(css), 'vertical pagination must give columns a definite inline size');
  assert(css.includes('overflow-y: auto'), 'vertical column boxes stack on Y, so paging scrolls Y');
  assert(css.includes('overflow-x: hidden'), 'the block axis of a vertical page must not scroll');
  assert(css.includes('html::-webkit-scrollbar, body::-webkit-scrollbar { display: none'), 'paginated documents must hide publisher and root scrollbars');

  assert(reflowableScrollAxis('vertical-rl', 'reflowable-paginated') === 'vertical',
    'vertical pagination advances along physical Y');
  assert(reflowableScrollAxis('horizontal-tb', 'reflowable-paginated') === 'horizontal',
    'horizontal pagination advances along physical X');
  assert(reflowableScrollAxis('vertical-rl', 'reflowable-scroll') === 'horizontal',
    'vertical scrolled flow still overflows along its block axis');

  // A vertical spread is one continuous flow across both leaves, not two
  // half-width fragmentainers, so the page extent is the whole viewport.
  assert(reflowablePageWidth(plan, DEFAULT_REFLOWABLE_RENDERER_POLICY, 'vertical-rl') === 600,
    'a vertical page spans the full inline extent of the viewport');
  assert(reflowablePageGap(plan, DEFAULT_REFLOWABLE_RENDERER_POLICY, 'vertical-rl') === 0,
    'a zero page margin leaves no gap between vertical columns');

  // Column size plus gap must advance by exactly one viewport, or the next page
  // bleeds into the current one.
  const margined = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 800, height: 600 },
    preferences: { ...DEFAULT_READER_PREFERENCES, pageMarginPercent: 4 },
    contentHints: { writingMode: 'vertical-rl', direction: 'rtl' },
  });
  const extent = reflowablePageWidth(margined, DEFAULT_REFLOWABLE_RENDERER_POLICY, 'vertical-rl');
  const gap = reflowablePageGap(margined, DEFAULT_REFLOWABLE_RENDERER_POLICY, 'vertical-rl');
  assert(extent === 552 && gap === 48, 'a 4% page margin must take 24px off each edge of a 600px page');
  assert(extent + gap === 600, 'a vertical page advance must equal exactly one viewport');

  // `ruby-position: over` paints furigana on the block-start side of its base,
  // which in vertical-rl is the right-hand edge of the page. Without reserved
  // room the first column of every page has its furigana cropped.
  assert(css.includes('padding-block: 1em'),
    'vertical pages must reserve block-axis room for first-column ruby');
}

// 4. A leading blank column belongs to horizontal two-up only.
//
// It exists to push a chapter opening onto the correct leaf of a spread, which
// presupposes that a spread is two side-by-side fragmentainers. A vertical
// spread is not: it is one fragmentainer running right-to-left across both
// leaves, so a blank column there aligns nothing and simply makes the reader's
// first page turn into the chapter land on an empty page.
{
  const rtlPublication: Publication = {
    ...publication,
    pageProgressionDirection: 'rtl',
    rendition: { ...publication.rendition, spread: 'auto' },
    spine: [{ ...item, rendition: { layout: 'reflowable', pageSpread: 'left' } }],
  };
  const placed = planRendition({
    publication: rtlPublication,
    spineItem: rtlPublication.spine[0]!,
    viewport: { width: 1200, height: 820 },
    preferences: { ...DEFAULT_READER_PREFERENCES, spread: 'double' },
    contentHints: { writingMode: 'vertical-rl', direction: 'rtl' },
  });
  assert(placed.spread.execution === 'intra-document' && placed.spread.mode === 'double',
    'fixture must produce the two-up plan the leading blank applies to');
  assert(placed.spread.placement === 'left', 'authored page-spread placement must survive planning');

  const vertical = buildReflowableLayoutCss(placed, DEFAULT_REFLOWABLE_RENDERER_POLICY, 'vertical-rl');
  assert(!vertical.includes('break-after: column'),
    'vertical pagination must not spend its first page on a blank alignment column');

  const horizontal = buildReflowableLayoutCss(placed, DEFAULT_REFLOWABLE_RENDERER_POLICY, 'horizontal-tb');
  assert(horizontal.includes('break-after: column'),
    'horizontal two-up still needs the blank column to reach the correct leaf');
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

// 8. A strictly pure single-image document is page content, not prose waiting
// to fragment. Its image is fitted against the definite iframe viewport rather
// than an auto-height publisher wrapper; captions and scrolled flow stay on the
// ordinary reflowable path.
{
  const pureImagePage = {
    kind: 'single-image-page' as const,
    pageLike: true,
    semanticTextLength: 0,
    replacedElementCount: 1,
    intrinsicViewport: { width: 1600, height: 1142 },
    likelySpanningSpread: true,
  };
  const plan = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 1600, height: 650 },
    contentHints: { writingMode: 'horizontal-tb', page: pureImagePage },
  });
  assert(plan.contentPage === pureImagePage, 'renderer plan must retain the preflight page profile');
  const css = buildReflowableLayoutCss(plan, DEFAULT_REFLOWABLE_RENDERER_POLICY);
  assert(css.includes('body img {') && css.includes('position: fixed !important'),
    'a pure image page must escape indefinite publisher wrapper geometry');
  assert(css.includes('max-width: 1600px !important') && css.includes('max-height: 650px !important'),
    'a pure image page must be bounded by the exact content viewport');
  assert(css.includes('width: auto !important') && css.includes('height: auto !important'),
    'viewport containment must preserve the image intrinsic aspect ratio');
  assert(!css.includes('column-fill: auto'), 'a pure image page must not enter prose fragmentation');

  const unassistedPlan = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 1600, height: 650 },
    preferences: {
      ...DEFAULT_READER_PREFERENCES,
      compatibility: { ...DEFAULT_READER_PREFERENCES.compatibility, fitSingleImagePages: false },
    },
    contentHints: { page: pureImagePage },
  });
  const unassistedCss = buildReflowableLayoutCss(unassistedPlan, DEFAULT_REFLOWABLE_RENDERER_POLICY);
  assert(unassistedCss.includes('column-fill: auto') && !unassistedCss.includes('position: fixed !important'),
    'disabling single-image compatibility must preserve publisher reflowable layout');

  const captionedPlan = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 1600, height: 650 },
    contentHints: { page: { ...pureImagePage, semanticTextLength: 4 } },
  });
  const captionedCss = buildReflowableLayoutCss(captionedPlan, DEFAULT_REFLOWABLE_RENDERER_POLICY);
  assert(captionedCss.includes('column-fill: auto') && !captionedCss.includes('position: fixed !important'),
    'a page with a caption must retain ordinary reflowable layout');

  const scrolledPlan = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 1600, height: 650 },
    preferences: { ...DEFAULT_READER_PREFERENCES, flow: 'scrolled' },
    contentHints: { page: pureImagePage },
  });
  const scrolledCss = buildReflowableLayoutCss(scrolledPlan, DEFAULT_REFLOWABLE_RENDERER_POLICY);
  assert(scrolledPlan.renderer === 'reflowable-scroll' && !scrolledCss.includes('position: fixed !important'),
    'the page-sized image recovery must not override an explicit scrolled flow');
}

// 9. srcset tokenization must not mistake the comma inside a data URL for a
// candidate separator.
{
  const candidates = parseSrcset('data:image/svg+xml,%3Csvg%3E 1x, images/a.png 2x');
  assert(candidates.length === 2, 'data URL srcset must remain one candidate');
  assert(candidates[0]?.url === 'data:image/svg+xml,%3Csvg%3E', 'data URL payload comma must be retained');
  assert(candidates[0]?.descriptor === '1x' && candidates[1]?.descriptor === '2x', 'srcset descriptors must be retained');
}

// 10. XHTML <base href> participates in resource resolution, including an
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

// Page count is recovered by rounding, because fragmentation only ever produces
// whole columns and the measured extent carries error from two directions.
{
  // The regression: the root box is the iframe's client box, whose height the
  // browser rounds, while the fragmentainer height came from a floored viewport
  // measurement. On a viewport height ending in .5 or above they differ by one
  // pixel, and rounding up made a whole extra page out of it. That page could
  // never be scrolled to, so the section never reported its end and paging
  // stopped there for good.
  const oneShortPage = calculatePaginatedGeometry({
    scrollExtent: 536, pageExtent: 535, pageGap: 0, logicalOffset: 0,
  });
  assert(oneShortPage.pageCount === 1, `a single column measured one pixel taller than its fragmentainer is still one page, got ${oneShortPage.pageCount}`);

  // The other direction still has to count every real column. Browsers leave
  // the container's trailing padding out of the scroll extent, so N columns
  // measure N * advance - inlineMargin; every engine tested agrees on this.
  for (const [pageExtent, pageGap] of [[712, 0], [560, 40], [480, 120], [384, 216]] as const) {
    const advance = pageExtent + pageGap;
    const inlineMargin = pageGap / 2;
    for (const columns of [1, 2, 3, 7, 24]) {
      const scrollExtent = columns * advance - (columns > 1 ? inlineMargin : 0);
      const geometry = calculatePaginatedGeometry({ scrollExtent, pageExtent, pageGap, logicalOffset: 0 });
      assert(
        geometry.pageCount === columns,
        `${columns} columns of ${pageExtent}+${pageGap} must count as ${columns} pages, got ${geometry.pageCount}`,
      );
    }
  }

  // Every page the count claims has to be close enough to the scroll range that
  // the turn still registers as movement. The clamp can leave the final page
  // short by the inline margin, which only reveals blank gutter, but a shortfall
  // of half a page or more means the page is not there at all -- which is what
  // `navigateReflowable` treats as the end of the section.
  for (const [pageExtent, pageGap] of [[712, 0], [560, 40], [384, 216]] as const) {
    const advance = pageExtent + pageGap;
    for (const columns of [1, 2, 5]) {
      const scrollExtent = columns * advance - (columns > 1 ? pageGap / 2 : 0);
      const geometry = calculatePaginatedGeometry({ scrollExtent, pageExtent, pageGap, logicalOffset: 0 });
      const lastOffset = (geometry.pageCount - 1) * geometry.pageAdvance;
      const scrollable = Math.max(0, scrollExtent - advance);
      assert(
        lastOffset - scrollable < advance / 2,
        `the last of ${geometry.pageCount} pages must still register as a turn: needs ${lastOffset}, range is ${scrollable}`,
      );
    }
  }
}

console.log('Reflowable pagination unit test: PASS');

function assertThrows(fn: () => unknown, message: string): void {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(message);
}
