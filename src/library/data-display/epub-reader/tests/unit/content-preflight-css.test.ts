import { MemoryPublicationArchive, type PublicationArchive } from '../../core/epub/archive';
import { preflightPublicationContent, PublicationContentPreflightSession } from '../../core/epub/content/preflight';
import type { Publication, PublicationPath, WritingMode } from '../../core/epub/publication';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Preflight resolves the writing mode from the authored CSS before the first
 * rendition plan exists, so a wrong answer lays out the whole first paint on the
 * wrong axis. Each case here is a construct taken from real Japanese EPUB
 * templates, checked against what a browser actually computes.
 */
interface PreflightCase {
  readonly name: string;
  readonly html: string;
  readonly css: Readonly<Record<string, string>>;
  readonly expected: WritingMode | undefined;
}

const CASES: readonly PreflightCase[] = [
  {
    name: 'specificity beats document order',
    // `_v.css` comes last and says vertical, but `body.imgpage` is more specific.
    html: '<html><head><link rel="stylesheet" href="base.css"/><link rel="stylesheet" href="v.css"/></head><body class="imgpage"></body></html>',
    css: {
      'base.css': 'body{writing-mode:vertical-rl}body.imgpage{writing-mode:horizontal-tb}',
      'v.css': 'body{writing-mode:vertical-rl}',
    },
    expected: 'horizontal-tb',
  },
  {
    name: 'equal specificity falls back to document order',
    html: '<html><head><link rel="stylesheet" href="a.css"/><link rel="stylesheet" href="b.css"/></head><body></body></html>',
    css: { 'a.css': 'body{writing-mode:horizontal-tb}', 'b.css': 'body{writing-mode:vertical-rl}' },
    expected: 'vertical-rl',
  },
  {
    name: 'alternate stylesheets are not applied',
    // The horizontal half of the paired vertical/horizontal sheets ships as an
    // alternate and stays inert until a reader UI offers the choice.
    html: '<html><head><link rel="stylesheet" href="v.css"/><link rel="alternate stylesheet" href="h.css"/></head><body></body></html>',
    css: { 'v.css': 'body{writing-mode:vertical-rl}', 'h.css': 'body{writing-mode:horizontal-tb}' },
    expected: 'vertical-rl',
  },
  {
    name: 'print-only rules never style the reader',
    html: '<html><head><link rel="stylesheet" href="a.css"/></head><body></body></html>',
    css: { 'a.css': 'body{writing-mode:vertical-rl}@media print{body{writing-mode:horizontal-tb}}' },
    expected: 'vertical-rl',
  },
  {
    name: 'screen rules inside @media still apply',
    html: '<html><head><link rel="stylesheet" href="a.css"/></head><body></body></html>',
    css: { 'a.css': '@media screen{body{writing-mode:vertical-rl}}' },
    expected: 'vertical-rl',
  },
  {
    name: 'keyframes and font-face contribute nothing',
    html: '<html><head><link rel="stylesheet" href="a.css"/></head><body></body></html>',
    css: { 'a.css': '@font-face{font-family:x;src:url(x.otf)}@keyframes k{from{writing-mode:horizontal-tb}}body{writing-mode:vertical-rl}' },
    expected: 'vertical-rl',
  },
  {
    name: 'descendant selectors reach body through html',
    html: '<html class="vrtl"><head><link rel="stylesheet" href="a.css"/></head><body></body></html>',
    css: { 'a.css': 'html.vrtl body{writing-mode:vertical-rl}' },
    expected: 'vertical-rl',
  },
  {
    name: 'a descendant selector that does not match is not applied',
    html: '<html class="hltr"><head><link rel="stylesheet" href="a.css"/></head><body></body></html>',
    css: { 'a.css': 'html.vrtl body{writing-mode:vertical-rl}' },
    expected: undefined,
  },
  {
    name: 'child combinators are honoured',
    html: '<html class="vrtl"><head><link rel="stylesheet" href="a.css"/></head><body></body></html>',
    css: { 'a.css': 'html.vrtl > body{writing-mode:vertical-rl}' },
    expected: 'vertical-rl',
  },
  {
    name: ':root is the html element',
    html: '<html><head><link rel="stylesheet" href="a.css"/></head><body></body></html>',
    css: { 'a.css': ':root{writing-mode:vertical-rl}' },
    expected: 'vertical-rl',
  },
  {
    name: '@charset does not swallow the first rule',
    html: '<html><head><link rel="stylesheet" href="a.css"/></head><body></body></html>',
    css: { 'a.css': '@charset "UTF-8";\nbody{writing-mode:vertical-rl}' },
    expected: 'vertical-rl',
  },
  {
    name: '!important outranks a more specific normal declaration',
    html: '<html><head><link rel="stylesheet" href="a.css"/></head><body class="imgpage"></body></html>',
    css: { 'a.css': 'body{writing-mode:vertical-rl !important}body.imgpage{writing-mode:horizontal-tb}' },
    expected: 'vertical-rl',
  },
  {
    name: 'inline style outranks any normal rule',
    html: '<html><head><link rel="stylesheet" href="a.css"/></head><body style="writing-mode:vertical-rl" class="imgpage"></body></html>',
    css: { 'a.css': 'body.imgpage{writing-mode:horizontal-tb}' },
    expected: 'vertical-rl',
  },
  {
    name: 'an important rule outranks a plain inline style',
    html: '<html><head><link rel="stylesheet" href="a.css"/></head><body style="writing-mode:horizontal-tb"></body></html>',
    css: { 'a.css': 'body{writing-mode:vertical-rl !important}' },
    expected: 'vertical-rl',
  },
  {
    name: 'a quoted brace does not unbalance the parser',
    html: '<html><head><link rel="stylesheet" href="a.css"/></head><body></body></html>',
    css: { 'a.css': 'p::before{content:"{"}body{writing-mode:vertical-rl}' },
    expected: 'vertical-rl',
  },
  {
    name: 'legacy -epub-writing-mode still resolves',
    html: '<html><head><link rel="stylesheet" href="a.css"/></head><body></body></html>',
    css: { 'a.css': 'body{-epub-writing-mode:vertical-rl}' },
    expected: 'vertical-rl',
  },
];

