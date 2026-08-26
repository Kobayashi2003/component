import {
  DEFAULT_READER_PREFERENCES,
  type Publication,
  type SpineItem,
} from '../../core/publication';
import { parseSvgViewBox, parseViewportMetaContent } from '../../core/content';
import { planRendition } from '../../core/rendition';
import { calculateFixedLayoutPlacement } from '../../core/renderer/fixed-layout/geometry';
import { resolveSpreadSlotAssignment } from '../../core/renderer/spread/slots';
import { resolveSpreadGap } from '../../core/renderer/spread/spread-renderer';
import { DEFAULT_REFLOWABLE_RENDERER_POLICY } from '../../core/renderer/reflowable/model';
import { reflowablePageGap, reflowablePageWidth } from '../../core/renderer/reflowable/styles';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeItem(index: number, rendition: SpineItem['rendition'] = {}, layout?: 'reflowable' | 'pre-paginated'): SpineItem {
  return {
    index,
    idref: `item-${index}`,
    href: `EPUB/page-${index}.xhtml`,
    path: `EPUB/page-${index}.xhtml`,
    remote: false,
    mediaType: 'application/xhtml+xml',
    linear: true,
    properties: [],
    rendition: layout ? { ...rendition, layout } : rendition,
  };
}

function makePublication(
  direction: 'ltr' | 'rtl',
  items: readonly SpineItem[],
): Publication {
  return {
    version: '3.3',
    packagePath: 'EPUB/package.opf',
    metadata: { creators: [], contributors: [], entries: [] },
    manifest: items.map(item => ({
      id: item.idref,
      sourceHref: item.path!,
      href: item.href,
      path: item.path,
      remote: false,
      mediaType: item.mediaType,
      properties: [],
    })),
    spine: items,
    navigation: { source: 'none', toc: [], landmarks: [], pageList: [] },
    pageProgressionDirection: direction,
    rendition: { layout: 'pre-paginated', orientation: 'auto', spread: 'auto', flow: 'auto' },
  };
}

// 1. XHTML FXL viewport recovery keeps the numeric prefix required by EPUB RS.
{
  const viewport = parseViewportMetaContent('width=1200px, height=600bogus');
  assert(viewport?.width === 1200 && viewport.height === 600, 'numeric viewport prefixes must be recovered');
  const device = parseViewportMetaContent('width=device-width,height=device-height', { deviceWidth: 900, deviceHeight: 700 });
  assert(device?.width === 900 && device.height === 700, 'device viewport keywords must resolve against the content slot');
}

// 2. SVG FXL ICB comes from viewBox dimensions, not width/height styling.
{
  const viewport = parseSvgViewBox('10 20 844 1200');
  assert(viewport?.width === 844 && viewport.height === 1200, 'SVG viewBox width/height must define the intrinsic viewport');
  assert(parseSvgViewBox('0 0 0 1200') == null, 'non-positive SVG viewBox dimensions must be rejected');
}

// 3. Fixed pages use contain/letterbox geometry without mutating intrinsic size.
{
  const placement = calculateFixedLayoutPlacement(
    { width: 1200, height: 1600 },
    { width: 1000, height: 700 },
  );
  assert(Math.abs(placement.scale - 0.4375) < 1e-9, 'fixed page must scale by the limiting physical dimension');
  assert(placement.renderedWidth === 525 && placement.renderedHeight === 700, 'rendered page must preserve intrinsic aspect ratio');
  assert(placement.offsetX === 237.5 && placement.offsetY === 0, 'letterboxed page must be centered in its content slot');
  const widthFit = calculateFixedLayoutPlacement(
    { width: 1200, height: 1600 },
    { width: 1000, height: 700 },
    'width',
  );
  assert(widthFit.scale === 5 / 6 && widthFit.renderedHeight > 700, 'fit-width must fill the horizontal axis and allow vertical overflow');
  assert(widthFit.offsetX === 0 && widthFit.offsetY === 0, 'overflowing fit modes must remain scrollable from the leading edge');
  const original = calculateFixedLayoutPlacement(
    { width: 1200, height: 1600 },
    { width: 1000, height: 700 },
    'original',
  );
  assert(original.scale === 1 && original.renderedWidth === 1200, 'original-size mode must preserve intrinsic CSS pixels');
}

