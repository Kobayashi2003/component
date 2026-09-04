import { OcfZipArchive, __zipTestUtils } from "../../core/epub/archive";
import { createCompatibilityReport } from "../../core/epub/compatibility";
import { loadEpub } from "../../core/epub/publication";
import { runEpubCorpusCase } from "../../core/validation/conformance/corpus";
import {
  W3cConformanceRecorder,
  summarizeW3cResults,
} from "../../core/validation/conformance/report";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const validPackage = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.3" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:test:conformance-reporting</dc:identifier>
    <dc:title>Conformance Reporting Fixture</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`;

const navXml = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter</a></li></ol></nav></body></html>`;

const ncxFallbackPackage = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.3" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:test:ncx-fallback</dc:identifier>
    <dc:title>NCX fallback</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="c1"/></spine>
</package>`;

const ncxXml = `<?xml version="1.0"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>
<navPoint id="n1"><navLabel><text>Fallback chapter</text></navLabel><content src="chapter.xhtml"/></navPoint>
</navMap></ncx>`;

const conflictingPackage = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.3" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:test:conflict</dc:identifier><dc:title>Conflict</dc:title><dc:language>en</dc:language>
  </metadata>
  <manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1" properties="rendition:flow-scrolled-doc rendition:flow-paginated"/></spine>
</package>`;

