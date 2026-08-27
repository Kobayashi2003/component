import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'fixtures', 'corpus');
mkdirSync(out, { recursive: true });

const container = `<?xml version="1.0"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
const nav = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter</a></li></ol></nav></body></html>`;
const chapter = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Fixture</title></head><body><h1 id="start">Fixture</h1><p>Deterministic local conformance corpus.</p></body></html>`;
const baseMetadata = `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:test:local-corpus</dc:identifier><dc:title>Local Corpus Fixture</dc:title><dc:language>en</dc:language></metadata>`;
const validPackage = `<package xmlns="http://www.idpf.org/2007/opf" version="3.3" unique-identifier="id">${baseMetadata}<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`;
const conflictPackage = `<package xmlns="http://www.idpf.org/2007/opf" version="3.3" unique-identifier="id">${baseMetadata}<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1" properties="rendition:flow-scrolled-doc rendition:flow-paginated"/></spine></package>`;
const ncxPackage = `<package xmlns="http://www.idpf.org/2007/opf" version="3.3" unique-identifier="id">${baseMetadata}<manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine toc="ncx"><itemref idref="c1"/></spine></package>`;
const ncx = `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint id="n1"><navLabel><text>Fallback chapter</text></navLabel><content src="chapter.xhtml"/></navPoint></navMap></ncx>`;
const compatibilityPackage = `<package xmlns="http://www.idpf.org/2007/opf" version="3.3" unique-identifier="id">${baseMetadata}<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="broken" href="broken.xhtml" media-type="application/xhtml+xml"/><item id="base" href="text/base.xhtml" media-type="application/xhtml+xml"/><item id="pixel" href="assets/images/pixel.svg" media-type="image/svg+xml"/></manifest><spine><itemref idref="broken"/><itemref idref="base"/></spine></package>`;
const compatibilityNav = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="broken.xhtml">Recovered HTML</a></li><li><a href="text/base.xhtml">XML Base</a></li></ol></nav></body></html>`;
const malformedChapter = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Recovered HTML</title></head><body><h1>Recovered HTML<p>Malformed publisher markup remains readable.`;
const xmlBaseChapter = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>XML Base</title></head><body><section xml:base="../assets/"><img src="images/pixel.svg" alt="Nested XML Base asset"/><div xml:base="nested/"><a href="next.xhtml#target">Nested link</a></div></section></body></html>`;
const pixelSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#41b5d5"/></svg>`;
const footnoteMetadata = `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:test:footnotes</dc:identifier><dc:title>Footnote Fixture</dc:title><dc:language>en</dc:language></metadata>`;
const footnotePackage = `<package xmlns="http://www.idpf.org/2007/opf" version="3.3" unique-identifier="id">${footnoteMetadata}<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/><itemref idref="notes" linear="no"/></spine></package>`;
const footnoteNav = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Footnote demo</a></li></ol></nav></body></html>`;
const footnoteChapter = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Footnote demo</title></head><body><main><h1>Notes without losing your place</h1><p>A short reference opens its note above the page <a id="ref-1" epub:type="noteref" role="doc-noteref" href="notes.xhtml#note-1">1</a>, while the current reading position remains unchanged.</p><p contenteditable="true" data-selection-fixture="true">The fixture keeps enough ordinary text around the reference to verify focus restoration, keyboard dismissal, and deliberate navigation to the note document.</p></main></body></html>`;
const footnoteNotes = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Notes</title></head><body><aside id="note-1" epub:type="footnote" role="doc-footnote"><h2>Editorial note</h2><p>This note is loaded from a separate XHTML resource inside the EPUB container.</p><p>Publisher markup is reduced to safe text before the reader displays it.</p><a epub:type="backlink" role="doc-backlink" href="chapter.xhtml#ref-1">Return</a><script>window.footnoteScriptMustNotRun = true;</script></aside></body></html>`;

// --- Vertical Japanese with ruby -------------------------------------------
// Paginating this is what CSS fragmentation exists for: a page boundary must
// never fall inside a vertical line box, and `ruby-position: over` paints its
// annotation on the block-start (right) edge of every page.
const verticalMetadata = `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:test:vertical-ruby</dc:identifier><dc:title>Vertical Ruby Fixture</dc:title><dc:language>ja</dc:language></metadata>`;
const verticalCss = `html, .vrtl { -epub-writing-mode: vertical-rl; -webkit-writing-mode: vertical-rl; writing-mode: vertical-rl; }\nbody { margin: 0; padding: 0; font-size: 100%; line-height: 1.75; text-align: justify; }\np { margin: 0; }\nh1 { font-size: 160%; line-height: 1.5; margin: 0 0 1em 0; font-weight: normal; }`;
const verticalParagraph = '　<ruby>吾輩<rt>わがはい</rt></ruby>は猫である。名前はまだ無い。どこで<ruby>生<rt>う</rt></ruby>れたかとんと<ruby>見当<rt>けんとう</rt></ruby>がつかぬ。何でも<ruby>薄暗<rt>うすぐら</rt></ruby>いじめじめした所でニャーニャー<ruby>泣<rt>な</rt></ruby>いていた事だけは記憶している。';
const verticalChapter = `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja" class="vrtl"><head><title>縦書き</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body><h1 id="start">第一章　<ruby>邂逅<rt>かいこう</rt></ruby></h1>${new Array(24).fill(`<p>${verticalParagraph}</p>`).join('')}</body></html>`;
const verticalNav = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">縦書き</a></li></ol></nav></body></html>`;
const verticalPackage = `<package xmlns="http://www.idpf.org/2007/opf" version="3.3" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:test:vertical-ruby</dc:identifier><dc:title>Vertical Ruby Fixture</dc:title><dc:language>ja</dc:language><meta property="rendition:layout">reflowable</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine page-progression-direction="rtl"><itemref idref="c1"/></spine></package>`;