// 4. The default policy enables actual synthetic-spread execution.
{
  const publication = makePublication('ltr', [makeItem(0), makeItem(1)]);
  const plan = planRendition({ publication, spineItem: publication.spine[0]!, viewport: { width: 1200, height: 800 } });
  assert(plan.spread.mode === 'double' && plan.spread.execution === 'cross-spine', 'wide fixed-layout auto spread must now be executable by the default engine');
}

// 5. Automatic population follows physical slot progression: LTR left→right,
// RTL right→left.
{
  const ltr = makePublication('ltr', [makeItem(0), makeItem(1), makeItem(2)]);
  const ltrPlan = planRendition({ publication: ltr, spineItem: ltr.spine[0]!, viewport: { width: 1200, height: 800 } });
  const ltrSlots = resolveSpreadSlotAssignment(ltr, ltrPlan);
  assert(ltrSlots.leftSpineIndex === 0 && ltrSlots.rightSpineIndex === 1, 'LTR automatic spreads must populate left then right');

  const rtl = makePublication('rtl', [makeItem(0), makeItem(1), makeItem(2)]);
  const rtlPlan = planRendition({ publication: rtl, spineItem: rtl.spine[0]!, viewport: { width: 1200, height: 800 } });
  const rtlSlots = resolveSpreadSlotAssignment(rtl, rtlPlan);
  assert(rtlSlots.rightSpineIndex === 0 && rtlSlots.leftSpineIndex === 1, 'RTL automatic spreads must populate right then left');
}

// 6. An authored first-page right placement inserts a physical blank on the
// left instead of pairing it with the following page.
{
  const publication = makePublication('ltr', [
    makeItem(0, { pageSpread: 'right' }),
    makeItem(1),
    makeItem(2),
  ]);
  const plan = planRendition({
    publication,
    spineItem: publication.spine[0]!,
    viewport: { width: 1200, height: 800 },
    preferences: { ...DEFAULT_READER_PREFERENCES, spread: 'double' },
  });
  const slots = resolveSpreadSlotAssignment(publication, plan);
  assert(slots.leftSpineIndex == null && slots.rightSpineIndex === 0, 'forced right first page must create a blank left slot');
}

// 7. Explicit complementary adjacent placements form a true spread when their
// physical slots follow the publication's reading order.
{
  const publication = makePublication('rtl', [
    makeItem(0, { pageSpread: 'right' }),
    makeItem(1, { pageSpread: 'left' }),
  ]);
  const plan = planRendition({ publication, spineItem: publication.spine[0]!, viewport: { width: 1200, height: 800 } });
  assert(plan.spread.trueSpread != null, 'adjacent complementary authored placements must be recognized as a true spread');
  const slots = resolveSpreadSlotAssignment(publication, plan);
  assert(slots.leftSpineIndex === 1 && slots.rightSpineIndex === 0 && slots.trueSpread, 'true spread must preserve authored physical slots');
  const customGutterPlan = planRendition({
    publication,
    spineItem: publication.spine[0]!,
    viewport: { width: 1200, height: 800 },
    preferences: { ...DEFAULT_READER_PREFERENCES, spread: 'double', fixedLayoutGutter: 12 },
  });
  assert(resolveSpreadGap(publication, customGutterPlan, slots, 24) === 12, 'fixed-layout spreads must honor the user comic gutter');
}

