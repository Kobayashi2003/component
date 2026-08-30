import { MemoryPublicationArchive } from '../../core/archive';
import { createCompatibilityReport } from '../../core/compatibility';
import { normalizeLegacyEpubCss } from '../../core/resources';
import { planRendition } from '../../core/rendition';
import { parseXml } from '../../core/xml';
import { semanticXmlText, collectRubySamples } from '../../core/text';
import type { Publication, PublicationPath } from '../../core/publication';
import { preflightPublicationContent } from '../../core/content/preflight';
import { parseXhtmlContentDocument, type BrowserXmlPlatform } from '../../core/content';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const publication: Publication = {
    version: '3.3',
    packagePath: 'EPUB/package.opf',
    metadata: { title: 'Real-world hardening', creators: [], contributors: [], entries: [] },
    manifest: [
      { id: 'text', sourceHref: 'text.xhtml', href: 'EPUB/text.xhtml', path: 'EPUB/text.xhtml', remote: false, mediaType: 'application/xhtml+xml', properties: [] },
      { id: 'image', sourceHref: 'image.xhtml', href: 'EPUB/image.xhtml', path: 'EPUB/image.xhtml', remote: false, mediaType: 'application/xhtml+xml', properties: [] },
      { id: 'spread', sourceHref: 'spread.xhtml', href: 'EPUB/spread.xhtml', path: 'EPUB/spread.xhtml', remote: false, mediaType: 'application/xhtml+xml', properties: [] },
      { id: 'css', sourceHref: 'style.css', href: 'EPUB/style.css', path: 'EPUB/style.css', remote: false, mediaType: 'text/css', properties: [] },
      { id: 'portrait', sourceHref: 'portrait.jpg', href: 'EPUB/portrait.jpg', path: 'EPUB/portrait.jpg', remote: false, mediaType: 'image/jpeg', properties: [] },
      { id: 'wide', sourceHref: 'wide.jpg', href: 'EPUB/wide.jpg', path: 'EPUB/wide.jpg', remote: false, mediaType: 'image/jpeg', properties: [] },
    ],
    spine: [
      { index: 0, idref: 'text', href: 'EPUB/text.xhtml', path: 'EPUB/text.xhtml', remote: false, mediaType: 'application/xhtml+xml', linear: true, properties: ['page-spread-left'], rendition: { pageSpread: 'left' } },
      { index: 1, idref: 'image', href: 'EPUB/image.xhtml', path: 'EPUB/image.xhtml', remote: false, mediaType: 'application/xhtml+xml', linear: true, properties: [], rendition: {} },
      { index: 2, idref: 'spread', href: 'EPUB/spread.xhtml', path: 'EPUB/spread.xhtml', remote: false, mediaType: 'application/xhtml+xml', linear: true, properties: [], rendition: {} },
    ],
    navigation: { source: 'none', toc: [], landmarks: [], pageList: [] },
    pageProgressionDirection: 'rtl',
    rendition: { layout: 'reflowable', orientation: 'auto', spread: 'auto', flow: 'paginated' },
  };

  const archive = new CountingMemoryPublicationArchive({
    'EPUB/text.xhtml': `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" class="vrtl"><head><link rel="stylesheet" href="style.css"/></head><body><p><ruby>幼<rt>おさな</rt></ruby><ruby>馴<rt>な</rt></ruby><ruby>染<rt>じみ</rt></ruby>です。</p></body></html>`,
    'EPUB/image.xhtml': `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" class="hltr"><head><link rel="stylesheet" href="style.css"/></head><body><img src="portrait.jpg"/></body></html>`,
    'EPUB/spread.xhtml': `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" class="hltr"><head><link rel="stylesheet" href="style.css"/></head><body><img src="wide.jpg"/></body></html>`,
    'EPUB/style.css': `.vrtl{-epub-writing-mode:vertical-rl;-webkit-writing-mode:vertical-rl}.hltr{-epub-writing-mode:horizontal-tb}`,
    'EPUB/portrait.jpg': fakeJpeg(800, 1200),
    'EPUB/wide.jpg': fakeJpeg(1600, 1100),
  });

  const cancelled = new AbortController();
  cancelled.abort(new DOMException('cancelled fixture', 'AbortError'));
  let observedCancellation = false;
  try { await preflightPublicationContent(archive, publication, cancelled.signal); }
  catch (error) { observedCancellation = error instanceof DOMException && error.name === 'AbortError'; }
  assert(observedCancellation, 'preflight must stop immediately when its open signal is cancelled');

  const preflight = await preflightPublicationContent(archive, publication);
  assert(archive.readCounts.get('EPUB/style.css') === 1, 'concurrent preflight must share one stylesheet decompression across spine documents');
  const textHints = preflight.hints.get(0)!;
  const imageHints = preflight.hints.get(1)!;
  const spreadHints = preflight.hints.get(2)!;
  assert(textHints.writingMode === 'vertical-rl', 'legacy .vrtl CSS must resolve before the first rendition plan');
  assert(imageHints.page?.kind === 'single-image-page' && !imageHints.page.likelySpanningSpread, 'portrait reflowable image must be classified as one page');
  assert(spreadHints.page?.likelySpanningSpread, 'landscape reflowable image must be classified as spread-sized');

  const viewport = { width: 960, height: 640 };
  const textPlan = planRendition({ publication, spineItem: publication.spine[0]!, viewport, contentHints: textHints });
  const imagePlan = planRendition({ publication, spineItem: publication.spine[1]!, viewport, contentHints: imageHints });
  const spreadPlan = planRendition({ publication, spineItem: publication.spine[2]!, viewport, contentHints: spreadHints });
  assert(textPlan.spread.execution === 'intra-document', 'flowing reflowable text with page-spread placement must remain one document');
  assert(textPlan.writingMode.value === 'vertical-rl', 'preflight writing mode must reach the planner');
  assert(imagePlan.spread.execution === 'cross-spine', 'page-like portrait reflowable image should join physical spread composition');
  assert(spreadPlan.spread.execution === 'spanning-document', 'unmarked landscape image should occupy the whole synthetic spread');
  assert(imagePlan.contentPage === imageHints.page && spreadPlan.contentPage === spreadHints.page,
    'the planner must preserve page-like content semantics for renderer execution');

  const xml = parseXml(await archive.readText('EPUB/text.xhtml'), 'EPUB/text.xhtml', 'content').root!;
  const projected = semanticXmlText(xml);
  assert(projected.includes('幼馴染'), 'ruby base glyphs must remain contiguous in semantic text');
  assert(!projected.includes('幼おさな'), 'ruby readings must not be injected into primary semantic search text');
  const ruby = collectRubySamples(xml);
  assert(ruby.length >= 3 && ruby[0]?.reading === 'おさな', 'ruby readings may remain available as metadata without contaminating primary text');

  const normalized = normalizeLegacyEpubCss(await archive.readText('EPUB/style.css'));
  assert(normalized.css.includes('writing-mode: vertical-rl'), 'legacy EPUB CSS must gain a standard writing-mode declaration');
  assert(normalized.normalizedProperties.includes('-epub-writing-mode'), 'normalizer should report the legacy property it repaired');
  assert(createCompatibilityReport(preflight.diagnostics).status === 'repaired', 'explicit preflight compatibility repairs must be observable');

  const parserError = fakeParsedDocument('parsererror', true);
  const recoveredHtml = fakeParsedDocument('html', false);
  const parsingPlatform: BrowserXmlPlatform = {
    parseXml: (_source, mediaType) => mediaType === 'application/xhtml+xml' ? parserError : recoveredHtml,
    serializeXml: () => '',
  };
  const recovered = parseXhtmlContentDocument('<html><body><p>broken', publication.spine[0]!.path!, 0, parsingPlatform);
  assert(recovered.document === recoveredHtml, 'malformed XHTML must use the same HTML fallback used by rendered content');
  assert(recovered.diagnostics.some(diagnostic => diagnostic.code === 'CONTENT_XHTML_PARSED_AS_HTML'), 'search-compatible parsing must retain the recovery diagnostic');

  console.log('Content compatibility integration test: PASS');
}

function fakeParsedDocument(rootName: string, parserError: boolean): Document {
  return {
    documentElement: { localName: rootName },
    getElementsByTagName: (name: string) => name === 'parsererror' && parserError ? [{}] : [],
  } as unknown as Document;
}

class CountingMemoryPublicationArchive extends MemoryPublicationArchive {
  readonly readCounts = new Map<PublicationPath, number>();

  override async readText(path: PublicationPath, encoding = 'utf-8'): Promise<string> {
    this.readCounts.set(path, (this.readCounts.get(path) ?? 0) + 1);
    return super.readText(path, encoding);
  }
}

/** Minimal JPEG carrying a SOF0 header; preflight only needs dimensions. */
function fakeJpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

void main();
