import { ReaderThemeRegistry } from "../../core/presentation/appearance";
import { describeReaderPosition } from "../../core/features/accessibility";
import { MemoryReaderMarkStore } from "../../core/features/annotations/store";
import { ReaderMarkController } from "../../core/features/annotations/controller";
import {
  PublicationSearch,
  ReaderSearchController,
} from "../../core/features/search";
import type { SearchDocumentProvider } from "../../core/features/search";
import type {
  Locator,
  LocatorRange,
  Publication,
} from "../../core/epub/publication";
import { commandForPageClick } from "../../core/interaction/input";
import { buildReaderPreferenceCss } from "../../core/presentation/renderer/reflowable";
import {
  mapContentClientXToViewport,
  semanticCursorForClickZone,
  verticalScrollTarget,
} from "../../core/interaction/input/browser-input-router";
import type { RenditionPlan } from "../../core/presentation/rendition";
import { PublicationDiagnosticCollector } from "../../core/runtime/reader/diagnostic-collector";
import { addBookmarkAndNotify } from "../../core/runtime/reader/bookmark-event";
import {
  fixedLayoutPublicationProgress,
  locationForPublicationProgress,
  publicationProgress,
  spineIndexForPublicationProgress,
} from "../../core/interaction/locator";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const publication: Publication = {
  version: "3.3",
  packagePath: "EPUB/package.opf",
  metadata: {
    title: "Reader features fixture",
    creators: [],
    contributors: [],
    entries: [],
  },
  manifest: [0, 1, 2].map((index) => ({
    id: `c${index}`,
    sourceHref: `c${index}.xhtml`,
    href: `EPUB/c${index}.xhtml`,
    path: `EPUB/c${index}.xhtml`,
    remote: false,
    mediaType: "application/xhtml+xml",
    properties: [],
  })),
  spine: [0, 1, 2].map((index) => ({
    index,
    idref: `c${index}`,
    href: `EPUB/c${index}.xhtml`,
    path: `EPUB/c${index}.xhtml`,
    remote: false,
    mediaType: "application/xhtml+xml",
    linear: index !== 1,
    properties: [],
    rendition: {},
  })),
  navigation: { source: "none", toc: [], landmarks: [], pageList: [] },
  pageProgressionDirection: "ltr",
  rendition: {
    layout: "reflowable",
    orientation: "auto",
    spread: "auto",
    flow: "paginated",
  },
};

const texts = [
  "Alpha beta alpha. Alphabet should not count as whole word alpha. 𐐀alpha. İx match.",
  "Non linear alpha secret.",
  "Gamma ALPHA delta alpha.",
];
const searchDocumentLoads = [0, 0, 0];

const provider: SearchDocumentProvider = {
  async load(spineIndex, signal) {
    if (signal.aborted) throw signal.reason;
    const item = publication.spine[spineIndex];
    if (!item) return null;
    searchDocumentLoads[spineIndex] =
      (searchDocumentLoads[spineIndex] ?? 0) + 1;
    const text = texts[spineIndex] ?? "";
    return {
      spineIndex,
      href: item.href,
      text,
      segments: [],
    };
  },
};

