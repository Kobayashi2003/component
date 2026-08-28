import { ReaderThemeRegistry } from '../../core/appearance';
import { describeReaderPosition } from '../../core/accessibility';
import { MemoryReaderMarkStore } from '../../core/annotations/store';
import { ReaderMarkController } from '../../core/annotations/controller';
import { PublicationSearch, ReaderSearchController } from '../../core/search';
import type { SearchDocumentProvider } from '../../core/search';
import type { Locator, LocatorRange, Publication } from '../../core/publication';
import { commandForClickZone, commandForKey, commandForSwipe, commandForWheel, isInteractivePublicationTarget, ReaderInputController, touchNavigationAllows } from '../../core/input';
import { buildReaderPreferenceCss } from '../../core/renderer/reflowable';
import { BrowserReaderInputRouter, semanticCursorForClickZone, verticalScrollTarget } from '../../core/input/browser-input-router';
import type { RenditionPlan } from '../../core/rendition';
import { locationForPublicationProgress, publicationProgress, spineIndexForPublicationProgress } from '../../react/controls-model';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const publication: Publication = {
  version: '3.3',
  packagePath: 'EPUB/package.opf',
  metadata: { title: 'Reader features fixture', creators: [], contributors: [], entries: [] },
  manifest: [0, 1, 2].map(index => ({
    id: `c${index}`,
    sourceHref: `c${index}.xhtml`, href: `EPUB/c${index}.xhtml`, path: `EPUB/c${index}.xhtml`, remote: false,
    mediaType: 'application/xhtml+xml', properties: [],
  })),
  spine: [0, 1, 2].map(index => ({
    index, idref: `c${index}`, href: `EPUB/c${index}.xhtml`, path: `EPUB/c${index}.xhtml`, remote: false,
    mediaType: 'application/xhtml+xml', linear: index !== 1, properties: [], rendition: {},
  })),
  navigation: { source: 'none', toc: [], landmarks: [], pageList: [] },
  pageProgressionDirection: 'ltr',
  rendition: { layout: 'reflowable', orientation: 'auto', spread: 'auto', flow: 'paginated' },
};

const texts = [
  'Alpha beta alpha. Alphabet should not count as whole word alpha.',
  'Non linear alpha secret.',
  'Gamma ALPHA delta alpha.',
];
const searchDocumentLoads = [0, 0, 0];

const provider: SearchDocumentProvider = {
  async load(spineIndex, signal) {
    if (signal.aborted) throw signal.reason;
    const item = publication.spine[spineIndex];
    if (!item) return null;
    searchDocumentLoads[spineIndex] = (searchDocumentLoads[spineIndex] ?? 0) + 1;
    const text = texts[spineIndex] ?? '';
    return {
      spineIndex,
      href: item.href,
      text,
      locatorRange(start, end): LocatorRange {
        return {
          start: { href: item.href, spineIndex, locations: { progression: text.length ? start / text.length : 0 } },
          end: { href: item.href, spineIndex, locations: { progression: text.length ? end / text.length : 0 } },
        };
      },
    };
  },
};