async function main() {
  const validZip = buildStoredZip({
    mimetype: "application/epub+zip",
    "META-INF/container.xml": containerXml,
    "EPUB/package.opf": validPackage,
    "EPUB/nav.xhtml": navXml,
    "EPUB/chapter.xhtml":
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello</p></body></html>',
  });

  // 1. Archive hardening rejects oversized input and excessive entry counts
  // before any Deflate payload is expanded.
  {
    const tooLarge = await OcfZipArchive.open(validZip, {
      maxContainerBytes: validZip.byteLength - 1,
    });
    assert(
      !tooLarge.archive,
      "container byte limit must block oversized EPUBs",
    );
    assert(
      tooLarge.diagnostics.some(
        (d) => d.code === "OCF_ZIP_CONTAINER_LIMIT_EXCEEDED",
      ),
      "container limit diagnostic must be explicit",
    );

    const tooMany = await OcfZipArchive.open(validZip, { maxEntries: 2 });
    assert(
      !tooMany.archive,
      "entry-count limit must block archive bombs before reads",
    );
    assert(
      tooMany.diagnostics.some(
        (d) => d.code === "OCF_ZIP_ENTRY_COUNT_LIMIT_EXCEEDED",
      ),
      "entry-count diagnostic must be explicit",
    );

    const oversizedEntry = await OcfZipArchive.open(validZip, {
      maxEntryUncompressedBytes: 20,
    });
    assert(
      !oversizedEntry.archive,
      "per-entry uncompressed limit must block oversized advertised entries",
    );
    assert(
      oversizedEntry.diagnostics.some(
        (d) => d.code === "OCF_ZIP_ENTRY_SIZE_LIMIT_EXCEEDED",
      ),
      "entry-size diagnostic must be explicit",
    );

    const bomb = patchCentralEntryAsBomb(validZip, "EPUB/chapter.xhtml");
    const suspiciousRatio = await OcfZipArchive.open(bomb, {
      maxCompressionRatio: 20,
    });
    assert(
      !suspiciousRatio.archive,
      "advertised Deflate bomb ratio must be rejected before decompression",
    );
    assert(
      suspiciousRatio.diagnostics.some(
        (d) => d.code === "OCF_ZIP_COMPRESSION_RATIO_LIMIT_EXCEEDED",
      ),
      "compression-ratio diagnostic must be explicit",
    );

    const controlBudget = await loadEpub(validZip, {
      controlDocumentLimits: { maxPackageDocumentBytes: 64 },
    });
    assert(
      !controlBudget.publication,
      "oversized package control documents must stop before XML parsing",
    );
    assert(
      controlBudget.diagnostics.some(
        (d) => d.code === "PACKAGE_DOCUMENT_LIMIT_EXCEEDED",
      ),
      "package control-document budget must be diagnosed",
    );
  }

  // 2. Clean publications produce a clean compatibility summary.
  {
    const loaded = await loadEpub(validZip);
    assert(loaded.publication, "valid conformance EPUB must load");
    assert(
      createCompatibilityReport(loaded.diagnostics).status === "clean",
      "valid publication must remain compatibility-clean",
    );
  }

  // 3. Standard-defined malformed rendition recovery is observable as a repair,
  // not silently normalized or mislabeled as an unresolved failure.
  {
    const zip = buildStoredZip({
      mimetype: "application/epub+zip",
      "META-INF/container.xml": containerXml,
      "EPUB/package.opf": conflictingPackage,
      "EPUB/nav.xhtml": navXml,
      "EPUB/chapter.xhtml":
        '<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>',
    });
    const loaded = await loadEpub(zip);
    const report = createCompatibilityReport(loaded.diagnostics);
    assert(
      loaded.publication?.spine[0]?.rendition.flow === "scrolled-doc",
      "first authored rendition override must remain the recovery value",
    );
    assert(
      report.status === "repaired",
      "known deterministic recovery must be classified as repaired",
    );
    assert(
      report.repairs.some(
        (repair) => repair.strategy === "use-first-authored-rendition-override",
      ),
      "repair strategy must be surfaced",
    );
  }

  // 4. EPUB 3 NCX fallback is an explicit compatibility repair.
  {
    const zip = buildStoredZip({
      mimetype: "application/epub+zip",
      "META-INF/container.xml": containerXml,
      "EPUB/package.opf": ncxFallbackPackage,
      "EPUB/toc.ncx": ncxXml,
      "EPUB/chapter.xhtml":
        '<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>',
    });
    const loaded = await loadEpub(zip);
    const report = createCompatibilityReport(loaded.diagnostics);
    assert(
      loaded.publication?.navigation.source === "ncx",
      "EPUB 3 compatibility fallback must produce NCX navigation",
    );
    assert(
      report.repairs.some(
        (repair) => repair.strategy === "use-ncx-navigation-fallback",
      ),
      "NCX fallback must be visible in compatibility report",
    );
  }

  // 5. The local corpus harness validates expected outcomes without conflating
  // “could load this test publication” with a W3C Reading System conformance pass.
  {
    const result = await runEpubCorpusCase({
      id: "local-valid-reflowable",
      bytes: validZip,
      expectPublication: true,
      expectedCompatibilityStatus: "clean",
    });
    assert(
      result.passed,
      `local corpus case must pass: ${result.failures.join("; ")}`,
    );

    const blocked = await runEpubCorpusCase({
      id: "local-archive-limit",
      bytes: validZip,
      expectPublication: false,
      expectedDiagnosticCodes: ["OCF_ZIP_ENTRY_COUNT_LIMIT_EXCEEDED"],
      expectedCompatibilityStatus: "blocked",
      archiveLimits: { maxEntries: 1 },
    });
    assert(
      blocked.passed,
      `blocked corpus case must match declared expectation: ${blocked.failures.join("; ")}`,
    );
  }

  // 6. W3C report writer preserves the four values required by the official
  // implementation-report format.
  {
    const recorder = new W3cConformanceRecorder({
      name: "EPUB Reader Engine",
      variant: "Web",
      tested_by: "implementer",
    });
    recorder.record("must-pass", true);
    recorder.record("known-fail", false);
    recorder.record("unsupported-feature", "n/a");
    recorder.record("not-run", null);
    const report = recorder.report();
    assert(
      report.tests["must-pass"] === true &&
        report.tests["unsupported-feature"] === "n/a",
      "W3C result values must round-trip exactly",
    );
    const summary = summarizeW3cResults(Object.values(report.tests));
    assert(
      summary.total === 4 &&
        summary.passed === 1 &&
        summary.failed === 1 &&
        summary.notApplicable === 1 &&
        summary.notRun === 1,
      "W3C summary counts must be stable",
    );
  }

  console.log("Conformance reporting integration test: PASS");
}

function patchCentralEntryAsBomb(zip: Uint8Array, name: string): Uint8Array {
  const out = zip.slice();
  const encoded = new TextEncoder().encode(name);
  for (let i = 46; i <= out.length - encoded.length; i += 1) {
    let match = true;
    for (let j = 0; j < encoded.length; j += 1) {
      if (out[i + j] !== encoded[j]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    const central = i - 46;
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    if (view.getUint32(central, true) !== 0x02014b50) continue;
    view.setUint16(central + 10, 8, true);
    view.setUint32(central + 20, 1, true);
    view.setUint32(central + 24, 10_000, true);
    return out;
  }
  throw new Error(`Central directory entry not found: ${name}`);
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