// 8. Alternating RTL manga placements must not pair pages across a page-turn
// boundary. Advancing from one spread to the next replaces both slots.
{
  const publication = makePublication('rtl', [
    makeItem(0),
    makeItem(1, { pageSpread: 'right' }),
    makeItem(2, { pageSpread: 'left' }),
    makeItem(3, { pageSpread: 'right' }),
    makeItem(4, { pageSpread: 'left' }),
    makeItem(5, { pageSpread: 'right' }),
    makeItem(6, { pageSpread: 'left' }),
  ]);
  const current = planRendition({ publication, spineItem: publication.spine[4]!, viewport: { width: 1200, height: 800 } });
  const next = planRendition({ publication, spineItem: publication.spine[5]!, viewport: { width: 1200, height: 800 } });
  const currentSlots = resolveSpreadSlotAssignment(publication, current);
  const nextSlots = resolveSpreadSlotAssignment(publication, next);
  assert(currentSlots.leftSpineIndex === 4 && currentSlots.rightSpineIndex === 3, 'current RTL manga spread must contain pages 3-4');
  assert(nextSlots.leftSpineIndex === 6 && nextSlots.rightSpineIndex === 5, 'next RTL manga spread must replace both slots with pages 5-6');
}

// 9. Ordinary reflowable two-up is intra-document: two consecutive dynamic
// pages from one XHTML document, not two different chapters.
{
  const publication = makePublication('ltr', [
    makeItem(0, {}, 'reflowable'),
    makeItem(1, {}, 'reflowable'),
  ]);
  const plan = planRendition({
    publication,
    spineItem: publication.spine[0]!,
    viewport: { width: 1200, height: 800 },
    preferences: { ...DEFAULT_READER_PREFERENCES, spread: 'double' },
  });
  assert(plan.spread.execution === 'intra-document', 'ordinary reflowable double-page mode must remain inside one spine document');
  assert(reflowablePageGap(plan, DEFAULT_REFLOWABLE_RENDERER_POLICY) === 32, 'ordinary reflowable spread keeps the reader page gutter');
  assert(reflowablePageWidth(plan, DEFAULT_REFLOWABLE_RENDERER_POLICY) === 584, 'reflowable spread must expose two dynamic 584px pages inside a 1200px viewport');
}

// 9. A fixed page at a mixed-layout boundary may compose with a reflowable
// neighbor; each physical slot still chooses its own renderer independently.
{
  const publication = makePublication('ltr', [
    makeItem(0, {}, 'pre-paginated'),
    makeItem(1, {}, 'reflowable'),
  ]);
  const plan = planRendition({
    publication,
    spineItem: publication.spine[0]!,
    viewport: { width: 1200, height: 800 },
    preferences: { ...DEFAULT_READER_PREFERENCES, spread: 'double' },
  });
  assert(plan.spread.execution === 'cross-spine', 'fixed-layout active pages require cross-spine composition');
  const slots = resolveSpreadSlotAssignment(publication, plan);
  assert(slots.leftSpineIndex === 0 && slots.rightSpineIndex === 1, 'mixed-layout boundary pages must remain composable as physical neighbors');
}

// 10. Navigation across mixed-layout spine items must carry the active reader
// theme into every new rendition plan; the renderer may change, preferences do not.
{
  const publication = makePublication('rtl', [
    makeItem(0, {}, 'reflowable'),
    makeItem(1, {}, 'pre-paginated'),
  ]);
  const preferences = { ...DEFAULT_READER_PREFERENCES, theme: 'sepia' as const };
  const chapter = planRendition({ publication, spineItem: publication.spine[0]!, viewport: { width: 900, height: 700 }, preferences });
  const cover = planRendition({ publication, spineItem: publication.spine[1]!, viewport: { width: 900, height: 700 }, preferences });
  assert(chapter.preferences.theme === 'sepia' && cover.preferences.theme === 'sepia', 'mixed-layout navigation must preserve the selected reader theme');
}

console.log('Fixed-layout spread unit test: PASS');