// --- Mixed layout ----------------------------------------------------------
// The shape more than half of real light novels have: pre-paginated colour
// plates interleaved with reflowable chapters. Reader chrome must stay put
// across those boundaries, so a fixture has to exist to photograph it.
//
// The plates come in facing pairs, as they do in print, so the fixture also
// exercises the composed spread: two spine documents on screen at once, which a
// single page turn has to leave behind rather than re-compose through its other
// half. One chapter carries `page-spread-left`, which real books use constantly,
// so the leading-blank rule is covered too: that alignment column belongs to
// horizontal two-up and must never cost a vertical chapter its first page.
const platePage = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Plate</title><meta name="viewport" content="width=600, height=800"/></head><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800"><rect width="600" height="800" fill="#2b2f3a"/><circle cx="300" cy="400" r="180" fill="#d5b570"/></svg></body></html>`;
const mixedChapter = `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja" class="vrtl"><head><title>本文</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body><h1>本文</h1>${new Array(10).fill(`<p>${verticalParagraph}</p>`).join('')}</body></html>`;
const mixedNav = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="text-1.xhtml">本文</a></li></ol></nav></body></html>`;
const mixedPackage = `<package xmlns="http://www.idpf.org/2007/opf" version="3.3" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:test:mixed-layout</dc:identifier><dc:title>Mixed Layout Fixture</dc:title><dc:language>ja</dc:language><meta property="rendition:layout">reflowable</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/><item id="t1" href="text-1.xhtml" media-type="application/xhtml+xml"/><item id="p1" href="plate-1.xhtml" media-type="application/xhtml+xml"/><item id="p2" href="plate-2.xhtml" media-type="application/xhtml+xml"/><item id="t2" href="text-2.xhtml" media-type="application/xhtml+xml"/><item id="p3" href="plate-3.xhtml" media-type="application/xhtml+xml"/><item id="p4" href="plate-4.xhtml" media-type="application/xhtml+xml"/><item id="t3" href="text-3.xhtml" media-type="application/xhtml+xml"/></manifest><spine page-progression-direction="rtl"><itemref idref="t1"/><itemref idref="p1" properties="rendition:layout-pre-paginated rendition:spread-landscape page-spread-right"/><itemref idref="p2" properties="rendition:layout-pre-paginated rendition:spread-landscape page-spread-left"/><itemref idref="t2" properties="page-spread-left"/><itemref idref="p3" properties="rendition:layout-pre-paginated rendition:spread-landscape page-spread-right"/><itemref idref="p4" properties="rendition:layout-pre-paginated rendition:spread-landscape page-spread-left"/><itemref idref="t3"/></spine></package>`;

const cases = [
  {
    id: 'valid-reflowable',
    file: 'valid-reflowable.epub',
    expectPublication: true,
    expectedCompatibilityStatus: 'clean',
    files: { mimetype: 'application/epub+zip', 'META-INF/container.xml': container, 'EPUB/package.opf': validPackage, 'EPUB/nav.xhtml': nav, 'EPUB/chapter.xhtml': chapter },
  },
  {
    id: 'conflicting-rendition-repair',
    file: 'conflicting-rendition.epub',
    expectPublication: true,
    expectedCompatibilityStatus: 'repaired',
    expectedDiagnosticCodes: ['PACKAGE_SPINE_RENDITION_CONFLICT'],
    files: { mimetype: 'application/epub+zip', 'META-INF/container.xml': container, 'EPUB/package.opf': conflictPackage, 'EPUB/nav.xhtml': nav, 'EPUB/chapter.xhtml': chapter },
  },
  {
    id: 'epub3-ncx-fallback-repair',
    file: 'epub3-ncx-fallback.epub',
    expectPublication: true,
    expectedCompatibilityStatus: 'repaired',
    expectedDiagnosticCodes: ['NAV_COMPATIBILITY_NCX_FALLBACK'],
    files: { mimetype: 'application/epub+zip', 'META-INF/container.xml': container, 'EPUB/package.opf': ncxPackage, 'EPUB/toc.ncx': ncx, 'EPUB/chapter.xhtml': chapter },
  },
  {
    id: 'missing-container-blocked',
    file: 'missing-container.epub',
    expectPublication: false,
    expectedCompatibilityStatus: 'blocked',
    expectedDiagnosticCodes: ['OCF_CONTAINER_MISSING'],
    files: { mimetype: 'application/epub+zip', 'EPUB/chapter.xhtml': chapter },
  },
  {
    id: 'browser-content-compatibility',
    file: 'browser-content-compatibility.epub',
    expectPublication: true,
    expectedCompatibilityStatus: 'clean',
    files: {
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': container,
      'EPUB/package.opf': compatibilityPackage,
      'EPUB/nav.xhtml': compatibilityNav,
      'EPUB/broken.xhtml': malformedChapter,
      'EPUB/text/base.xhtml': xmlBaseChapter,
      'EPUB/assets/images/pixel.svg': pixelSvg,
    },
  },
  {
    id: 'cross-document-footnote',
    file: 'cross-document-footnote.epub',
    expectPublication: true,
    expectedCompatibilityStatus: 'clean',
    files: {
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': container,
      'EPUB/package.opf': footnotePackage,
      'EPUB/nav.xhtml': footnoteNav,
      'EPUB/chapter.xhtml': footnoteChapter,
      'EPUB/notes.xhtml': footnoteNotes,
    },
  },
  {
    id: 'vertical-ruby',
    file: 'vertical-ruby.epub',
    expectPublication: true,
    expectedCompatibilityStatus: 'clean',
    files: {
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': container,
      'EPUB/package.opf': verticalPackage,
      'EPUB/nav.xhtml': verticalNav,
      'EPUB/style.css': verticalCss,
      'EPUB/chapter.xhtml': verticalChapter,
    },
  },
  {
    id: 'mixed-layout',
    file: 'mixed-layout.epub',
    expectPublication: true,
    expectedCompatibilityStatus: 'clean',
    files: {
      mimetype: 'application/epub+zip',
      'META-INF/container.xml': container,
      'EPUB/package.opf': mixedPackage,
      'EPUB/nav.xhtml': mixedNav,
      'EPUB/style.css': verticalCss,
      'EPUB/text-1.xhtml': mixedChapter,
      'EPUB/text-2.xhtml': mixedChapter,
      'EPUB/text-3.xhtml': mixedChapter,
      'EPUB/plate-1.xhtml': platePage,
      'EPUB/plate-2.xhtml': platePage,
      'EPUB/plate-3.xhtml': platePage,
      'EPUB/plate-4.xhtml': platePage,
    },
  },
];

for (const test of cases) writeFileSync(join(out, test.file), buildStoredZip(test.files));
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ generatedBy: 'scripts/generate-local-corpus.mjs', cases: cases.map(({ files, ...rest }) => rest) }, null, 2) + '\n');
console.log(`Generated ${cases.length} deterministic EPUB fixtures in ${out}`);

function buildStoredZip(files) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true); lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30); local.set(data, 30 + nameBytes.length); locals.push(local);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true);
    central.set(nameBytes, 46); centrals.push(central); offset += local.length;
  }
  const centralOffset = offset;
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22); const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, centrals.length, true); ev.setUint16(10, centrals.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, centralOffset, true);
  return concat([...locals, ...centrals, eocd]);
}
function concat(parts) { const total = parts.reduce((sum, part) => sum + part.length, 0); const out = new Uint8Array(total); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; }
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
