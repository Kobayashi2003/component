import { MemoryPublicationArchive } from '../../core/archive/publication-archive';
import { __zipTestUtils } from '../../core/archive/ocf-zip';
import { loadEpub, loadPublicationFromArchive } from '../../core/publication/loader';
import { hasMixedLayout, resolveSpineRendition } from '../../core/publication/resolve-rendition';
import { resolvePublicationReference } from '../../core/publication/path';

const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const packageXml = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.3" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:test</dc:identifier>
    <dc:title id="subtitle">A subtitle</dc:title>
    <dc:title id="title">Reader Fixture</dc:title>
    <dc:language>en</dc:language>
    <dc:creator id="creator">Example Author</dc:creator>
    <meta refines="#creator" property="role" scheme="marc:relators">aut</meta>
    <meta refines="#subtitle" property="title-type">subtitle</meta>
    <meta refines="#title" property="title-type">main</meta>
    <meta property="dcterms:modified">2026-08-23T00:00:00Z</meta>
    <meta property="rendition:layout">reflowable</meta>
    <meta property="rendition:spread">both</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="p1" href="pages/p1.xhtml" media-type="application/xhtml+xml"/>
    <item id="remote" href="https://example.com/audio.mp3" media-type="audio/mpeg"/>
  </manifest>
  <spine page-progression-direction="rtl">
    <itemref idref="c1"/>
    <itemref idref="p1" properties="rendition:layout-pre-paginated rendition:page-spread-right"/>
  </spine>
</package>`;

const navXml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
<nav epub:type="toc">
  <ol>
    <li><a href="text/ch1.xhtml">Chapter <strong>One</strong></a></li>
    <li><span>Plate group</span><ol><li><a href="pages/p1.xhtml#art"><img alt="Plate One" src="cover.jpg"/></a></li></ol></li>
    <li><a href="https://example.com/contents">Publisher website</a></li>
  </ol>
</nav>
<nav epub:type="page-list"><ol><li><a href="text/ch1.xhtml#p1">1</a></li><li><a href="https://example.com/page">remote</a></li></ol></nav>
<nav epub:type="landmarks"><ol><li><a epub:type="bodymatter" href="text/ch1.xhtml">Start</a></li><li><a epub:type="bodymatter" href="https://example.com/start">remote</a></li></ol></nav>
</body></html>`;



const epub2PackageXml = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:identifier id="BookId" opf:scheme="ISBN">9780000000000</dc:identifier>
    <dc:title>Legacy Fixture</dc:title>
    <dc:language>en</dc:language>
    <dc:creator opf:role="aut" opf:file-as="Author, Legacy">Legacy Author</dc:creator>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="c1"/></spine>
  <guide><reference type="text" title="Start" href="chapter.xhtml"/></guide>
</package>`;

const ncxXml = `<?xml version="1.0"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <navMap>
    <navPoint id="n1" playOrder="1"><navLabel><text>Legacy Chapter</text></navLabel><content src="chapter.xhtml#start"/></navPoint>
  </navMap>
  <pageList><pageTarget id="p1" type="normal" value="1" playOrder="2"><navLabel><text>1</text></navLabel><content src="chapter.xhtml#page1"/></pageTarget></pageList>
</ncx>`;


const conflictingOverridePackageXml = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.3" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:test:conflict</dc:identifier>
    <dc:title>Conflict recovery</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1" properties="rendition:flow-scrolled-doc rendition:flow-paginated rendition:page-spread-right rendition:page-spread-left"/></spine>
</package>`;