function publicationFor(files: readonly PublicationPath[]): Publication {
  return {
    version: '3.3',
    packagePath: 'EPUB/package.opf',
    metadata: { title: 'Preflight CSS subset', creators: [], contributors: [], entries: [] },
    manifest: files.map((path, index) => ({
      id: `item-${index}`,
      sourceHref: path.slice('EPUB/'.length),
      href: path,
      path,
      remote: false,
      mediaType: path.endsWith('.css') ? 'text/css' : 'application/xhtml+xml',
      properties: [],
    })),
    spine: [{
      index: 0,
      idref: 'item-0',
      href: 'EPUB/doc.xhtml',
      path: 'EPUB/doc.xhtml',
      remote: false,
      mediaType: 'application/xhtml+xml',
      linear: true,
      properties: [],
      rendition: {},
    }],
    navigation: { source: 'none', toc: [], landmarks: [], pageList: [] },
    pageProgressionDirection: 'rtl',
    rendition: { layout: 'reflowable', orientation: 'auto', spread: 'auto', flow: 'paginated' },
  };
}

function stagedPublication(count: number): Publication {
  const documents = Array.from({ length: count }, (_, index) => `EPUB/doc-${index}.xhtml` as PublicationPath);
  return {
    ...publicationFor(documents),
    manifest: documents.map((path, index) => ({
      id: `item-${index}`,
      sourceHref: path.slice('EPUB/'.length),
      href: path,
      path,
      remote: false,
      mediaType: 'application/xhtml+xml',
      properties: [],
    })),
    spine: documents.map((path, index) => ({
      index,
      idref: `item-${index}`,
      href: path,
      path,
      remote: false,
      mediaType: 'application/xhtml+xml',
      linear: true,
      properties: [],
      rendition: {},
    })),
  };
}

