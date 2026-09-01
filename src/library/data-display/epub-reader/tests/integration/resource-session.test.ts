import { MemoryPublicationArchive } from '../../core/epub/archive/publication-archive';
import { loadPublicationFromArchive } from '../../core/epub/publication/loader';
import { resolvePublicationReference } from '../../core/epub/publication/path';
import type { ObjectUrlFactory } from '../../core/epub/resources/model';
import { PublicationResourceSession } from '../../core/epub/resources/resource-session';
import { ResourceResolver } from '../../core/epub/resources/resource-resolver';

const IDENTIFIER = 'urn:uuid:resource-session-fixture';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

class FakeObjectUrlFactory implements ObjectUrlFactory {
  readonly created = new Map<string, { bytes: Uint8Array; mediaType: string }>();
  readonly revoked: string[] = [];
  private counter = 0;

  create(bytes: Uint8Array, mediaType: string): string {
    const url = `blob:fixture-${++this.counter}`;
    this.created.set(url, { bytes: bytes.slice(), mediaType });
    return url;
  }

  revoke(url: string): void {
    this.revoked.push(url);
  }

  text(url: string): string {
    const entry = this.created.get(url);
    if (!entry) throw new Error(`Unknown fake object URL: ${url}`);
    return new TextDecoder().decode(entry.bytes);
  }
}

async function main() {
  assertThrows(
    () => resolvePublicationReference('EPUB/text/ch.xhtml', '../../../outside.txt'),
    'traversal above the container root must be rejected',
  );
  assertThrows(
    () => resolvePublicationReference('EPUB/text/ch.xhtml', '../%2e%2e/%2e%2e/outside.txt'),
    'percent-encoded dot traversal must be rejected',
  );
  assertThrows(
    () => resolvePublicationReference('EPUB/text/ch.xhtml', '../images%2Fsecret.png'),
    'encoded path separators must be rejected',
  );
  assertThrows(
    () => resolvePublicationReference('EPUB/text/ch.xhtml', '/EPUB/images/root.png'),
    'root-relative OCF URLs are disallowed by EPUB OCF URL rules',
  );
  assert(
    resolvePublicationReference('EPUB/text/ch.xhtml', '../../shared/image.png').path === 'shared/image.png',
    'legal traversal to the container root must remain valid',
  );

  const rawFont = new Uint8Array(1600);
  for (let i = 0; i < rawFont.length; i += 1) rawFont[i] = (i * 17) & 0xff;
  const obfuscatedFont = await idpfXor(rawFont, IDENTIFIER);

  const archive = new MemoryPublicationArchive({
    'mimetype': 'application/epub+zip',
    'META-INF/container.xml': containerXml,
    'META-INF/encryption.xml': encryptionXml,
    'EPUB/package.opf': packageXml,
    'EPUB/nav.xhtml': navXml,
    'EPUB/text/ch.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><body>Fixture</body></html>',
    'EPUB/styles/main.css': mainCss,
    'EPUB/styles/theme/base.css': baseCss,
    'EPUB/images/bg.png': new Uint8Array([1, 2, 3, 4]),
    'EPUB/images/base.png': new Uint8Array([5, 6, 7, 8]),
    'EPUB/fonts/book.woff2': obfuscatedFont,
    'EPUB/unmanifested.png': new Uint8Array([9, 9, 9]),
  });

  const loaded = await loadPublicationFromArchive(archive);
  assert(loaded.publication, 'resource session fixture publication must parse');
  const created = await ResourceResolver.create(archive, loaded.publication, {
    remotePolicy: 'block',
    unmanifestedPolicy: 'warn',
    maxResourceBytes: 1024 * 1024,
  });
  assert(created.diagnostics.length === 0, 'valid encryption metadata should parse without diagnostics');
  const resolver = created.resolver;

  const font = await resolver.read('EPUB/styles/main.css', '../fonts/book.woff2');
  assert(font.resource, 'obfuscated font should be readable');
  assert(bytesEqual(font.resource.bytes, rawFont), 'IDPF-obfuscated font must be transparently deobfuscated');

  const publisherFontResolver = (await ResourceResolver.create(archive, loaded.publication, {
    remotePolicy: 'block',
    deobfuscateIdpfFonts: false,
  })).resolver;
  const publisherFont = await publisherFontResolver.read('EPUB/styles/main.css', '../fonts/book.woff2');
  assert(!publisherFont.resource, 'disabled IDPF font recovery must not expose obfuscated bytes as a browser font');
  assert(publisherFont.diagnostics.some(diagnostic => diagnostic.code === 'RESOURCE_FONT_DEOBFUSCATION_DISABLED'), 'disabled IDPF font recovery must remain observable');

  const unmanifested = await resolver.read('EPUB/text/ch.xhtml', '../unmanifested.png');
  assert(unmanifested.resource, 'warn policy should allow an unmanifested container resource');
  assert(
    unmanifested.diagnostics.some(d => d.code === 'RESOURCE_NOT_IN_MANIFEST'),
    'unmanifested fallback must remain observable through diagnostics',
  );

  const blockedRemote = resolver.resolve('EPUB/styles/main.css', 'https://example.com/tracker.png');
  assert(blockedRemote.request?.remote === true, 'absolute network URL should remain classified as remote');
  assert(
    blockedRemote.diagnostics.some(d => d.code === 'RESOURCE_REMOTE_BLOCKED'),
    'default test policy should explicitly diagnose blocked remote resources',
  );

  const factory = new FakeObjectUrlFactory();
  const session = new PublicationResourceSession(resolver, factory);
  const materialized = await session.materialize('EPUB/text/ch.xhtml', '../styles/main.css');
  assert(materialized.resource?.url, 'stylesheet should materialize to an object URL');
  const cssUrl = materialized.resource.url;
  const css = factory.text(cssUrl);

  assert(!css.includes('../images/'), 'materialized CSS must not retain relative image references');
  assert(!css.includes('../fonts/'), 'materialized CSS must not retain relative font references');
  assert(css.includes('blob:fixture-'), 'local CSS dependencies should become session-owned object URLs');
  assert(css.includes('url("#mask")'), 'fragment-only CSS references should remain document-relative');
  assert(css.includes('data:image/png;base64,AAAA'), 'data URLs should remain inline even when remote network resources are blocked');
  assert(css.includes('about:blank'), 'blocked remote CSS resources should not leak a network request');
  assert(
    materialized.diagnostics.some(d => d.code === 'RESOURCE_CSS_IMPORT_CYCLE'),
    'CSS import cycles must be detected instead of deadlocking recursive materialization',
  );

  const countBefore = session.objectUrlCount;
  const again = await session.materialize('EPUB/text/ch.xhtml', '../styles/main.css');
  assert(again.resource?.url === cssUrl, 'materialized stylesheet URL should be stable within one session');
  assert(session.objectUrlCount === countBefore, 're-materialization should reuse object URL cache');

  const data = await session.materialize('EPUB/text/ch.xhtml', 'data:image/svg+xml,%3Csvg/%3E');
  assert(data.resource?.url?.startsWith('data:'), 'data URL materialization should be a passthrough');

  const publisherCssSession = new PublicationResourceSession(resolver, new FakeObjectUrlFactory(), { normalizeLegacyCss: false });
  const publisherCss = await publisherCssSession.rewriteInlineCss('EPUB/text/ch.xhtml', '-epub-writing-mode: vertical-rl');
  assert(publisherCss.css.trim() === '-epub-writing-mode: vertical-rl', 'disabled legacy CSS recovery must preserve only the authored declaration');
  assert(!publisherCss.diagnostics.some(diagnostic => diagnostic.code === 'RESOURCE_LEGACY_EPUB_CSS_NORMALIZED'), 'disabled legacy CSS recovery must not report an unapplied repair');
  publisherCssSession.dispose();

  const generated = session.createGeneratedTextUrl('resource-session-generated', '<html/>');
  const generatedAgain = session.createGeneratedTextUrl('resource-session-generated', '<html/>');
  assert(generated === generatedAgain, 'generated renderer-document URLs must be stable within one publication session');
  assert(factory.text(generated) === '<html/>', 'generated text URL must preserve renderer content bytes');
  const finalCount = session.objectUrlCount;
  assert(finalCount === countBefore + 1, 'generated renderer content must participate in the session URL store');

  session.dispose();
  assert(factory.revoked.length === finalCount, 'disposing a publication session must revoke raw, CSS and generated object URLs');
  await assertRejects(
    () => session.materialize('EPUB/text/ch.xhtml', '../styles/main.css'),
    'disposed sessions must reject further materialization',
  );

  console.log('Resource session integration test: PASS');
  console.log(`Materialized object URLs: ${countBefore}`);
  console.log(`Resource diagnostics: ${materialized.diagnostics.length}`);
}