const archive = new MemoryPublicationArchive({
  'mimetype': 'application/epub+zip',
  'META-INF/container.xml': containerXml,
  'EPUB/package.opf': packageXml,
  'EPUB/nav.xhtml': navXml,
  'EPUB/text/ch1.xhtml': '<html/>',
  'EPUB/pages/p1.xhtml': '<html/>',
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(resolvePublicationReference('EPUB/nav.xhtml', '#toc').href === 'EPUB/nav.xhtml#toc', 'fragment-only href must resolve against the current document');

  const loaded = await loadPublicationFromArchive(archive);
  assert(loaded.publication, 'publication should load from memory archive');
  const book = loaded.publication;
  assert(book.version === '3.3', 'package version should be preserved');
  assert(book.metadata.title === 'Reader Fixture', 'title should parse');
  assert(book.metadata.subtitle === 'A subtitle', 'title refinement should produce subtitle');
  assert(book.metadata.creators[0]?.role === 'aut', 'creator role refinement should parse');
  assert(book.pageProgressionDirection === 'rtl', 'spine progression should parse independently');
  assert(hasMixedLayout(book), 'per-spine layout override must produce mixed layout');
  assert(book.spine[0]?.cfiBase === '/6/2!', 'parser should preserve the package CFI base for the first spine item');
  assert(book.spine[1]?.cfiBase === '/6/4!', 'parser should preserve package-relative itemref position in the CFI base');
  assert(resolveSpineRendition(book, book.spine[1]!).pageSpread === 'right', 'page spread override should survive parsing');
  assert(book.navigation.source === 'epub3-nav', 'EPUB 3 nav should be authoritative');
  assert(book.navigation.toc[1]?.href === undefined, 'span TOC group must remain unlinked');
  assert(book.navigation.toc[1]?.children[0]?.label === 'Plate One', 'image alt should contribute to navigation label');
  assert(book.navigation.toc[2]?.label === 'Publisher website' && book.navigation.toc[2]?.href === undefined, 'remote TOC entries must remain readable but not become internal navigation targets');
  assert(book.navigation.pageList.length === 1, 'remote page-list entries must not enter the publication location model');
  assert(book.navigation.landmarks.length === 1, 'remote landmarks must not enter internal navigation');
  assert(book.navigation.landmarks[0]?.types.includes('bodymatter'), 'landmark semantic should parse');
  assert(book.manifest.find(item => item.id === 'remote')?.remote === true, 'remote manifest resources must be preserved');

  const multipleRootfiles = new MemoryPublicationArchive({
    'META-INF/container.xml': `<?xml version="1.0"?>
      <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>
        <rootfile full-path="ALT/package.opf" media-type="application/xml"/>
        <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
      </rootfiles></container>`,
    'ALT/package.opf': packageXml.replace('Reader Fixture', 'Publisher First Package'),
    'EPUB/package.opf': packageXml,
    'ALT/nav.xhtml': navXml,
    'EPUB/nav.xhtml': navXml,
  });
  const preferredRootfile = await loadPublicationFromArchive(multipleRootfiles);
  assert(preferredRootfile.publication?.metadata.title === 'Reader Fixture', 'default rootfile recovery should prefer the standard OPF package');
  const publisherRootfile = await loadPublicationFromArchive(multipleRootfiles, [], { selectPreferredRootfile: false });
  assert(publisherRootfile.publication?.metadata.title === 'Publisher First Package', 'disabling rootfile recovery should preserve publisher declaration order');

  const epub2 = await loadPublicationFromArchive(new MemoryPublicationArchive({
    'META-INF/container.xml': containerXml,
    'EPUB/package.opf': epub2PackageXml,
    'EPUB/toc.ncx': ncxXml,
    'EPUB/chapter.xhtml': '<html/>',
  }));
  assert(epub2.publication?.version === '2.0', 'EPUB 2 package version should be preserved');
  assert(epub2.publication?.navigation.source === 'ncx', 'EPUB 2 should use NCX navigation');
  assert(epub2.publication?.navigation.toc[0]?.label === 'Legacy Chapter', 'NCX navMap should parse');
  assert(epub2.publication?.navigation.pageList[0]?.fragment === 'page1', 'NCX pageList should parse');
  assert(epub2.publication?.navigation.landmarks[0]?.types[0] === 'text', 'EPUB 2 guide should supply fallback landmarks');
  assert(epub2.publication?.metadata.creators[0]?.fileAs === 'Author, Legacy', 'EPUB 2 opf:file-as should parse');

  const epub2WithoutFallback = await loadPublicationFromArchive(new MemoryPublicationArchive({
    'META-INF/container.xml': containerXml,
    'EPUB/package.opf': epub2PackageXml,
    'EPUB/toc.ncx': ncxXml,
    'EPUB/chapter.xhtml': '<html/>',
  }), [], { useLegacyNavigationFallback: false });
  assert(epub2WithoutFallback.publication?.navigation.source === 'none', 'disabling legacy navigation must not parse NCX as the active navigation model');
  assert(epub2WithoutFallback.publication?.navigation.landmarks.length === 0, 'disabling legacy navigation must not import EPUB 2 Guide landmarks');

  const conflict = await loadPublicationFromArchive(new MemoryPublicationArchive({
    'META-INF/container.xml': containerXml,
    'EPUB/package.opf': conflictingOverridePackageXml,
    'EPUB/chapter.xhtml': '<html/>',
  }));
  assert(conflict.publication?.spine[0]?.rendition.flow === 'scrolled-doc', 'conflicting rendition overrides must recover using the first authored value');
  assert(conflict.publication?.spine[0]?.rendition.pageSpread === 'right', 'conflicting page-spread properties must recover using the first authored value');
  assert(conflict.diagnostics.some(d => d.code === 'PACKAGE_SPINE_RENDITION_CONFLICT'), 'conflicting rendition overrides must still be diagnosed');
  assert(conflict.diagnostics.some(d => d.code === 'PACKAGE_SPINE_PAGE_SPREAD_CONFLICT'), 'conflicting page-spread declarations must still be diagnosed');

  const zipBytes = buildStoredZip({
    'mimetype': 'application/epub+zip',
    'META-INF/container.xml': containerXml,
    'EPUB/package.opf': packageXml,
    'EPUB/nav.xhtml': navXml,
    'EPUB/text/ch1.xhtml': '<html/>',
    'EPUB/pages/p1.xhtml': '<html/>',
  });
  const zipped = await loadEpub(zipBytes);
  assert(zipped.publication?.metadata.title === 'Reader Fixture', 'OCF ZIP -> Publication should work end-to-end');
  assert(!zipped.diagnostics.some(d => d.severity === 'fatal'), 'valid fixture should not produce fatal diagnostics');

  console.log('Publication loading integration test: PASS');
  console.log(`Diagnostics: ${zipped.diagnostics.length}`);
}

function buildStoredZip(files: Readonly<Record<string, string>>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = __zipTestUtils.crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x800, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }

  const centralOffset = offset;
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralOffset, true);

  return concat([...locals, ...centrals, eocd]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

void main();