async function main() {
  assert(
    verticalScrollTarget(40, 300, 60) === 100,
    "wheel routing should consume scroll while a fixed page can move downward",
  );
  assert(
    verticalScrollTarget(300, 300, 60) == null,
    "wheel routing should expose the bottom boundary for page navigation",
  );
  assert(
    verticalScrollTarget(0, 300, -60) == null,
    "wheel routing should expose the top boundary for page navigation",
  );
  assert(
    semanticCursorForClickZone(10, 100, 0.2) === "pointer",
    "fixed-layout edge zones should expose clickable cursor semantics",
  );
  assert(
    semanticCursorForClickZone(50, 100, 0.2) == null,
    "the fixed-layout center should retain its native cursor",
  );
  const spreadCentre = mapContentClientXToViewport(
    0,
    1000,
    { left: 400, width: 400 },
    { left: 0, width: 800 },
  );
  assert(
    spreadCentre === 400,
    "the inner edge of a spread leaf must map to the centre of the shared reader viewport",
  );
  assert(
    commandForPageClick(spreadCentre, 800, 0.22, "rtl", true)?.type ===
      "toggle-chrome",
    "a spread-centre click must toggle controls instead of turning a page",
  );
  const spreadOuterEdge = mapContentClientXToViewport(
    1000,
    1000,
    { left: 400, width: 400 },
    { left: 0, width: 800 },
  );
  assert(
    commandForPageClick(spreadOuterEdge, 800, 0.22, "rtl", true)?.type ===
      "navigate",
    "the outer edge of a spread must remain a page-turn zone",
  );
  const screenshotInnerPage = mapContentClientXToViewport(
    1450,
    1700,
    { left: 0, width: 1035 },
    { left: 0, width: 2070 },
  );
  assert(
    screenshotInnerPage > 800 && screenshotInnerPage < 1035,
    "a scaled left-page inner region must remain near the shared viewport centre",
  );
  assert(
    commandForPageClick(screenshotInnerPage, 2070, 0.4, "rtl", true)?.type ===
      "toggle-chrome",
    "the fit-width inner-page region must remain a control gesture even with the widest tap zones",
  );

  assert(
    Math.round(fixedLayoutPublicationProgress(10, 197) * 100) === 5,
    "fixed-layout controls should derive progress from the active spine page",
  );
  assert(
    spineIndexForPublicationProgress(0.5, 197) === 98,
    "fixed-layout seeking should resolve publication progress to a spine page",
  );

  // A mixed-layout book spends its whole front matter in single-page sections.
  // Those are never partway through themselves, so a section-scoped bar reads
  // 0% for a dozen consecutive turns; the publication-scoped one has to move.
  const frontMatter = [0, 1, 2, 3, 4, 5, 6, 7].map((index) =>
    Math.round(publicationProgress(index, 25, 0) * 100),
  );
  assert(
    new Set(frontMatter).size === frontMatter.length,
    "every single-page section must report a distinct publication progress",
  );
  assert(frontMatter[0] === 0, "the first section of a publication is 0%");
  assert(
    publicationProgress(24, 25, 0) < 1,
    "the start of a final continuous section must leave room for its internal progress",
  );
  assert(
    publicationProgress(24, 25, 1) === 1,
    "the end of the final section is 100%",
  );

  // Blending the position inside the current section keeps a long chapter
  // advancing without ever passing the section that follows it.
  assert(
    publicationProgress(10, 25, 0.5) > publicationProgress(10, 25, 0),
    "progress within a section must advance the publication bar",
  );
  assert(
    publicationProgress(10, 25, 1) === publicationProgress(11, 25, 0),
    "the end of one section must meet the start of the next",
  );
  assert(
    publicationProgress(10, 25, 2) === publicationProgress(10, 25, 1),
    "out-of-range section progress must clamp",
  );
  assert(
    publicationProgress(10, 25, Number.NaN) === publicationProgress(10, 25, 0),
    "a non-finite section progress must not poison the bar",
  );

  // Seeking has to invert whatever the bar is showing.
  for (const [index, within] of [
    [0, 0],
    [7, 0.25],
    [13, 0.5],
    [24, 0],
    [24, 0.5],
    [24, 1],
  ] as const) {
    const round = locationForPublicationProgress(
      publicationProgress(index, 25, within),
      25,
    );
    assert(
      round.spineIndex === index,
      `seeking must land back on section ${index}, got ${round.spineIndex}`,
    );
    assert(
      Math.abs(round.progression - within) < 1e-9,
      `seeking must recover the offset inside section ${index}`,
    );
  }
  assert(
    locationForPublicationProgress(1.5, 25).spineIndex === 24,
    "seeking past the end clamps to the last section",
  );
  assert(
    locationForPublicationProgress(-1, 25).spineIndex === 0,
    "seeking before the start clamps to the first section",
  );

  const search = new PublicationSearch(publication, provider);
  const normal = await search.search("alpha");
  assert(
    normal.hits.length === 7,
    "search should find case-insensitive matches in linear spine items and skip non-linear items",
  );
  assert(
    normal.hits.every((hit) => hit.spineIndex !== 1),
    'ordinary search should skip linear="no" by default',
  );

  const whole = await search.search("alpha", {
    wholeWord: true,
    caseSensitive: false,
  });
  assert(
    whole.hits.length === 5,
    "whole-word search should exclude Alphabet and astral-letter prefixes while retaining standalone alpha/ALPHA",
  );

  const unicodeExcerpt = (await search.search("match")).hits[0];
  assert(
    unicodeExcerpt != null,
    "the Unicode excerpt fixture must produce a search hit",
  );
  assert(
    unicodeExcerpt.excerpt.slice(
      unicodeExcerpt.excerptMatchStart,
      unicodeExcerpt.excerptMatchEnd,
    ) === "match",
    "search must preserve excerpt offsets when earlier Unicode case folding changes string length",
  );

  const repeatedDiagnostic = {
    code: "RENDER_REPEAT",
    severity: "warning",
    phase: "content",
    message: "Repeated warning.",
    path: "EPUB/c0.xhtml",
    spineIndex: 0,
  } as const;
  const diagnostics = new PublicationDiagnosticCollector([repeatedDiagnostic]);
  assert(
    diagnostics.append([repeatedDiagnostic]).length === 0,
    "revisiting a section must not append an identical diagnostic again",
  );
  assert(
    diagnostics.append([{ ...repeatedDiagnostic, spineIndex: 2 }]).length === 1,
    "the same diagnostic on another spine item must remain observable",
  );
  assert(
    diagnostics.all.length === 2,
    "diagnostic collection must retain only distinct publication occurrences",
  );

  let bookmarkIntents = 0;
  const missingBookmark = await addBookmarkAndNotify(
    async () => null,
    undefined,
    () => {
      bookmarkIntents += 1;
    },
  );
  assert(
    missingBookmark === null && bookmarkIntents === 0,
    "failed locator capture must not announce that a bookmark was saved",
  );
  const savedBookmark = await addBookmarkAndNotify(
    async () => ({
      id: "bookmark-feedback",
      kind: "bookmark",
      locator: {
        href: "EPUB/c0.xhtml",
        spineIndex: 0,
        locations: { progression: 0.25 },
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }),
    undefined,
    () => {
      bookmarkIntents += 1;
    },
  );
  assert(
    savedBookmark?.id === "bookmark-feedback" && Number(bookmarkIntents) === 1,
    "bookmark success feedback must follow a completed bookmark write",
  );

  const includingNonLinear = await search.search("secret", {
    includeNonLinear: true,
  });
  assert(
    includingNonLinear.hits.length === 1 &&
      includingNonLinear.hits[0]?.spineIndex === 1,
    "search policy should be able to include non-linear resources explicitly",
  );

  const limited = await search.search("alpha", { maxResults: 2 });
  assert(
    limited.hits.length === 2 && limited.truncated,
    "search maxResults should report truncation",
  );
  assert(
    searchDocumentLoads.every((count) => count === 1),
    "repeated queries must reuse each parsed publication document",
  );

  const boundedLoads = [0, 0, 0];
  const boundedProvider: SearchDocumentProvider = {
    async load(spineIndex, signal) {
      if (signal.aborted) throw signal.reason;
      const item = publication.spine[spineIndex];
      if (!item) return null;
      boundedLoads[spineIndex] = (boundedLoads[spineIndex] ?? 0) + 1;
      return {
        spineIndex,
        href: item.href,
        text: `cache term ${spineIndex}`,
        segments: [],
      };
    },
  };
  const boundedSearch = new PublicationSearch(publication, boundedProvider, {
    cache: { maxDocuments: 2, maxBytes: 1024 * 1024 },
    preferredSpineIndex: () => 0,
  });
  await boundedSearch.search("term", { includeNonLinear: true });
  assert(
    boundedSearch.cacheSnapshot.spineIndexes.join(",") === "0,1",
    "cache pressure should preserve the current and adjacent sections before distant ones",
  );
  await boundedSearch.search("term", { includeNonLinear: true });
  assert(
    boundedLoads.join(",") === "1,1,2",
    "an evicted distant section should reload while preferred indexes remain cached",
  );
  boundedSearch.clearCache();
  assert(
    boundedSearch.cacheSnapshot.documents === 0 &&
      boundedSearch.cacheSnapshot.estimatedBytes === 0,
    "clearCache should release all resolved indexes",
  );

  const uncached = new PublicationSearch(publication, boundedProvider, {
    cache: { maxDocuments: 3, maxBytes: 1 },
  });
  const uncachedResults = await uncached.search("term", {
    includeNonLinear: true,
  });
  assert(
    uncachedResults.hits.length === 3 && uncached.cacheSnapshot.documents === 0,
    "an index larger than the byte budget should serve the active query without remaining cached",
  );

  let pendingAborted = false;
  const pendingSearch = new PublicationSearch(publication, {
    load(_spineIndex, signal) {
      return new Promise((_resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => {
            pendingAborted = true;
            reject(signal.reason);
          },
          { once: true },
        ),
      );
    },
  });
  const pendingResult = pendingSearch.search("term").then(
    () => null,
    (error) => error,
  );
  await Promise.resolve();
  assert(
    pendingSearch.cacheSnapshot.pending === 1,
    "an in-flight index should be visible as pending cache work",
  );
  pendingSearch.clearCache();
  const pendingError = await pendingResult;
  assert(
    pendingAborted &&
      pendingError instanceof DOMException &&
      pendingError.name === "AbortError",
    "clearCache should abort pending index construction",
  );
  assert(
    Number(pendingSearch.cacheSnapshot.pending) === 0,
    "clearing pending work should leave an empty cache",
  );

  const visited: Locator[] = [];
  const searchController = new ReaderSearchController(search, {
    async goToLocator(locator) {
      visited.push(locator);
      return locator;
    },
  });
  const controllerResults = await searchController.run("alpha", {
    maxResults: 3,
  });
  assert(
    searchController.state.index === -1 && controllerResults.hits.length === 3,
    "search results should remain unselected until navigation occurs",
  );
  const nextSearchNavigation = await searchController.next();
  assert(
    Number(searchController.state.index) === 0 && Number(visited.length) === 1,
    "Next should navigate to the first hit when no result is selected",
  );
  assert(
    nextSearchNavigation?.locator === visited[0],
    "search navigation should return the locator actually restored by the navigator",
  );
  await searchController.previous();
  assert(
    Number(searchController.state.index) === 2 && Number(visited.length) === 2,
    "search controller should navigate backward and wrap through results",
  );
  searchController.clearCache();
  assert(
    search.cacheSnapshot.documents === 0 &&
      searchController.state.hits.length === 3,
    "cache clearing should release indexes without discarding visible results",
  );
  searchController.clear();
  assert(
    Number(searchController.state.hits.length) === 0 &&
      Number(searchController.state.index) === -1,
    "search clear should reset feature state",
  );

  // Superseded searches are a newest-wins feature operation: an older caller
  // resolves harmlessly and is forbidden from overwriting the newer state.
  let releaseSlow!: () => void;
  const slowGate = new Promise<void>((resolve) => {
    releaseSlow = resolve;
  });
  const cancellableProvider: SearchDocumentProvider = {
    async load(spineIndex, signal) {
      if (spineIndex === 0)
        await Promise.race([
          slowGate,
          new Promise<never>((_, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            }),
          ),
        ]);
      if (signal.aborted) throw signal.reason;
      return provider.load(spineIndex, signal);
    },
  };
  const cancellableController = new ReaderSearchController(
    new PublicationSearch(publication, cancellableProvider),
    {
      async goToLocator(locator) {
        return locator;
      },
    },
  );
  const superseded = cancellableController.run("alpha");
  const winner = cancellableController.run("gamma");
  releaseSlow();
  await Promise.all([superseded, winner]);
  assert(
    cancellableController.state.query === "gamma" &&
      !cancellableController.state.searching,
    "superseded search must not overwrite the winning query state",
  );

  const store = new MemoryReaderMarkStore();
  let publishes = 0;
  const unsubscribe = store.subscribe(() => {
    publishes += 1;
  });
  const first: Locator = {
    href: "EPUB/c0.xhtml",
    spineIndex: 0,
    locations: { progression: 0.5 },
  };
  const range: LocatorRange = {
    start: first,
    end: { ...first, locations: { progression: 0.6 } },
  };
  store.put({
    id: "h1",
    kind: "highlight",
    range,
    color: "yellow",
    highlight: "solid",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const markController = new ReaderMarkController(
    store,
    {
      async captureLocator() {
        return first;
      },
    },
    {
      async goToLocator() {
        return null;
      },
    },
    () => new Date("2026-02-01T00:00:00.000Z"),
  );
  const updatedHighlight = markController.update("h1", {
    color: "blue",
    highlight: "underline",
    tags: ["review", " review ", ""],
  });
  assert(
    updatedHighlight?.kind === "highlight" &&
      updatedHighlight.color === "blue" &&
      updatedHighlight.highlight === "underline",
    "mark controller should update an existing highlight without changing its identity",
  );
  assert(
    updatedHighlight?.tags?.join(",") === "review",
    "mark tag edits should trim, deduplicate and discard empty tags",
  );
  store.put({
    id: "b1",
    kind: "bookmark",
    locator: { ...first, locations: { progression: 0.1 } },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert(
    store.snapshot().marks[0]?.id === "b1",
    "mark store should present marks in publication reading-position order",
  );
  store.put({
    id: "a1",
    kind: "annotation",
    range,
    body: "Note",
    color: "pink",
    highlight: "solid",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert(
    store.removeMany(["h1", "a1", "missing", "h1"]) === 2 &&
      store.snapshot().marks.length === 1,
    "batch removal should delete every matching mark exactly once",
  );
  unsubscribe();
  assert(
    publishes === 6,
    "batch removal should publish one atomic revision rather than one revision per mark",
  );

  const themes = new ReaderThemeRegistry();
  assert(
    themes.resolve("paper")?.background === "#f7f1e3" &&
      themes.resolve("graphite")?.colorScheme === "dark",
    "all exposed reader themes must resolve to real definitions",
  );
  themes.register({
    id: "custom-night",
    label: "Custom night",
    foreground: "#ddd",
    background: "#111",
    colorScheme: "dark",
  });
  assert(
    themes.resolve("custom-night")?.background === "#111",
    "theme registry should accept user-defined themes",
  );
  assert(
    themes.unregister("custom-night"),
    "custom reader themes should be removable",
  );
  assert(
    !themes.unregister("publisher"),
    "publisher theme is the non-removable semantic baseline",
  );
  assert(
    !themes.unregister("paper"),
    "built-in reader themes must not be removable from a shared catalog",
  );
  let unsafeThemeRejected = false;
  try {
    themes.register({ id: "unsafe-theme", foreground: "red; position:fixed" });
  } catch {
    unsafeThemeRejected = true;
  }
  assert(
    unsafeThemeRejected,
    "theme contributions must reject declaration-breaking values at registration",
  );
  let networkThemeRejected = false;
  try {
    themes.register({
      id: "network-theme",
      background: "url(https://example.com/pixel)",
    });
  } catch {
    networkThemeRejected = true;
  }
  assert(
    networkThemeRejected,
    "theme contributions must not introduce network-backed CSS values",
  );
  const cssPlan = {
    preferences: {
      flow: "auto",
      spread: "auto",
      pageProgression: "auto",
      fontSizePercent: 100,
      fontFamily: null,
      lineHeight: null,
      theme: "unsafe",
    },
  } as unknown as RenditionPlan;
  const safeThemeCss = buildReaderPreferenceCss(cssPlan, {
    id: "unsafe",
    foreground: "red; position:fixed",
    background: "#fff",
  });
  assert(
    !safeThemeCss.includes("position:fixed") &&
      safeThemeCss.includes("background: #fff"),
    "reader theme CSS must reject declaration-breaking custom values",
  );

  const described = describeReaderPosition(
    {
      ...publication,
      navigation: {
        source: "epub3-nav",
        landmarks: [],
        pageList: [],
        toc: [
          {
            label: "Chapter One",
            href: "EPUB/c0.xhtml",
            path: "EPUB/c0.xhtml",
            children: [],
          },
        ],
      },
    },
    {
      locator: {
        href: "EPUB/c0.xhtml",
        spineIndex: 0,
        locations: { progression: 0.42 },
      },
      layout: { pageCount: 10, currentPage: 4 },
    },
  );
  assert(
    described.announcement.includes("Chapter One") &&
      described.announcement.includes("Page 4 of 10") &&
      described.announcement.includes("42%"),
    "accessibility description should expose chapter, visual page projection and logical progress",
  );

  console.log("Reader features unit test: PASS");
}

void main();