function assertThrows(fn: () => unknown, message: string): void {
  let threw = false;
  try { fn(); } catch { threw = true; }
  if (!threw) throw new Error(message);
}

async function assertRejects(fn: () => Promise<unknown>, message: string): Promise<void> {
  let threw = false;
  try { await fn(); } catch { threw = true; }
  if (!threw) throw new Error(message);
}

async function idpfXor(bytes: Uint8Array, identifier: string): Promise<Uint8Array> {
  const normalized = identifier.replace(/\s/g, '');
  const key = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(normalized)));
  const out = bytes.slice();
  const limit = Math.min(1040, out.length);
  for (let i = 0; i < limit; i += 1) out[i] = out[i]! ^ key[i % key.length]!;
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const packageXml = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.3" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${IDENTIFIER}</dc:identifier>
    <dc:title>Resource Session Fixture</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-08-23T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="text/ch.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="styles/main.css" media-type="text/css"/>
    <item id="base" href="styles/theme/base.css" media-type="text/css"/>
    <item id="bg" href="images/bg.png" media-type="image/png"/>
    <item id="baseimg" href="images/base.png" media-type="image/png"/>
    <item id="font" href="fonts/book.woff2" media-type="font/woff2"/>
  </manifest>
  <spine><itemref idref="chapter"/></spine>
</package>`;

const navXml = `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
<nav epub:type="toc"><ol><li><a href="text/ch.xhtml">Fixture</a></li></ol></nav>
</body></html>`;

const encryptionXml = `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <enc:CipherData><enc:CipherReference URI="EPUB/fonts/book.woff2"/></enc:CipherData>
  </enc:EncryptedData>
</encryption>`;

const mainCss = `@import "theme/base.css";
@font-face { font-family: Fixture; src: url('../fonts/book.woff2') format('woff2'); }
body { background-image: url(../images/bg.png?rev=1); font-family: Fixture; }
.icon { mask: url(#mask); }
.inline { background: url(data:image/png;base64,AAAA); }
.remote { background: url(https://example.com/tracker.png); }`;

const baseCss = `@import "../main.css";
.base { background: url('../../images/base.png'); }`;

void main();