async function main() {
  assert(verticalScrollTarget(40, 300, 60) === 100, 'wheel routing should consume scroll while a fixed page can move downward');
  assert(verticalScrollTarget(300, 300, 60) == null, 'wheel routing should expose the bottom boundary for page navigation');
  assert(verticalScrollTarget(0, 300, -60) == null, 'wheel routing should expose the top boundary for page navigation');
  assert(semanticCursorForClickZone(10, 100, 0.2) === 'pointer', 'fixed-layout edge zones should expose clickable cursor semantics');
  assert(semanticCursorForClickZone(50, 100, 0.2) == null, 'the fixed-layout center should retain its native cursor');

  assert(Math.round(publicationProgress(10, 197) * 100) === 5, 'fixed-layout controls should derive progress from the active spine page');
  assert(spineIndexForPublicationProgress(0.5, 197) === 98, 'fixed-layout seeking should resolve publication progress to a spine page');

  // A mixed-layout book spends its whole front matter in single-page sections.
  // Those are never partway through themselves, so a section-scoped bar reads
  // 0% for a dozen consecutive turns; the publication-scoped one has to move.
  const frontMatter = [0, 1, 2, 3, 4, 5, 6, 7].map(index => Math.round(publicationProgress(index, 25, 0) * 100));
  assert(new Set(frontMatter).size === frontMatter.length, 'every single-page section must report a distinct publication progress');
  assert(frontMatter[0] === 0, 'the first section of a publication is 0%');
  assert(Math.round(publicationProgress(24, 25, 0) * 100) === 100, 'the last section of a publication is 100%');

  // Blending the position inside the current section keeps a long chapter
  // advancing without ever passing the section that follows it.
  assert(publicationProgress(10, 25, 0.5) > publicationProgress(10, 25, 0), 'progress within a section must advance the publication bar');
  assert(publicationProgress(10, 25, 1) === publicationProgress(11, 25, 0), 'the end of one section must meet the start of the next');
  assert(publicationProgress(10, 25, 2) === publicationProgress(10, 25, 1), 'out-of-range section progress must clamp');
  assert(publicationProgress(10, 25, Number.NaN) === publicationProgress(10, 25, 0), 'a non-finite section progress must not poison the bar');

  // Seeking has to invert whatever the bar is showing.
  for (const [index, within] of [[0, 0], [7, 0.25], [13, 0.5], [24, 0]] as const) {
    const round = locationForPublicationProgress(publicationProgress(index, 25, within), 25);
    assert(round.spineIndex === index, `seeking must land back on section ${index}, got ${round.spineIndex}`);
    assert(Math.abs(round.progression - within) < 1e-9, `seeking must recover the offset inside section ${index}`);
  }
  assert(locationForPublicationProgress(1.5, 25).spineIndex === 24, 'seeking past the end clamps to the last section');
  assert(locationForPublicationProgress(-1, 25).spineIndex === 0, 'seeking before the start clamps to the first section');

  const search = new PublicationSearch(publication, provider);
  const normal = await search.search('alpha');
  assert(normal.hits.length === 6, 'search should find case-insensitive matches in linear spine items and skip non-linear items');
  assert(normal.hits.every(hit => hit.spineIndex !== 1), 'ordinary search should skip linear="no" by default');

  const whole = await search.search('alpha', { wholeWord: true, caseSensitive: false });
  assert(whole.hits.length === 5, 'whole-word search should exclude Alphabet while retaining standalone alpha/ALPHA');

  const includingNonLinear = await search.search('secret', { includeNonLinear: true });
  assert(includingNonLinear.hits.length === 1 && includingNonLinear.hits[0]?.spineIndex === 1, 'search policy should be able to include non-linear resources explicitly');

  const limited = await search.search('alpha', { maxResults: 2 });
  assert(limited.hits.length === 2 && limited.truncated, 'search maxResults should report truncation');
  assert(searchDocumentLoads.every(count => count === 1), 'repeated queries must reuse each parsed publication document');

  const visited: Locator[] = [];
  const searchController = new ReaderSearchController(search, { async goToLocator(locator) { visited.push(locator); return locator; } });
  const controllerResults = await searchController.run('alpha', { maxResults: 3 });
  assert(searchController.state.index === 0 && controllerResults.hits.length === 3, 'search controller should select the first hit after a successful query');
  await searchController.next();
  assert(Number(searchController.state.index) === 1 && Number(visited.length) === 1, 'search controller should navigate and advance active hit state');
  await searchController.previous();
  assert(Number(searchController.state.index) === 0 && Number(visited.length) === 2, 'search controller should navigate backward through results');
  searchController.clear();
  assert(Number(searchController.state.hits.length) === 0 && Number(searchController.state.index) === -1, 'search clear should reset feature state');

  // Superseded searches are a newest-wins feature operation: an older caller
  // resolves harmlessly and is forbidden from overwriting the newer state.
  let releaseSlow!: () => void;
  const slowGate = new Promise<void>(resolve => { releaseSlow = resolve; });
  const cancellableProvider: SearchDocumentProvider = {
    async load(spineIndex, signal) {
      if (spineIndex === 0) await Promise.race([slowGate, new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))]);
      if (signal.aborted) throw signal.reason;
      return provider.load(spineIndex, signal);
    },
  };
  const cancellableController = new ReaderSearchController(new PublicationSearch(publication, cancellableProvider), { async goToLocator(locator) { return locator; } });
  const superseded = cancellableController.run('alpha');
  const winner = cancellableController.run('gamma');
  releaseSlow();
  await Promise.all([superseded, winner]);
  assert(cancellableController.state.query === 'gamma' && !cancellableController.state.searching, 'superseded search must not overwrite the winning query state');

  const store = new MemoryReaderMarkStore();
  let publishes = 0;
  const unsubscribe = store.subscribe(() => { publishes += 1; });
  const first: Locator = { href: 'EPUB/c0.xhtml', spineIndex: 0, locations: { progression: 0.5 } };
  const range: LocatorRange = { start: first, end: { ...first, locations: { progression: 0.6 } } };
  store.put({ id: 'h1', kind: 'highlight', range, color: 'yellow', highlight: 'solid', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  const markController = new ReaderMarkController(store, { async captureLocator() { return first; } }, { async goToLocator() { return null; } }, () => new Date('2026-02-01T00:00:00.000Z'));
  const updatedHighlight = markController.update('h1', { color: 'blue', highlight: 'underline' });
  assert(updatedHighlight?.kind === 'highlight' && updatedHighlight.color === 'blue' && updatedHighlight.highlight === 'underline', 'mark controller should update an existing highlight without changing its identity');
  store.put({ id: 'b1', kind: 'bookmark', locator: { ...first, locations: { progression: 0.1 } }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' });
  assert(store.snapshot().marks[0]?.id === 'b1', 'mark store should present marks in publication reading-position order');
  assert(store.remove('h1') && store.snapshot().marks.length === 1, 'mark store should remove persistent marks by id');
  unsubscribe();
  assert(publishes === 5, 'mark subscribers should receive initial snapshot plus each mutation');

  assert(commandForKey({ key: 'ArrowRight' }, 'ltr')?.type === 'navigate', 'keyboard arrows should map to semantic navigation');
  const rtlRight = commandForKey({ key: 'ArrowRight' }, 'rtl');
  assert(rtlRight?.type === 'navigate' && rtlRight.direction === 'backward', 'RTL physical-right key should navigate backward');
  assert(commandForKey({ key: 'f', ctrlKey: true }, 'ltr')?.type === 'open-search', 'Ctrl/Cmd+F should route to reader search');
  assert(commandForKey({ key: 'ArrowLeft', altKey: true }, 'ltr')?.type === 'history-back', 'Alt+Left should route to reading history');
  assert(commandForKey({ key: 'ArrowRight', altKey: true }, 'rtl')?.type === 'history-forward', 'Alt+Right history should remain physical in RTL books');
  assert(commandForKey({ key: 'c' }, 'ltr')?.type === 'toggle-chrome', 'C should toggle immersive reader controls');
  assert(commandForKey({ key: '?' }, 'ltr')?.type === 'open-help', 'question mark should expose keyboard help');
  // Delivery, not just mapping. A keyboard command can only arrive if the
  // element the router binds to is the element that holds focus: events travel
  // upward, so a focusable *parent* leaves the page keys dead. The router makes
  // its own host focusable so a host cannot accidentally focus the wrong node.
  {
    const listeners = new Map<string, ((event: unknown) => void)[]>();
    let tabIndex: number | undefined;
    const attributes = new Set<string>();
    const host = {
      style: {},
      get tabIndex() { return tabIndex ?? -0; },
      set tabIndex(value: number) { tabIndex = value; attributes.add('tabindex'); },
      hasAttribute: (name: string) => attributes.has(name),
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), handler]);
      },
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      contains: () => true,
    } as unknown as HTMLElement;

    const dispatched: string[] = [];
    const router = new BrowserReaderInputRouter(
      host,
      () => ({
        enabled: true,
        pageProgression: 'ltr',
        contentKind: 'reflowable',
        presentation: 'paginated',
        wheelBoundaryNavigation: false,
        touchNavigation: 'both',
        pageTurnZonePercent: 30,
      }),
      { dispatch: (command: { type: string; direction?: string }) => { dispatched.push(`${command.type}:${command.direction ?? ''}`); } } as never,
    );

    assert(tabIndex === -1, 'the router must make its own host element focusable');
    const keydown = listeners.get('keydown')?.[0];
    assert(keydown, 'the router must listen for keys on the element it was given');
    keydown!({ key: 'ArrowRight', target: host, preventDefault: () => {}, stopPropagation: () => {} });
    assert(dispatched.includes('navigate:forward'), 'a key on the router host must reach the dispatcher');
    router.dispose();
  }

  assert(commandForWheel(50, false)?.type === 'navigate', 'plain wheel should emit semantic navigation');
  const fontWheel = commandForWheel(-50, true);
  assert(fontWheel?.type === 'font-step' && fontWheel.delta === 1, 'modified wheel should emit font-size command');
  const leftClick = commandForClickZone(5, 100, 0.2, 'rtl');
  assert(leftClick?.type === 'navigate' && leftClick.direction === 'forward', 'RTL left click-zone should move forward');
  const swipeLeft = commandForSwipe(-100, 40, 'ltr');
  assert(swipeLeft?.type === 'navigate' && swipeLeft.direction === 'forward', 'LTR swipe-left should reveal the next page');
  assert(touchNavigationAllows('both', 'tap') && touchNavigationAllows('both', 'swipe'), 'combined touch mode should allow both gestures');
  assert(touchNavigationAllows('tap', 'tap') && !touchNavigationAllows('tap', 'swipe'), 'tap-only mode should reject swipes');
  assert(!touchNavigationAllows('off', 'tap') && !touchNavigationAllows('off', 'swipe'), 'disabled touch mode should reject pointer gestures');
  const mediaTarget = { nodeType: 1, closest: (selector: string) => selector.includes('audio') ? {} : null } as unknown as EventTarget;
  const imageViewerTarget = { nodeType: 1, closest: (selector: string) => selector.includes('[data-epub-image-viewer]') ? {} : null } as unknown as EventTarget;
  assert(isInteractivePublicationTarget(mediaTarget), 'native publication media controls must not trigger page-turn zones');
  assert(isInteractivePublicationTarget(imageViewerTarget), 'images enhanced with the viewer must not trigger page-turn zones');

  let next = 0;
  let previous = 0;
  let searchOpen = 0;
  let helpOpen = 0;
  let historyBack = 0;
  let historyForward = 0;
  let chromeToggles = 0;
  let font = 0;
  const boundaries: string[] = [];
  const input = new ReaderInputController({
    navigator: {
      async next() { next += 1; return { status: 'boundary', edge: 'end' } as const; },
      async previous() { previous += 1; return { status: 'boundary', edge: 'start' } as const; },
    },
    navigationResult(result) { if (result.status === 'boundary') boundaries.push(result.edge); },
    openSearch() { searchOpen += 1; },
    openHelp() { helpOpen += 1; },
    historyBack() { historyBack += 1; },
    historyForward() { historyForward += 1; },
    toggleChrome() { chromeToggles += 1; },
    stepFont(delta) { font += delta; },
  });
  await input.dispatch({ type: 'navigate', direction: 'forward', source: 'keyboard' });
  await input.dispatch({ type: 'navigate', direction: 'backward', source: 'keyboard' });
  await input.dispatch({ type: 'open-search', source: 'keyboard' });
  await input.dispatch({ type: 'open-help', source: 'keyboard' });
  await input.dispatch({ type: 'history-back', source: 'keyboard' });
  await input.dispatch({ type: 'history-forward', source: 'keyboard' });
  await input.dispatch({ type: 'toggle-chrome', source: 'keyboard' });
  await input.dispatch({ type: 'font-step', delta: 1, source: 'wheel' });
  assert(next === 1 && previous === 1 && searchOpen === 1 && helpOpen === 1 && historyBack === 1 && historyForward === 1 && chromeToggles === 1 && font === 1, 'input controller must route commands without touching renderer APIs');
  assert(boundaries.join(',') === 'end,start', 'input controller should expose navigation boundary results to host feedback');

  const themes = new ReaderThemeRegistry();
  assert(themes.resolve('paper')?.background === '#f7f1e3' && themes.resolve('graphite')?.colorScheme === 'dark', 'all exposed reader themes must resolve to real definitions');
  themes.register({ id: 'custom-night', foreground: '#ddd', background: '#111', colorScheme: 'dark' });
  assert(themes.resolve('custom-night')?.background === '#111', 'theme registry should accept user-defined themes');
  assert(themes.unregister('custom-night'), 'custom reader themes should be removable');
  assert(!themes.unregister('publisher'), 'publisher theme is the non-removable semantic baseline');
  const cssPlan = {
    preferences: { flow: 'auto', spread: 'auto', pageProgression: 'auto', fontSizePercent: 100, fontFamily: null, lineHeight: null, theme: 'unsafe' },
  } as unknown as RenditionPlan;
  const safeThemeCss = buildReaderPreferenceCss(cssPlan, { id: 'unsafe', foreground: 'red; position:fixed', background: '#fff' });
  assert(!safeThemeCss.includes('position:fixed') && safeThemeCss.includes('background: #fff'), 'reader theme CSS must reject declaration-breaking custom values');

  const described = describeReaderPosition({
    ...publication,
    navigation: { source: 'epub3-nav', landmarks: [], pageList: [], toc: [{ label: 'Chapter One', href: 'EPUB/c0.xhtml', path: 'EPUB/c0.xhtml', children: [] }] },
  }, { locator: { href: 'EPUB/c0.xhtml', spineIndex: 0, locations: { progression: 0.42 } }, layout: { pageCount: 10, currentPage: 4 } });
  assert(described.announcement.includes('Chapter One') && described.announcement.includes('Page 4 of 10') && described.announcement.includes('42%'), 'accessibility description should expose chapter, visual page projection and logical progress');

  console.log('Reader features unit test: PASS');
}

void main();
