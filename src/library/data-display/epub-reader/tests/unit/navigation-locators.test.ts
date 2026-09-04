import {
  DEFAULT_READER_PREFERENCES,
  type Locator,
  type Publication,
} from "../../core/epub/publication";
import {
  escapeCfiAssertion,
  parseEpubCfi,
  resolveCfiSpineItem,
  serializeCfiPath,
} from "../../core/interaction/locator";
import {
  planRendition,
  type RenditionPlan,
} from "../../core/presentation/rendition";
import type {
  RendererHostState,
  RendererNavigationResult,
} from "../../core/presentation/renderer";
import { navigationForSide } from "../../core/interaction/navigation/direction";
import type { NavigationRendererHost } from "../../core/interaction/navigation/model";
import { ReaderNavigator } from "../../core/interaction/navigation/navigator";
import { ReaderNavigationHistory } from "../../core/interaction/navigation/history";
import { PublicationLinkRouter } from "../../core/interaction/navigation/link-router";
import {
  locatorFromCfi,
  locatorFromHref,
} from "../../core/interaction/navigation/targets";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const publication: Publication = {
  version: "3.3",
  packagePath: "EPUB/package.opf",
  metadata: {
    title: "Navigation fixture",
    creators: [],
    contributors: [],
    entries: [],
  },
  manifest: [0, 1, 2, 3].map((index) => ({
    id: `c${index}`,
    sourceHref: `c${index}.xhtml`,
    href: `EPUB/c${index}.xhtml`,
    path: `EPUB/c${index}.xhtml`,
    remote: false,
    mediaType: "application/xhtml+xml",
    properties: [],
  })),
  spine: [0, 1, 2, 3].map((index) => ({
    index,
    idref: `c${index}`,
    itemrefId: `spine-${index}`,
    cfiBase: `/6/${(index + 1) * 2}[spine-${index}]!`,
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

const plans = publication.spine.map((item) =>
  planRendition({
    publication,
    spineItem: item,
    viewport: { width: 800, height: 600 },
    preferences: DEFAULT_READER_PREFERENCES,
  }),
);

class FakeHost implements NavigationRendererHost {
  state: RendererHostState = {
    status: "idle",
    generation: 0,
    plan: null,
    rendererKind: null,
    layout: null,
    stability: null,
    error: null,
  };
  locator: Locator | null = null;
  within: RendererNavigationResult = { status: "boundary", edge: "end" };
  navigationDelayMs = 0;
  activeNavigations = 0;
  maxConcurrentNavigations = 0;
  navigationCalls = 0;
  presentationDelayMs = 0;
  activePresentations = 0;
  maxConcurrentPresentations = 0;

  async navigateWithin(): Promise<RendererNavigationResult> {
    this.navigationCalls += 1;
    this.activeNavigations += 1;
    this.maxConcurrentNavigations = Math.max(
      this.maxConcurrentNavigations,
      this.activeNavigations,
    );
    if (this.navigationDelayMs > 0) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, this.navigationDelayMs),
      );
    }
    this.activeNavigations -= 1;
    return this.within;
  }

  async present(
    plan: RenditionPlan,
    _reason?: string,
    targetLocator?: Locator,
  ): Promise<
    import("../../core/presentation/renderer").RendererPresentationResult
  > {
    void _reason;
    this.activePresentations += 1;
    this.maxConcurrentPresentations = Math.max(
      this.maxConcurrentPresentations,
      this.activePresentations,
    );
    if (this.presentationDelayMs > 0) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, this.presentationDelayMs),
      );
    }
    this.activePresentations -= 1;
    this.locator = targetLocator ?? {
      href: plan.href,
      spineIndex: plan.spineIndex,
      locations: { progression: 0 },
    };
    this.state = {
      ...this.state,
      status: "ready",
      generation: this.state.generation + 1,
      plan,
      rendererKind: plan.renderer,
      layout: { pageCount: 1, currentPage: 1 },
    };
    return { state: this.state, locator: targetLocator ?? null };
  }

  async captureLocator(): Promise<Locator | null> {
    return this.locator;
  }
}

