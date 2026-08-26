import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTypeScript } from './typescript-cli.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  console.error('Usage: npm run realworld:bind -- <epub-file-or-directory> [...]');
  process.exit(2);
}

const files = [...new Set(inputs.flatMap(collectEpubs))].sort((a, b) => a.localeCompare(b));
if (files.length === 0) {
  console.error('No EPUB files were found in the supplied paths.');
  process.exit(2);
}

const out = join(root, '.realworld-dist');
const manifestPath = resolve(process.env.EPUB_REALWORLD_MANIFEST ?? join(root, 'fixtures', 'real-world', 'manifest.local.json'));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

try {
  runTypeScript(['-p', join(root, 'tsconfig.core.json'), '--noEmit', 'false', '--module', 'commonjs', '--moduleResolution', 'node', '--outDir', out], { stdio: 'inherit' });
  writeFileSync(join(out, 'package.json'), JSON.stringify({ type: 'commonjs' }));
  const require = createRequire(import.meta.url);
  const core = require(join(out, 'core', 'index.js'));
  const cases = [];
  for (const file of files) {
    cases.push(await inspectEpub(core, file));
    console.log(`Bound ${file}`);
  }
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify({ version: 1, viewport: { width: 960, height: 640 }, cases }, null, 2) + '\n');
  console.log(`Created ${manifestPath} with ${cases.length} case(s).`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

function collectEpubs(input) {
  const path = resolve(input);
  if (!existsSync(path)) throw new Error(`Path does not exist: ${path}`);
  const stat = statSync(path);
  if (stat.isFile()) return extname(path).toLowerCase() === '.epub' ? [path] : [];
  if (!stat.isDirectory()) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => collectEpubs(join(path, entry.name)));
}

async function inspectEpub(core, path) {
  const bytes = readFileSync(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const strict = await core.OcfZipArchive.open(bytes, {}, 'strict');
  const opened = await core.OcfZipArchive.open(bytes, {}, 'compatible');
  if (!opened.archive) throw new Error(`Could not open EPUB: ${path}`);
  const loaded = await core.loadPublicationFromArchive(opened.archive, opened.diagnostics);
  if (!loaded.publication) throw new Error(`Could not load package: ${path}`);
  const publication = loaded.publication;
  const preflight = await core.preflightPublicationContent(opened.archive, publication);
  let verticalCount = 0;
  let prePaginatedCount = 0;
  let reflowableImagePageCount = 0;
  let spanningImageCount = 0;
  let expectRuby = false;
  let expectLegacyWritingMode = false;
  for (const item of publication.spine) {
    const hints = preflight.hints.get(item.index);
    const rendition = core.resolveSpineRendition(publication, item);
    if (hints?.writingMode === 'vertical-rl') verticalCount += 1;
    if (rendition.layout === 'pre-paginated') prePaginatedCount += 1;
    if (hints?.page?.pageLike && rendition.layout === 'reflowable') {
      reflowableImagePageCount += 1;
      if (hints.page.likelySpanningSpread) spanningImageCount += 1;
    }
    if (item.path && /x?html?/i.test(item.mediaType) && opened.archive.has(item.path)) {
      const source = await opened.archive.readText(item.path);
      if (source.includes('<ruby') || source.includes(':ruby')) expectRuby = true;
    }
  }
  for (const entry of opened.archive.entries) {
    if (!entry.toLowerCase().endsWith('.css')) continue;
    const css = await opened.archive.readText(entry);
    if (/-epub-writing-mode|-webkit-writing-mode/iu.test(css)) expectLegacyWritingMode = true;
  }
  return {
    id: `book-${sha256.slice(0, 12)}`,
    path,
    sha256,
    spineCount: publication.spine.length,
    pageProgressionDirection: publication.pageProgressionDirection,
    verticalCount,
    prePaginatedCount,
    reflowableImagePageCount,
    spanningImageCount,
    strictArchive: Boolean(strict.archive),
    expectRuby,
    expectLegacyWritingMode,
  };
}
