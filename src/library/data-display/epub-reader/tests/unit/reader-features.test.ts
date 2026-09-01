import { ReaderThemeRegistry } from '../../core/presentation/appearance';
import { describeReaderPosition } from '../../core/features/accessibility';
import { MemoryReaderMarkStore } from '../../core/features/annotations/store';
import { ReaderMarkController } from '../../core/features/annotations/controller';
import { PublicationSearch, ReaderSearchController } from '../../core/features/search';
import type { SearchDocumentProvider } from '../../core/features/search';
import type { Locator, LocatorRange, Publication } from '../../core/epub/publication';
import { commandForClickZone, commandForKey, commandForPageClick, commandForSwipe, commandForWheel, isInteractivePublicationTarget, ReaderInputController, touchNavigationAllows } from '../../core/interaction/input';
import { buildReaderPreferenceCss } from '../../core/presentation/renderer/reflowable';
import { BrowserReaderInputRouter, mapContentClientXToViewport, semanticCursorForClickZone, verticalScrollTarget } from '../../core/interaction/input/browser-input-router';
import type { RenditionPlan } from '../../core/presentation/rendition';
import { fixedLayoutPublicationProgress, locationForPublicationProgress, publicationProgress, spineIndexForPublicationProgress } from '../../react/controls-model';

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
  const spreadCentre = mapContentClientXToViewport(
    0,
    1000,
    { left: 400, width: 400 },
    { left: 0, width: 800 },
  );
  assert(spreadCentre === 400, 'the inner edge of a spread leaf must map to the centre of the shared reader viewport');
  assert(commandForPageClick(spreadCentre, 800, 0.22, 'rtl', true)?.type === 'toggle-chrome', 'a spread-centre click must toggle controls instead of turning a page');
  const spreadOuterEdge = mapContentClientXToViewport(
    1000,
    1000,
    { left: 400, width: 400 },
    { left: 0, width: 800 },
  );
  assert(commandForPageClick(spreadOuterEdge, 800, 0.22, 'rtl', true)?.type === 'navigate', 'the outer edge of a spread must remain a page-turn zone');
  const screenshotInnerPage = mapContentClientXToViewport(
    1450,
    1700,
    { left: 0, width: 1035 },
    { left: 0, width: 2070 },
  );
  assert(screenshotInnerPage > 800 && screenshotInnerPage < 1035, 'a scaled left-page inner region must remain near the shared viewport centre');
  assert(commandForPageClick(screenshotInnerPage, 2070, 0.4, 'rtl', true)?.type === 'toggle-chrome', 'the fit-width inner-page region must remain a control gesture even with the widest tap zones');

  assert(Math.round(fixedLayoutPublicationProgress(10, 197) * 100) === 5, 'fixed-layout controls should derive progress from the active spine page');
  assert(spineIndexForPublicationProgress(0.5, 197) === 98, 'fixed-layout seeking should resolve publication progress to a spine page');

  // A mixed-layout book spends its whole front matter in single-page sections.
  // Those are never partway through themselves, so a section-scoped bar reads
  // 0% for a dozen consecutive turns; the publication-scoped one has to move.
  const frontMatter = [0, 1, 2, 3, 4, 5, 6, 7].map(index => Math.round(publicationProgress(index, 25, 0) * 100));
  assert(new Set(frontMatter).size === frontMatter.length, 'every single-page section must report a distinct publication progress');
  assert(frontMatter[0] === 0, 'the first section of a publication is 0%');
  assert(publicationProgress(24, 25, 0) < 1, 'the start of a final continuous section must leave room for its internal progress');
  assert(publicationProgress(24, 25, 1) === 1, 'the end of the final section is 100%');

  // Blending the position inside the current section keeps a long chapter
  // advancing without ever passing the section that follows it.
  assert(publicationProgress(10, 25, 0.5) > publicationProgress(10, 25, 0), 'progress within a section must advance the publication bar');
  assert(publicationProgress(10, 25, 1) === publicationProgress(11, 25, 0), 'the end of one section must meet the start of the next');
  assert(publicationProgress(10, 25, 2) === publicationProgress(10, 25, 1), 'out-of-range section progress must clamp');
  assert(publicationProgress(10, 25, Number.NaN) === publicationProgress(10, 25, 0), 'a non-finite section progress must not poison the bar');

  // Seeking has to invert whatever the bar is showing.
  for (const [index, within] of [[0, 0], [7, 0.25], [13, 0.5], [24, 0], [24, 0.5], [24, 1]] as const) {
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
    const click = listeners.get('click')?.[0];
    assert(click, 'the router must listen for clicks on the reading surface');
    click!({ button: 0, clientX: 400, target: host, cancelable: true, preventDefault: () => {} });
    assert(dispatched.includes('toggle-chrome:'), 'a center click must toggle reader controls');
    router.dispose();
  }

  // Paginated documents use their scrolling element as a private page
  // transport. Every plain-wheel event that reaches that transport must be
  // claimed, including sub-threshold deltas and events suppressed by the
  // cooldown; otherwise the browser applies the ignored event as native
  // scrolling and leaves a vertical page between fragmentainer boundaries.
  // Real nested overflow regions still scroll first. A genuinely scrolled
  // rendition owns the gesture through its outer boundary so the host page
  // behind the reader never moves.
  {
    const listeners = new Map<string, ((event: unknown) => void)[]>();
    const attributes = new Set<string>();
    let tabIndex: number | undefined;
    const host = {
      nodeType: 1,
      localName: 'div',
      style: {},
      parentElement: null,
      scrollTop: 0,
      scrollHeight: 600,
      clientHeight: 600,
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
    let presentation: 'paginated' | 'scrolled' = 'paginated';
    let contentKind: 'reflowable' | 'fixed-layout' = 'reflowable';
    let wheelBoundaryNavigation = false;
    const dispatched: string[] = [];
    const router = new BrowserReaderInputRouter(
      host,
      () => ({
        enabled: true,
        pageProgression: 'ltr',
        contentKind,
        presentation,
        wheelBoundaryNavigation,
        touchNavigation: 'both',
        pageTurnZonePercent: 30,
      }),
      { dispatch: (command: { type: string; direction?: string }) => { dispatched.push(`${command.type}:${command.direction ?? ''}`); } } as never,
    );
    const wheel = listeners.get('wheel')?.[0];
    assert(wheel, 'the router must listen for wheel input');
    const prevented: number[] = [];
    const preventedCount = () => prevented.length;
    const fire = (deltaY: number, target: EventTarget = host) => wheel!({
      deltaY,
      deltaMode: 0,
      target,
      cancelable: true,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => { prevented.push(deltaY); },
    });

    fire(30);
    assert(dispatched.length === 1 && preventedCount() === 1, `the first paginated wheel gesture must turn one page and claim native scrolling (dispatched ${dispatched.length}, prevented ${preventedCount()})`);
    fire(30);
    assert(dispatched.length === 1 && preventedCount() === 2, 'a cooldown-suppressed wheel event must still be claimed by paginated mode');
    fire(5);
    assert(dispatched.length === 1 && preventedCount() === 3, 'a sub-threshold wheel event must not leak into the paginated scrolling element');

    const nestedDocument = { defaultView: { getComputedStyle: () => ({ overflowY: 'auto' }) } };
    const nested = {
      nodeType: 1,
      localName: 'div',
      parentElement: host,
      ownerDocument: nestedDocument,
      scrollTop: 20,
      scrollHeight: 300,
      clientHeight: 100,
    } as unknown as HTMLElement;
    fire(30, nested);
    assert(nested.scrollTop === 50, 'a nested publication overflow region must consume wheel movement before page navigation');
    assert(dispatched.length === 1 && preventedCount() === 4, 'nested scrolling must not also dispatch a page turn');

    presentation = 'scrolled';
    Object.defineProperty(host, 'ownerDocument', {
      value: { scrollingElement: host, defaultView: { getComputedStyle: () => ({ overflowY: 'auto' }) } },
    });
    fire(30);
    assert(dispatched.length === 1 && preventedCount() === 5, 'a scrolled rendition must claim wheel input instead of leaking it to the host page');

    // Fixed-layout cover/width fitting scrolls a host-realm container outside
    // the content iframe. Wheel events originate in the iframe document, so the
    // router has to cross from its surface element to that outer owner without
    // relying on same-realm HTMLElement identity.
    presentation = 'paginated';
    contentKind = 'fixed-layout';
    wheelBoundaryNavigation = true;
    const outerDocument = { defaultView: { getComputedStyle: () => ({ overflowY: 'auto' }) } };
    const outer = {
      nodeType: 1,
      localName: 'div',
      parentElement: null,
      ownerDocument: outerDocument,
      scrollTop: 40,
      scrollHeight: 500,
      clientHeight: 200,
    } as unknown as HTMLElement;
    const surface = {
      nodeType: 1,
      localName: 'iframe',
      style: {},
      parentElement: outer,
      ownerDocument: outerDocument,
      scrollTop: 0,
      scrollHeight: 200,
      clientHeight: 200,
    } as unknown as HTMLElement;
    const contentListeners = new Map<string, ((event: unknown) => void)[]>();
    const contentRoot = {
      nodeType: 1,
      localName: 'html',
      style: {},
      parentElement: null,
      scrollTop: 0,
      scrollHeight: 600,
      clientHeight: 200,
    } as unknown as HTMLElement;
    const contentDocument = {
      documentElement: contentRoot,
      scrollingElement: contentRoot,
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        contentListeners.set(type, [...(contentListeners.get(type) ?? []), handler]);
      },
      removeEventListener: () => {},
    } as unknown as Document;
    Object.defineProperty(contentRoot, 'ownerDocument', { value: contentDocument });
    router.syncDocuments([{ spineIndex: 0, href: 'page.xhtml', document: contentDocument, surfaceElement: surface }]);
    const contentWheel = contentListeners.get('wheel')?.[0];
    assert(contentWheel, 'the router must listen for wheel input inside a content document');
    const fireContentWheel = () => contentWheel!({
      deltaY: 30,
      deltaMode: 0,
      target: contentRoot,
      cancelable: true,
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => { prevented.push(30); },
    });
    presentation = 'scrolled';
    contentKind = 'reflowable';
    wheelBoundaryNavigation = false;
    fireContentWheel();
    assert(contentRoot.scrollTop === 30, 'a scrolled rendition must continue from nested content onto its document scrolling element');
    assert(preventedCount() === 6, 'scrolled document movement must remain contained by the reader');

    presentation = 'paginated';
    contentKind = 'fixed-layout';
    wheelBoundaryNavigation = true;
    fireContentWheel();
    assert(outer.scrollTop === 70, 'a fixed-layout host container must scroll before wheel input turns the page at its boundary');
    assert(dispatched.length === 1 && preventedCount() === 7, 'fixed-layout canvas scrolling must consume the gesture without a page turn');
    router.dispose();
  }

  // Focus can end up owned by nothing -- swapping renderers destroys the content
  // document that held it, and the browser hands it to the body. Nothing else in
  // the reader moves focus, so from there every reading key would be lost for
  // good. The router keeps a document-level fallback for exactly that state, and
  // it must not fire when some element does own focus, or every key would be
  // handled twice.
  {
    const documentListeners = new Map<string, ((event: unknown) => void)[]>();
    const stubElement = (localName: string) => ({ nodeType: 1, localName, hasAttribute: () => false }) as unknown as HTMLElement;
    const body = stubElement('body');
    const documentElement = stubElement('html');
    let activeElement: unknown = body;
    let focusCalls = 0;
    const attributes = new Set<string>();
    let tabIndex: number | undefined;
    const owner = {
      body,
      documentElement,
      get activeElement() { return activeElement; },
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        documentListeners.set(type, [...(documentListeners.get(type) ?? []), handler]);
      },
      removeEventListener: () => {},
    };
    const host = {
      style: {},
      ownerDocument: owner,
      get tabIndex() { return tabIndex ?? -0; },
      set tabIndex(value: number) { tabIndex = value; attributes.add('tabindex'); },
      hasAttribute: (name: string) => attributes.has(name),
      focus: () => { focusCalls += 1; },
      addEventListener: () => {},
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

    const documentKeydown = documentListeners.get('keydown')?.[0];
    assert(documentKeydown, 'the router must keep a document-level fallback for abandoned focus');

    documentKeydown!({ key: 'ArrowRight', target: body, preventDefault: () => {}, stopPropagation: () => {} });
    assert(dispatched.length === 1, `a key pressed while focus sits on the body must still turn the page, got ${dispatched.length}`);
    assert(focusCalls > 0, 'the router must take focus back once it handles a key nobody else could');

    // Something owns focus now, so the event reaches it through its own listener
    // and the fallback has to stay out of the way.
    activeElement = stubElement('button');
    documentKeydown!({ key: 'ArrowRight', target: activeElement, preventDefault: () => {}, stopPropagation: () => {} });
    assert(dispatched.length === 1, 'the fallback must not double-handle a key an element already owns');
    router.dispose();
  }

  assert(commandForWheel(50, false)?.type === 'navigate', 'plain wheel should emit semantic navigation');
  const fontWheel = commandForWheel(-50, true);
  assert(fontWheel?.type === 'font-step' && fontWheel.delta === 1, 'modified wheel should emit font-size command');
  const leftClick = commandForClickZone(5, 100, 0.2, 'rtl');
  assert(leftClick?.type === 'navigate' && leftClick.direction === 'forward', 'RTL left click-zone should move forward');
  assert(commandForPageClick(50, 100, 0.2, 'ltr', true)?.type === 'toggle-chrome', 'the center page zone should toggle reader controls');
  assert(commandForPageClick(5, 100, 0.2, 'ltr', false) == null, 'a disabled edge zone must not become a controls gesture');
  assert(commandForPageClick(50, 100, 0.2, 'ltr', false)?.type === 'toggle-chrome', 'disabling tap navigation should retain the center control gesture');
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