async function main() {
  const escaped = escapeCfiAssertion("a[b]^c,d;e(f)");
  assert(
    escaped === "a^[b^]^^c^,d^;e^(f^)",
    "CFI assertions must circumflex-escape delimiters",
  );

  const parsed = parseEpubCfi("epubcfi(/6/4[spine-1]!/4[body]/2/1:3)");
  assert(
    parsed.packagePath.steps[1]?.index === 4,
    "CFI package itemref step should parse",
  );
  assert(
    parsed.contentPath.characterOffset === 3,
    "CFI UTF-16 character offset should parse",
  );
  assert(
    serializeCfiPath(parsed.contentPath) === "/4[body]/2/1:3",
    "CFI point path should round-trip",
  );
  assert(
    resolveCfiSpineItem(publication, parsed.packagePath).index === 1,
    "CFI package path should resolve spine item",
  );

  const assertedPoint = parseEpubCfi(
    "epubcfi(/6/4[spine-1]!/4[body]/2/1:3[abc,def;s=b])",
  );
  assert(
    assertedPoint.contentPath.textAssertion?.before === "abc",
    "CFI terminal before assertion should parse",
  );
  assert(
    assertedPoint.contentPath.textAssertion?.after === "def",
    "CFI terminal after assertion should parse",
  );
  assert(
    assertedPoint.contentPath.sideBias === "before",
    "CFI side bias should parse",
  );
  assert(
    serializeCfiPath(assertedPoint.contentPath) ===
      "/4[body]/2/1:3[abc,def;s=b]",
    "CFI terminal assertion should round-trip",
  );

  const rangeAsPoint = parseEpubCfi("epubcfi(/6/4[spine-1]!/4/2,/1:1,/1:5)");
  assert(
    rangeAsPoint.contentPath.characterOffset === 1,
    "a CFI range used as a point must resolve to its start",
  );

  const correctedByAssertion = parseEpubCfi("epubcfi(/8/99[spine-2]!/4/2/1:0)");
  assert(
    resolveCfiSpineItem(publication, correctedByAssertion.packagePath).index ===
      2,
    "itemref ID assertion should recover a structurally stale package CFI",
  );

  const hrefLocator = locatorFromHref(publication, "EPUB/c2.xhtml#section-4");
  assert(
    hrefLocator.spineIndex === 2 &&
      hrefLocator.locations.fragment === "section-4",
    "href navigation should preserve fragment",
  );

  const cfiLocator = locatorFromCfi(
    publication,
    "epubcfi(/6/8[spine-3]!/4/2/1:0)",
  );
  assert(
    cfiLocator.spineIndex === 3,
    "CFI navigation target should resolve without opening content document",
  );

  const history = new ReaderNavigationHistory(2);
  const origin: Locator = {
    href: "EPUB/c0.xhtml",
    spineIndex: 0,
    locations: { progression: 0.25 },
  };
  const destination: Locator = {
    href: "EPUB/c2.xhtml",
    spineIndex: 2,
    locations: { fragment: "section-4" },
  };
  history.record(origin, destination);
  assert(
    history.snapshot.canGoBack && history.peekBack()?.spineIndex === 0,
    "branch navigation should retain its origin",
  );
  history.commitBack(destination);
  assert(
    history.snapshot.canGoForward && history.peekForward()?.spineIndex === 2,
    "going back should make the previous destination available to go forward",
  );
  history.commitForward(origin);
  history.record(destination, origin);
  assert(
    !history.snapshot.canGoForward,
    "a new branch navigation should clear forward history",
  );
  history.record({ ...origin, locations: { progression: 0.4 } }, destination);
  history.record({ ...origin, locations: { progression: 0.6 } }, destination);
  assert(
    history.snapshot.backCount === 2,
    "navigation history should enforce its configured retention limit",
  );
  assert(
    history.snapshot.back.length === 2,
    "navigation history snapshot should expose its retained Back destinations",
  );
  assert(
    history.snapshot.back.at(-1)?.locations.progression === 0.6,
    "the newest Back destination should be addressable by future history UI",
  );
  assert(
    Object.isFrozen(history.snapshot.back),
    "published history entries should be immutable snapshots",
  );

  assert(
    navigationForSide("right", "ltr") === "forward",
    "LTR right side should navigate forward",
  );
  assert(
    navigationForSide("left", "rtl") === "forward",
    "RTL left side should navigate forward",
  );

  const host = new FakeHost();
  const navigator = new ReaderNavigator(publication, host, {
    planForSpine: (index) => plans[index]!,
  });

  await host.present(plans[0]!);
  host.within = { status: "boundary", edge: "end" };
  const forward = await navigator.next();
  assert(
    forward.status === "moved" && forward.spineChanged,
    "boundary navigation should move into another spine item",
  );
  assert(
    Number(host.state.plan?.spineIndex) === 2,
    'sequential navigation should skip linear="no" item',
  );
  assert(
    Number(host.locator?.locations.progression) === 0,
    "forward cross-spine navigation should enter at resource start",
  );

  host.within = { status: "boundary", edge: "start" };
  const back = await navigator.previous();
  assert(
    back.status === "moved" && Number(host.state.plan?.spineIndex) === 0,
    "backward navigation should skip non-linear item too",
  );
  assert(
    Number(host.locator?.locations.progression) === 1,
    "backward cross-spine navigation should enter at resource end",
  );

  await navigator.goTo({ kind: "href", href: "EPUB/c3.xhtml#tail" });
  assert(
    Number(host.state.plan?.spineIndex) === 3 &&
      host.locator?.locations.fragment === "tail",
    "goTo href should present target locator atomically",
  );

  // A cross-spine spread shows two spine documents at once, so a page turn has
  // to leave both of them. Advancing to the other half instead re-composed the
  // very spread already on screen and spent the turn showing nothing new, which
  // is what made every illustration spread in a light novel cost two presses.
  // Nothing is skipped by this: both sections were on screen, and the position
  // readout names the pair.
  host.state = {
    ...host.state,
    plan: plans[2]!,
    layout: {
      spread: true,
      gap: 0,
      visibleSpineIndices: [2, 3],
      left: {
        spineIndex: 2,
        renderer: plans[2]!.renderer,
        layout: { pageCount: 1, currentPage: 1 },
      },
      right: {
        spineIndex: 3,
        renderer: plans[3]!.renderer,
        layout: { pageCount: 1, currentPage: 1 },
      },
      activeSlot: "left",
    } as RendererHostState["layout"],
  };
  host.within = { status: "boundary", edge: "end" };
  const end = await navigator.next();
  assert(
    end.status === "boundary" && end.edge === "end",
    "a turn out of the last spread must reach the publication boundary, not re-open the spread through its other half",
  );

  host.state = {
    ...host.state,
    plan: plans[2]!,
    layout: {
      spread: true,
      gap: 0,
      visibleSpineIndices: [2, 3],
      left: {
        spineIndex: 2,
        renderer: plans[2]!.renderer,
        layout: { pageCount: 1, currentPage: 1 },
      },
      right: {
        spineIndex: 3,
        renderer: plans[3]!.renderer,
        layout: { pageCount: 1, currentPage: 1 },
      },
      activeSlot: "right",
    } as RendererHostState["layout"],
  };
  host.within = { status: "boundary", edge: "end" };
  const spreadEnd = await navigator.next();
  assert(
    spreadEnd.status === "boundary" && spreadEnd.edge === "end",
    "the same holds whichever leaf of the spread is the active one",
  );

  host.state = {
    ...host.state,
    plan: plans[3]!,
    layout: { pageCount: 1, currentPage: 1 },
  };
  const publicationEnd = await navigator.next();
  assert(
    publicationEnd.status === "boundary" && publicationEnd.edge === "end",
    "cross-spine spread navigation should reach the publication boundary after the visible item",
  );

  // Backwards obeys the same rule, measured from the near edge of what is on
  // screen: out of the spread showing 2 and 3, Previous leaves both behind and
  // lands on 0, because 1 is linear="no" and stays skipped.
  host.state = {
    ...host.state,
    plan: plans[3]!,
    layout: {
      spread: true,
      gap: 0,
      visibleSpineIndices: [2, 3],
      left: {
        spineIndex: 2,
        renderer: plans[2]!.renderer,
        layout: { pageCount: 1, currentPage: 1 },
      },
      right: {
        spineIndex: 3,
        renderer: plans[3]!.renderer,
        layout: { pageCount: 1, currentPage: 1 },
      },
      activeSlot: "right",
    } as RendererHostState["layout"],
  };
  host.within = { status: "boundary", edge: "start" };
  const spreadBack = await navigator.previous();
  assert(
    spreadBack.status === "moved" && host.state.plan?.spineIndex === 0,
    "a turn out of a spread must clear every section it was showing",
  );

  // Discrete user navigation is ordered rather than latest-wins. If two rapid
  // inputs overlapped here, a renderer could observe the same starting page
  // twice and effectively drop one of the requested turns.
  host.state = {
    ...host.state,
    plan: plans[0]!,
    layout: { pageCount: 4, currentPage: 1 },
  };
  host.within = { status: "moved", layout: { pageCount: 4, currentPage: 2 } };
  host.navigationDelayMs = 5;
  host.navigationCalls = 0;
  host.maxConcurrentNavigations = 0;
  await Promise.all([navigator.next(), navigator.next()]);
  assert(
    host.navigationCalls === 2,
    "two rapid next inputs should execute as two navigation operations",
  );
  assert(
    host.maxConcurrentNavigations === 1,
    "publication navigation operations must be serialized",
  );

  // Relayout must wait for an in-flight cross-spine navigation. Reading the
  // committed host plan while that navigation is rendering yields the old
  // spine; presenting it as a resize would supersede and lose the destination.
  host.state = {
    ...host.state,
    plan: plans[0]!,
    layout: { pageCount: 1, currentPage: 1 },
  };
  host.presentationDelayMs = 5;
  host.maxConcurrentPresentations = 0;
  await Promise.all([
    navigator.goToLocator({
      href: publication.spine[2]!.href,
      spineIndex: 2,
      locations: { progression: 0 },
    }),
    navigator.relayout("viewport-resize"),
  ]);
  assert(
    host.maxConcurrentPresentations === 1,
    "relayout must not overlap publication navigation",
  );
  assert(
    host.state.plan?.spineIndex === 2,
    "relayout after navigation must preserve the destination spine",
  );

  const external: import("../../core/interaction/navigation").ExternalLinkTarget[] =
    [];
  const blocked: string[] = [];
  let clickListener: ((event: Event) => void) | null = null;
  const linkDocument = {
    addEventListener(type: string, listener: (event: Event) => void) {
      if (type === "click") clickListener = listener;
    },
    removeEventListener() {},
  } as unknown as Document;
  const linkRouter = new PublicationLinkRouter(publication, navigator, {
    onExternalLink: (href) => external.push(href),
    onUnresolvedPublicationLink: (href) => blocked.push(href),
  });
  linkRouter.syncDocuments([
    {
      spineIndex: 0,
      href: publication.spine[0]!.href,
      document: linkDocument,
      surfaceElement: {} as HTMLElement,
    },
  ]);
  const click = (href: string) => {
    const anchor = {
      nodeType: 1,
      textContent: "",
      closest: () => anchor,
      getAttribute: (name: string) => (name === "data-epub-href" ? href : null),
    } as unknown as Element;
    clickListener?.({
      target: anchor,
      preventDefault() {},
    } as unknown as Event);
  };
  click("https://example.com/book");
  click("javascript:alert(1)");
  assert(
    external.length === 1 &&
      external[0]?.href === "https://example.com/book" &&
      external[0].kind === "website",
    "HTTP links should reach the explicit host callback as approved targets",
  );
  assert(
    blocked.length === 1 && blocked[0] === "javascript:alert(1)",
    "executable and unsupported schemes must never reach the external-link callback",
  );
  linkRouter.dispose();

  console.log("Navigation and locator unit test: PASS");
}

void main();
