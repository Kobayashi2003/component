import {
  BUILT_IN_READER_INPUT_BINDINGS,
  commandForClickZone,
  commandForKey,
  commandForPageClick,
  commandForSwipe,
  commandForWheel,
  isInteractivePublicationTarget,
  ReaderInputBindingRegistry,
  ReaderInputController,
  touchNavigationAllows,
} from "../../core/interaction/input";
import { BrowserReaderInputRouter } from "../../core/interaction/input/browser-input-router";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(
    commandForKey({ key: "ArrowRight" }, "ltr")?.type === "navigate",
    "keyboard arrows should map to semantic navigation",
  );
  const rtlRight = commandForKey({ key: "ArrowRight" }, "rtl");
  assert(
    rtlRight?.type === "navigate" && rtlRight.direction === "backward",
    "RTL physical-right key should navigate backward",
  );
  assert(
    commandForKey({ key: "f", ctrlKey: true }, "ltr")?.type === "open-search",
    "Ctrl/Cmd+F should route to reader search",
  );
  assert(
    commandForKey({ key: "ArrowLeft", altKey: true }, "ltr")?.type ===
      "history-back",
    "Alt+Left should route to reading history",
  );
  assert(
    commandForKey({ key: "ArrowRight", altKey: true }, "rtl")?.type ===
      "history-forward",
    "Alt+Right history should remain physical in RTL books",
  );
  assert(
    commandForKey({ key: "c" }, "ltr")?.type === "toggle-chrome",
    "C should toggle immersive reader controls",
  );
  assert(
    commandForKey({ key: "?" }, "ltr")?.type === "open-help",
    "question mark should expose keyboard help",
  );
  const configurableInput = new ReaderInputBindingRegistry([
    {
      id: "test.invalid-key-source",
      priority: 20,
      kinds: ["keyboard"],
      map: (signal) =>
        signal.kind === "keyboard" && signal.key === "ArrowRight"
          ? { type: "navigate", direction: "forward", source: "wheel" }
          : null,
    },
    {
      id: "test.vim-navigation",
      priority: 10,
      kinds: ["keyboard"],
      shortcuts: [
        { label: "Navigation", items: [{ keys: ["J"], action: "Next page" }] },
      ],
      map: (signal) =>
        signal.kind === "keyboard" && signal.key.toLowerCase() === "j"
          ? { type: "navigate", direction: "forward", source: "keyboard" }
          : null,
    },
    ...BUILT_IN_READER_INPUT_BINDINGS,
  ]).createMap();
  const customKey = configurableInput.resolve(
    { kind: "keyboard", key: "j" },
    {
      enabled: true,
      pageProgression: "ltr",
      contentKind: "reflowable",
      presentation: "paginated",
      wheelBoundaryNavigation: false,
    },
  );
  assert(
    customKey.command?.type === "navigate" &&
      customKey.command.direction === "forward",
    "a higher-priority input binding must be able to add a semantic shortcut",
  );
  const isolatedInvalid = configurableInput.resolve(
    { kind: "keyboard", key: "ArrowRight" },
    {
      enabled: true,
      pageProgression: "ltr",
      contentKind: "reflowable",
      presentation: "paginated",
      wheelBoundaryNavigation: false,
    },
  );
  assert(
    isolatedInvalid.command?.type === "navigate" &&
      isolatedInvalid.failures.length === 1,
    "an invalid contributed command must be isolated before the default binding handles the signal",
  );
  assert(
    configurableInput.description.shortcutGroups.some((group) =>
      group.items.some((item) => item.keys.includes("J")),
    ),
    "input help must be derived from the active binding map",
  );
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
      get tabIndex() {
        return tabIndex ?? -0;
      },
      set tabIndex(value: number) {
        tabIndex = value;
        attributes.add("tabindex");
      },
      hasAttribute: (name: string) => attributes.has(name),
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), handler]);
      },
      removeEventListener: () => {},
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
      }),
      contains: () => true,
    } as unknown as HTMLElement;

    const dispatched: string[] = [];
    const router = new BrowserReaderInputRouter(
      host,
      () => ({
        enabled: true,
        pageProgression: "ltr",
        contentKind: "reflowable",
        presentation: "paginated",
        wheelBoundaryNavigation: false,
        touchNavigation: "both",
        pageTurnZonePercent: 30,
      }),
      {
        dispatch: (command: { type: string; direction?: string }) => {
          dispatched.push(`${command.type}:${command.direction ?? ""}`);
        },
      } as never,
    );

    assert(
      tabIndex === -1,
      "the router must make its own host element focusable",
    );
    const keydown = listeners.get("keydown")?.[0];
    assert(
      keydown,
      "the router must listen for keys on the element it was given",
    );
    keydown!({
      key: "ArrowRight",
      target: host,
      preventDefault: () => {},
      stopPropagation: () => {},
    });
    assert(
      dispatched.includes("navigate:forward"),
      "a key on the router host must reach the dispatcher",
    );
    const click = listeners.get("click")?.[0];
    assert(click, "the router must listen for clicks on the reading surface");
    click!({
      button: 0,
      clientX: 400,
      target: host,
      cancelable: true,
      preventDefault: () => {},
    });
    assert(
      dispatched.includes("toggle-chrome:"),
      "a center click must toggle reader controls",
    );
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
      localName: "div",
      style: {},
      parentElement: null,
      scrollTop: 0,
      scrollHeight: 600,
      clientHeight: 600,
      get tabIndex() {
        return tabIndex ?? -0;
      },
      set tabIndex(value: number) {
        tabIndex = value;
        attributes.add("tabindex");
      },
      hasAttribute: (name: string) => attributes.has(name),
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), handler]);
      },
      removeEventListener: () => {},
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
      }),
      contains: () => true,
    } as unknown as HTMLElement;
    let presentation: "paginated" | "scrolled" = "paginated";
    let contentKind: "reflowable" | "fixed-layout" = "reflowable";
    let wheelBoundaryNavigation = false;
    const dispatched: string[] = [];
    const router = new BrowserReaderInputRouter(
      host,
      () => ({
        enabled: true,
        pageProgression: "ltr",
        contentKind,
        presentation,
        wheelBoundaryNavigation,
        touchNavigation: "both",
        pageTurnZonePercent: 30,
      }),
      {
        dispatch: (command: { type: string; direction?: string }) => {
          dispatched.push(`${command.type}:${command.direction ?? ""}`);
        },
      } as never,
    );
    const wheel = listeners.get("wheel")?.[0];
    assert(wheel, "the router must listen for wheel input");
    const prevented: number[] = [];
    const preventedCount = () => prevented.length;
    const fire = (deltaY: number, target: EventTarget = host) =>
      wheel!({
        deltaY,
        deltaMode: 0,
        target,
        cancelable: true,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => {
          prevented.push(deltaY);
        },
      });

    fire(30);
    assert(
      dispatched.length === 1 && preventedCount() === 1,
      `the first paginated wheel gesture must turn one page and claim native scrolling (dispatched ${dispatched.length}, prevented ${preventedCount()})`,
    );
    fire(30);
    assert(
      dispatched.length === 1 && preventedCount() === 2,
      "a cooldown-suppressed wheel event must still be claimed by paginated mode",
    );
    fire(5);
    assert(
      dispatched.length === 1 && preventedCount() === 3,
      "a sub-threshold wheel event must not leak into the paginated scrolling element",
    );

    const nestedDocument = {
      defaultView: { getComputedStyle: () => ({ overflowY: "auto" }) },
    };
    const nested = {
      nodeType: 1,
      localName: "div",
      parentElement: host,
      ownerDocument: nestedDocument,
      scrollTop: 20,
      scrollHeight: 300,
      clientHeight: 100,
    } as unknown as HTMLElement;
    fire(30, nested);
    assert(
      nested.scrollTop === 50,
      "a nested publication overflow region must consume wheel movement before page navigation",
    );
    assert(
      dispatched.length === 1 && preventedCount() === 4,
      "nested scrolling must not also dispatch a page turn",
    );

    presentation = "scrolled";
    Object.defineProperty(host, "ownerDocument", {
      value: {
        scrollingElement: host,
        defaultView: { getComputedStyle: () => ({ overflowY: "auto" }) },
      },
    });
    fire(30);
    assert(
      dispatched.length === 1 && preventedCount() === 5,
      "a scrolled rendition must claim wheel input instead of leaking it to the host page",
    );

    // Fixed-layout cover/width fitting scrolls a host-realm container outside
    // the content iframe. Wheel events originate in the iframe document, so the
    // router has to cross from its surface element to that outer owner without
    // relying on same-realm HTMLElement identity.
    presentation = "paginated";
    contentKind = "fixed-layout";
    wheelBoundaryNavigation = true;
    const outerDocument = {
      defaultView: { getComputedStyle: () => ({ overflowY: "auto" }) },
    };
    const outer = {
      nodeType: 1,
      localName: "div",
      parentElement: null,
      ownerDocument: outerDocument,
      scrollTop: 40,
      scrollHeight: 500,
      clientHeight: 200,
    } as unknown as HTMLElement;
    const surface = {
      nodeType: 1,
      localName: "iframe",
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
      localName: "html",
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
        contentListeners.set(type, [
          ...(contentListeners.get(type) ?? []),
          handler,
        ]);
      },
      removeEventListener: () => {},
    } as unknown as Document;
    Object.defineProperty(contentRoot, "ownerDocument", {
      value: contentDocument,
    });
    router.syncDocuments([
      {
        spineIndex: 0,
        href: "page.xhtml",
        document: contentDocument,
        surfaceElement: surface,
      },
    ]);
    const contentWheel = contentListeners.get("wheel")?.[0];
    assert(
      contentWheel,
      "the router must listen for wheel input inside a content document",
    );
    const fireContentWheel = () =>
      contentWheel!({
        deltaY: 30,
        deltaMode: 0,
        target: contentRoot,
        cancelable: true,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => {
          prevented.push(30);
        },
      });
    presentation = "scrolled";
    contentKind = "reflowable";
    wheelBoundaryNavigation = false;
    fireContentWheel();
    assert(
      contentRoot.scrollTop === 30,
      "a scrolled rendition must continue from nested content onto its document scrolling element",
    );
    assert(
      preventedCount() === 6,
      "scrolled document movement must remain contained by the reader",
    );

    presentation = "paginated";
    contentKind = "fixed-layout";
    wheelBoundaryNavigation = true;
    fireContentWheel();
    assert(
      outer.scrollTop === 70,
      "a fixed-layout host container must scroll before wheel input turns the page at its boundary",
    );
    assert(
      dispatched.length === 1 && preventedCount() === 7,
      "fixed-layout canvas scrolling must consume the gesture without a page turn",
    );
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
    const stubElement = (localName: string) =>
      ({
        nodeType: 1,
        localName,
        hasAttribute: () => false,
      }) as unknown as HTMLElement;
    const body = stubElement("body");
    const documentElement = stubElement("html");
    let activeElement: unknown = body;
    let focusCalls = 0;
    const attributes = new Set<string>();
    let tabIndex: number | undefined;
    const owner = {
      body,
      documentElement,
      get activeElement() {
        return activeElement;
      },
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        documentListeners.set(type, [
          ...(documentListeners.get(type) ?? []),
          handler,
        ]);
      },
      removeEventListener: () => {},
    };
    const host = {
      style: {},
      ownerDocument: owner,
      get tabIndex() {
        return tabIndex ?? -0;
      },
      set tabIndex(value: number) {
        tabIndex = value;
        attributes.add("tabindex");
      },
      hasAttribute: (name: string) => attributes.has(name),
      focus: () => {
        focusCalls += 1;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
      }),
      contains: () => true,
    } as unknown as HTMLElement;

    const dispatched: string[] = [];
    const router = new BrowserReaderInputRouter(
      host,
      () => ({
        enabled: true,
        pageProgression: "ltr",
        contentKind: "reflowable",
        presentation: "paginated",
        wheelBoundaryNavigation: false,
        touchNavigation: "both",
        pageTurnZonePercent: 30,
      }),
      {
        dispatch: (command: { type: string; direction?: string }) => {
          dispatched.push(`${command.type}:${command.direction ?? ""}`);
        },
      } as never,
    );

    const documentKeydown = documentListeners.get("keydown")?.[0];
    assert(
      documentKeydown,
      "the router must keep a document-level fallback for abandoned focus",
    );

    documentKeydown!({
      key: "ArrowRight",
      target: body,
      preventDefault: () => {},
      stopPropagation: () => {},
    });
    assert(
      dispatched.length === 1,
      `a key pressed while focus sits on the body must still turn the page, got ${dispatched.length}`,
    );
    assert(
      focusCalls > 0,
      "the router must take focus back once it handles a key nobody else could",
    );

    // Something owns focus now, so the event reaches it through its own listener
    // and the fallback has to stay out of the way.
    activeElement = stubElement("button");
    documentKeydown!({
      key: "ArrowRight",
      target: activeElement,
      preventDefault: () => {},
      stopPropagation: () => {},
    });
    assert(
      dispatched.length === 1,
      "the fallback must not double-handle a key an element already owns",
    );
    router.dispose();
  }

  assert(
    commandForWheel(50, false)?.type === "navigate",
    "plain wheel should emit semantic navigation",
  );
  const fontWheel = commandForWheel(-50, true);
  assert(
    fontWheel?.type === "font-step" && fontWheel.delta === 1,
    "modified wheel should emit font-size command",
  );
  const leftClick = commandForClickZone(5, 100, 0.2, "rtl");
  assert(
    leftClick?.type === "navigate" && leftClick.direction === "forward",
    "RTL left click-zone should move forward",
  );
  assert(
    commandForPageClick(50, 100, 0.2, "ltr", true)?.type === "toggle-chrome",
    "the center page zone should toggle reader controls",
  );
  assert(
    commandForPageClick(5, 100, 0.2, "ltr", false) == null,
    "a disabled edge zone must not become a controls gesture",
  );
  assert(
    commandForPageClick(50, 100, 0.2, "ltr", false)?.type === "toggle-chrome",
    "disabling tap navigation should retain the center control gesture",
  );
  const swipeLeft = commandForSwipe(-100, 40, "ltr");
  assert(
    swipeLeft?.type === "navigate" && swipeLeft.direction === "forward",
    "LTR swipe-left should reveal the next page",
  );
  assert(
    touchNavigationAllows("both", "tap") &&
      touchNavigationAllows("both", "swipe"),
    "combined touch mode should allow both gestures",
  );
  assert(
    touchNavigationAllows("tap", "tap") &&
      !touchNavigationAllows("tap", "swipe"),
    "tap-only mode should reject swipes",
  );
  assert(
    !touchNavigationAllows("off", "tap") &&
      !touchNavigationAllows("off", "swipe"),
    "disabled touch mode should reject pointer gestures",
  );
  const mediaTarget = {
    nodeType: 1,
    closest: (selector: string) => (selector.includes("audio") ? {} : null),
  } as unknown as EventTarget;
  const imageViewerTarget = {
    nodeType: 1,
    closest: (selector: string) =>
      selector.includes("[data-epub-image-viewer]") ? {} : null,
  } as unknown as EventTarget;
  assert(
    isInteractivePublicationTarget(mediaTarget),
    "native publication media controls must not trigger page-turn zones",
  );
  assert(
    isInteractivePublicationTarget(imageViewerTarget),
    "images enhanced with the viewer must not trigger page-turn zones",
  );

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
      async next() {
        next += 1;
        return { status: "boundary", edge: "end" } as const;
      },
      async previous() {
        previous += 1;
        return { status: "boundary", edge: "start" } as const;
      },
    },
    navigationResult(result) {
      if (result.status === "boundary") boundaries.push(result.edge);
    },
    hostCommand(command) {
      if (command.type === "open-search") searchOpen += 1;
      else if (command.type === "open-help") helpOpen += 1;
      else if (command.type === "toggle-chrome") chromeToggles += 1;
    },
    historyBack() {
      historyBack += 1;
    },
    historyForward() {
      historyForward += 1;
    },
    stepFont(delta) {
      font += delta;
    },
  });
  await input.dispatch({
    type: "navigate",
    direction: "forward",
    source: "keyboard",
  });
  await input.dispatch({
    type: "navigate",
    direction: "backward",
    source: "keyboard",
  });
  await input.dispatch({ type: "open-search", source: "keyboard" });
  await input.dispatch({ type: "open-help", source: "keyboard" });
  await input.dispatch({ type: "history-back", source: "keyboard" });
  await input.dispatch({ type: "history-forward", source: "keyboard" });
  await input.dispatch({ type: "toggle-chrome", source: "keyboard" });
  await input.dispatch({ type: "font-step", delta: 1, source: "wheel" });
  assert(
    next === 1 &&
      previous === 1 &&
      searchOpen === 1 &&
      helpOpen === 1 &&
      historyBack === 1 &&
      historyForward === 1 &&
      chromeToggles === 1 &&
      font === 1,
    "input controller must route commands without touching renderer APIs",
  );
  assert(
    boundaries.join(",") === "end,start",
    "input controller should expose navigation boundary results to host feedback",
  );

  console.log("Reader input unit test: PASS");
}

void main();