async function main() {
  const failures: string[] = [];
  for (const testCase of CASES) {
    const contents: Record<string, string> = { 'EPUB/doc.xhtml': `<?xml version="1.0"?>${testCase.html.replace('<html', '<html xmlns="http://www.w3.org/1999/xhtml"')}` };
    for (const [name, css] of Object.entries(testCase.css)) contents[`EPUB/${name}`] = css;
    const archive = new MemoryPublicationArchive(contents);
    const publication = publicationFor(Object.keys(contents) as PublicationPath[]);
    const result = await preflightPublicationContent(archive, publication);
    const resolved = result.hints.get(0)?.writingMode;
    if (resolved !== testCase.expected) {
      failures.push(`${testCase.name}: expected ${testCase.expected ?? 'no hint'}, got ${resolved ?? 'no hint'}`);
    }
  }
  assert(failures.length === 0, `preflight CSS subset regressions:\n  ${failures.join('\n  ')}`);

  const staged = stagedPublication(5);
  const contents = Object.fromEntries(staged.spine.map(item => [
    item.path!,
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="shared.css"/></head><body><p>${item.index}</p></body></html>`,
  ]));
  contents['EPUB/shared.css'] = 'body{writing-mode:vertical-rl}';
  const memory = new MemoryPublicationArchive(contents);
  const reads = new Map<PublicationPath, number>();
  const countingArchive: PublicationArchive = {
    entries: memory.entries,
    has: path => memory.has(path),
    async read(path) {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      return memory.read(path);
    },
    async readText(path, encoding) {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      return memory.readText(path, encoding);
    },
  };
  const session = new PublicationContentPreflightSession(countingArchive, staged);
  const critical = await session.inspect([1, 2, 3]);
  assert(critical.hints.size === 3, 'a render-critical preflight must return only the requested spine window');
  assert(staged.spine.filter(item => reads.has(item.path!)).length === 3, 'opening work must not inspect distant spine items');
  assert(reads.get('EPUB/shared.css') === 1, 'staged items must share stylesheet reads');

  await Promise.all([session.inspect([4]), session.inspect([4])]);
  assert(reads.get('EPUB/doc-4.xhtml') === 1, 'concurrent background and navigation requests must share one item inspection');
  const complete = await session.inspect();
  assert(complete.hints.size === 5, 'the background pass must complete the same full publication profile');
  assert(staged.spine.every(item => reads.get(item.path!) === 1), 'each content document must be inspected at most once across all stages');
  session.dispose();
  const disposed = await session.inspect([0]).then(() => null, error => error);
  assert(disposed instanceof Error && disposed.message.includes('disposed'), 'disposing a preflight session must reject new work');

  let releaseRead!: () => void;
  let delayNextRead = true;
  const delayedArchive: PublicationArchive = {
    entries: memory.entries,
    has: path => memory.has(path),
    async read(path) { return memory.read(path); },
    async readText(path, encoding) {
      if (delayNextRead) {
        delayNextRead = false;
        await new Promise<void>(resolve => { releaseRead = resolve; });
      }
      return memory.readText(path, encoding);
    },
  };
  const abortController = new AbortController();
  const abortingSession = new PublicationContentPreflightSession(delayedArchive, staged, abortController.signal);
  const aborted = abortingSession.inspect([0]).then(() => null, error => error);
  await Promise.resolve();
  abortController.abort(new DOMException('replaced', 'AbortError'));
  releaseRead();
  const abortError = await aborted;
  assert(abortError instanceof DOMException && abortError.name === 'AbortError', 'replacing a reader must cancel unfinished staged preflight');
  abortingSession.dispose();

  const openingController = new AbortController();
  const detachedSession = new PublicationContentPreflightSession(memory, staged, openingController.signal);
  detachedSession.detachParentSignal();
  openingController.abort(new DOMException('open call finished', 'AbortError'));
  const afterOpen = await detachedSession.inspect([0]);
  assert(afterOpen.hints.has(0), 'an opening signal must stop owning background preflight after the reader becomes ready');
  detachedSession.dispose();

  console.log(`Content preflight CSS subset unit test: PASS (${CASES.length} cases)`);
}

void main();
