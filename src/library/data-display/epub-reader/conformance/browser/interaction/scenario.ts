import mixedFixtureUrl from "../../../fixtures/corpus/mixed-layout.epub?url";
import verticalFixtureUrl from "../../../fixtures/corpus/vertical-ruby.epub?url";
import {
  resolveCompositeLocator,
  resolveLocatorRangeInDocument,
} from "../../../core";
import { getActiveReader } from "./configuration";
import {
  assert,
  buttonWithLabel,
  buttonWithText,
  chooseFile,
  click,
  delay,
  dispatchKey,
  fixedSpreadFacingGap,
  required,
  setInputValue,
  waitFor,
  waitForPage,
  waitForPanel,
} from "./harness";

export async function runBrowserInteractionScenario(): Promise<
  readonly string[]
> {
  const steps: string[] = [];
  const fixtureResponse = await fetch(verticalFixtureUrl);
  assert(
    fixtureResponse.ok,
    `fixture request failed with ${fixtureResponse.status}`,
  );
  const fixture = new File(
    [await fixtureResponse.arrayBuffer()],
    "vertical-ruby.epub",
    { type: "application/epub+zip" },
  );

  await chooseFile(fixture);
  const initial = await waitForPage(
    (position) => position.total > 1 && position.current > 0,
    "multi-page publication to become ready",
  );
  steps.push(`opened vertical EPUB at ${initial.current}/${initial.total}`);

  const configuredShell = required<HTMLElement>(".epub-reader-shell");
  const settingsIconPath =
    buttonWithLabel("Reader settings").querySelector<SVGGraphicsElement>(
      "svg path",
    );
  assert(settingsIconPath, "reader settings button must render its icon path");
  const settingsIconBounds = settingsIconPath.getBBox();
  assert(
    Math.abs(settingsIconBounds.y + settingsIconBounds.height / 2 - 12) <= 0.25,
    "reader settings icon artwork must be vertically centered in its viewBox",
  );
  assert(
    configuredShell.dataset.layout === "wide",
    "the default configured breakpoint should select wide layout at harness width",
  );
  assert(
    configuredShell.dataset.density === "comfortable",
    "the default configured density must reach the Shell",
  );
  assert(
    configuredShell.dataset.motion === "system",
    "the default configured motion policy must reach the Shell",
  );
  assert(
    configuredShell.style.getPropertyValue("--epub-panel-width") === "392px",
    "the custom panel width must reach the Shell token",
  );
  configuredShell.style.width = "710px";
  await waitFor(
    () => configuredShell.dataset.layout === "compact",
    "configured compact layout after reader resize",
  );
  click(buttonWithLabel("More reader tools"));
  const compactTools = await waitFor(
    () =>
      document.querySelector<HTMLElement>(".epub-reader-shell__tools-menu"),
    "compact tools menu",
  );
  buttonWithText(compactTools, "Bookmark page");
  click(buttonWithLabel("More reader tools"));
  configuredShell.style.width = "";
  await waitFor(
    () => configuredShell.dataset.layout === "wide",
    "wide layout after reader resize restoration",
  );
  const beforeTurn = await waitForPage(
    (position) => position.total > 1 && position.current > 0,
    "reader to settle after layout restoration",
  );
  steps.push(
    "validated Reader UI layout, density, motion, and panel-width configuration",
  );

  click(required<HTMLButtonElement>(".epub-reader-controls__nav--next"));
  const advanced = await waitForPage(
    (position) => position.current !== beforeTurn.current,
    "next-page click to update position",
  );
  steps.push(`next-page click moved to ${advanced.current}/${advanced.total}`);

  await delay(500);
  click(buttonWithLabel("Close book"));
  await waitFor(
    () => document.querySelector<HTMLInputElement>(".epub-file-picker__input"),
    "empty file picker after closing",
  );
  await chooseFile(fixture);
  const restored = await waitForPage(
    (position) => position.current === advanced.current,
    "saved reading position to restore",
  );
  steps.push(`reading session restored ${restored.current}/${restored.total}`);

  const contentFrame = await waitFor(
    () =>
      document.querySelector<HTMLIFrameElement>("iframe[data-epub-surface-id]"),
    "EPUB content frame",
  );
  const contentDocument = contentFrame.contentDocument;
  assert(
    contentDocument?.body,
    "EPUB content document must remain same-origin",
  );
  const activeShell = required<HTMLElement>(".epub-reader-shell");
  const contentWindow = contentDocument.defaultView!;
  const scrolling = contentDocument.scrollingElement as HTMLElement;
  const lockedScrollTop = scrolling.scrollTop;
  const lockedScrollLeft = scrolling.scrollLeft;
  contentDocument.dispatchEvent(
    new contentWindow.PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      buttons: 1,
      isPrimary: true,
    }),
  );
  contentDocument.dispatchEvent(
    new contentWindow.Event("selectstart", { bubbles: true, cancelable: true }),
  );
  scrolling.scrollTop = lockedScrollTop + contentWindow.innerHeight;
  scrolling.scrollLeft = lockedScrollLeft + contentWindow.innerWidth;
  contentDocument.dispatchEvent(new contentWindow.Event("scroll"));
  assert(
    scrolling.scrollTop === lockedScrollTop &&
      scrolling.scrollLeft === lockedScrollLeft,
    "drag selection must not use paginated overflow to cross a page boundary",
  );
  contentDocument.dispatchEvent(
    new contentWindow.PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
      buttons: 0,
      isPrimary: true,
    }),
  );
  steps.push("paginated drag selection stayed inside the current page");

  for (const chromeRegion of activeShell.querySelectorAll(
    ".epub-reader-shell__toolbar, .epub-reader-controls",
  )) {
    chromeRegion.dispatchEvent(
      new PointerEvent("pointerleave", { pointerType: "mouse" }),
    );
  }
  contentDocument.body.dispatchEvent(
    new contentWindow.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: contentWindow.innerWidth / 2,
    }),
  );
  await waitFor(
    () => activeShell.classList.contains("is-chrome-hidden"),
    "reader chrome to auto-hide before text selection",
  );
  const selectableText = firstVisibleText(contentDocument);
  assert(selectableText, "selection fixture needs visible publication text");
  const nativeRange = contentDocument.createRange();
  nativeRange.setStart(selectableText, 0);
  nativeRange.setEnd(selectableText, Math.min(4, selectableText.length));
  const nativeSelection = contentWindow.getSelection();
  nativeSelection?.removeAllRanges();
  nativeSelection?.addRange(nativeRange);
  contentDocument.dispatchEvent(new contentWindow.Event("selectionchange"));
  await waitFor(
    () => document.querySelector(".epub-reader-selection-tool"),
    "selection action toolbar",
  );
  assert(
    activeShell.classList.contains("is-chrome-hidden"),
    "text selection actions must not reveal the top or bottom reader chrome",
  );
  nativeSelection?.removeAllRanges();
  contentDocument.dispatchEvent(new contentWindow.Event("selectionchange"));
  await waitFor(
    () => !document.querySelector(".epub-reader-selection-tool"),
    "selection action toolbar to close",
  );
  steps.push("text selection actions left edge chrome hidden");

  const externalTrigger = contentDocument.createElement("a");
  externalTrigger.href = "#external-fixture";
  externalTrigger.dataset.epubHref =
    "https://example.com/reader?from=epub#fixture";
  externalTrigger.textContent = "External fixture";
  contentDocument.body.appendChild(externalTrigger);
  externalTrigger.focus();
  externalTrigger.click();
  const externalDialog = await waitFor(
    () => document.querySelector<HTMLElement>(".epub-reader-external-link"),
    "external-link confirmation dialog",
  );
  const externalAction =
    externalDialog.querySelector<HTMLAnchorElement>("a[href]");
  assert(
    externalAction?.getAttribute("href") ===
      "https://example.com/reader?from=epub#fixture",
    "external action should retain the routed URL",
  );
  assert(
    externalAction.target === "_blank",
    "website action should open a new tab",
  );
  assert(
    externalAction.relList.contains("noopener") &&
      externalAction.relList.contains("noreferrer"),
    "website action should isolate the new tab",
  );
  assert(
    externalDialog.querySelector(
      '[aria-label="Configured external explanation"]',
    )?.textContent === "Approved website destination.",
    "configured Surface Renderer must replace only the external-link explanation content",
  );
  assert(
    document.activeElement === externalDialog.querySelector("footer button"),
    "external dialog should initially focus the safe Cancel action",
  );
  assert(
    required<HTMLElement>(".epub-reader-shell__body").inert,
    "external dialog should isolate reader content",
  );
  click(
    required<HTMLButtonElement>(".epub-reader-external-link footer button"),
  );
  await waitFor(
    () => !document.querySelector(".epub-reader-external-link"),
    "external-link dialog to close",
  );
  await waitFor(
    () => document.activeElement === contentFrame,
    "external-link cancellation to restore content-frame focus",
  );
  assert(
    !required<HTMLElement>(".epub-reader-shell__body").inert,
    "reader content should be interactive after cancellation",
  );
  steps.push(
    "external website required confirmation and restored reading focus",
  );

  const contentsButton = buttonWithLabel("Contents");
  click(contentsButton);
  const contentsPanel = await waitForPanel("Contents");
  assert(
    contentsButton.getAttribute("aria-expanded") === "true",
    "open panel trigger must expose its expanded state",
  );
  assert(
    contentsButton.getAttribute("aria-controls") === contentsPanel.id,
    "panel trigger and surface must share an ARIA relationship",
  );
  assert(
    contentsPanel.querySelectorAll('.epub-contents__tabs [role="tab"]')
      .length === 4,
    "publication navigation must expose Contents, Pages, Landmarks, and History views",
  );
  assert(
    contentsPanel.querySelector('.epub-contents__link[aria-current="location"]')
      ?.textContent === "縦書き",
    "contents must synchronize the current chapter",
  );
  click(
    required<HTMLButtonElement>(
      'button[aria-controls="epub-navigation-pages"]',
    ),
  );
  await waitFor(
    () =>
      contentsPanel.querySelectorAll(
        "#epub-navigation-pages .epub-contents__entries li",
      ).length === 1,
    "EPUB page-list entries in navigation",
  );
  click(
    required<HTMLButtonElement>(
      'button[aria-controls="epub-navigation-landmarks"]',
    ),
  );
  await waitFor(
    () =>
      contentsPanel.querySelector(
        "#epub-navigation-landmarks .epub-contents__entries strong",
      )?.textContent === "本文開始",
    "authored EPUB landmark label",
  );
  click(
    required<HTMLButtonElement>(
      'button[aria-controls="epub-navigation-contents"]',
    ),
  );
  await waitFor(
    () => contentsPanel.querySelector("#epub-navigation-contents"),
    "contents tab panel",
  );
  click(buttonWithLabel("Collapse 補足"));
  await waitFor(
    () =>
      document
        .querySelector('button[aria-label="Expand 補足"]')
        ?.getAttribute("aria-expanded") === "false",
    "non-current TOC branch to collapse",
  );
  const searchButton = buttonWithLabel("Search");
  click(searchButton);
  const searchPanel = await waitForPanel("Search");
  assert(
    document.querySelectorAll(".epub-reader-shell__panel").length === 1,
    "switching tools must retain exactly one panel surface",
  );
  assert(
    contentsButton.getAttribute("aria-expanded") === "false" &&
      searchButton.getAttribute("aria-expanded") === "true",
    "switching tools must transfer expanded state",
  );
  click(contentsButton);
  const reopenedContentsPanel = await waitForPanel("Contents");
  assert(
    reopenedContentsPanel
      .querySelector('button[aria-label="Expand 補足"]')
      ?.getAttribute("aria-expanded") === "false",
    "TOC collapse state must survive panel remounting",
  );
  click(searchButton);
  await waitForPanel("Search");
  dispatchKey(document.activeElement ?? required(".epub-reader-shell"), {
    key: "Escape",
    code: "Escape",
  });
  await waitFor(
    () => !document.querySelector(".epub-reader-shell__panel"),
    "search panel to close with Escape",
  );
  await waitFor(
    () => document.activeElement === searchButton,
    "closing Search with Escape to restore its trigger focus",
  );
  assert(
    searchPanel.id === contentsPanel.id,
    "tool changes must reuse the single shell-owned panel host",
  );
  steps.push("panel switching remained exclusive and restored trigger focus");

  const statisticsButton = buttonWithLabel("Reading statistics");
  click(statisticsButton);
  const statisticsPanel = await waitForPanel("Reading statistics");
  assert(
    statisticsPanel
      .querySelector('[aria-label="Registered reading statistics"]')
      ?.textContent?.trim() === "Vertical Ruby Fixture",
    "a registered peer tool must receive the active reader and render inside the Shell panel",
  );
  dispatchKey(document.activeElement ?? statisticsPanel, {
    key: "Escape",
    code: "Escape",
  });
  await waitFor(
    () => !document.querySelector(".epub-reader-shell__panel"),
    "registered tool panel to close",
  );
  await waitFor(
    () => document.activeElement === statisticsButton,
    "registered tool to restore its trigger focus",
  );
  steps.push("registered peer tool rendered in the fixed Shell lifecycle");

  const markReader = getActiveReader();
  const markLocator = markReader?.state.reader?.locator;
  assert(
    markReader && markLocator,
    "registered tool must expose a reader position for mark editing",
  );
  const boundaryContainer = selectableText.parentNode;
  assert(
    boundaryContainer?.nodeType === 1,
    "element-boundary selection fixture requires a text container",
  );
  const boundaryRange = contentDocument.createRange();
  boundaryRange.selectNodeContents(boundaryContainer);
  nativeSelection?.removeAllRanges();
  nativeSelection?.addRange(boundaryRange);
  contentDocument.dispatchEvent(new contentWindow.Event("selectionchange"));
  await waitFor(
    () => document.querySelector(".epub-reader-selection-tool"),
    "element-boundary selection toolbar",
  );
  const boundarySelection = markReader.captureSelection();
  assert(boundarySelection, "element-boundary selection must be captured");
  const resolvedBoundaryRange = resolveLocatorRangeInDocument(
    {
      spineIndex: boundarySelection.range.start.spineIndex,
      href: boundarySelection.range.start.href,
      document: contentDocument,
      surfaceElement: contentFrame,
    },
    markReader.state.reader!.publication,
    boundarySelection.range,
  );
  assert(
    resolvedBoundaryRange?.startContainer.nodeType === 3 &&
      resolvedBoundaryRange.endContainer.nodeType === 3,
    "element-boundary selections must persist as precise text endpoints",
  );
  markReader.clearSelection();
  await waitFor(
    () => !document.querySelector(".epub-reader-selection-tool"),
    "element-boundary selection toolbar to close",
  );
  const locatorDocument =
    document.implementation.createHTMLDocument("locator recovery");
  locatorDocument.body.innerHTML =
    '<section id="coarse"><p>Alpha prefix precise target words omega suffix.</p></section>';
  const locatorItem = markReader.state.reader?.publication.spine[0];
  assert(locatorItem, "locator fixture needs the first reading-order item");
  const recovered = resolveCompositeLocator(
    locatorDocument,
    markReader.state.reader!.publication,
    locatorItem.index,
    {
      href: locatorItem.href,
      spineIndex: locatorItem.index,
      locations: { cfi: "invalid-cfi", fragment: "coarse", progression: 0.5 },
      text: {
        before: "Alpha prefix ",
        highlight: "precise target words",
        after: " omega suffix.",
      },
    },
  );
  assert(
    recovered.method === "text-quote",
    "precise text recovery must run before a coarse ancestor fragment",
  );
  assert(
    recovered.point?.node.nodeValue?.slice(
      recovered.point.offset,
      recovered.point.offset + 20,
    ) === "precise target words",
    "text recovery must preserve the exact character position",
  );
  assert(
    recovered.locator.locations.cfi?.startsWith("epubcfi("),
    "fallback recovery must replace an invalid CFI with a healed one",
  );
  steps.push("composite locator preferred and healed its precise fallback");
  const markHits = await markReader.search.run("吾輩");
  const markHit = markHits.at(-1);
  assert(markHit, "mark popover fixture needs a visible text range");
  await markReader.search.goTo(markHits.length - 1);
  const broadHighlight = markReader.marks.addHighlight(
    {
      start: markHits[0]!.range.start,
      end: markHit.range.end,
    },
    "solid",
    "orange",
    "Vertical multicolumn fixture",
  );
  const broadHighlightBoxes = await waitFor(
    () => {
      const boxes = Array.from(
        contentDocument.querySelectorAll<HTMLElement>(
          `[data-epub-decoration-id="${broadHighlight.id}"]`,
        ),
      );
      return boxes.length > 3 ? boxes : null;
    },
    "vertical multicolumn highlight fragments",
  );
  assert(
    broadHighlightBoxes.every((box) => {
      const bounds = box.getBoundingClientRect();
      return (
        bounds.width < contentWindow.innerWidth * 0.25 ||
        bounds.height < contentWindow.innerHeight * 0.25
      );
    }),
    "vertical highlights must paint glyph fragments without a cross-column slab",
  );
  markReader.marks.remove(broadHighlight.id);
  await waitFor(
    () =>
      !contentDocument.querySelector(
        `[data-epub-decoration-id="${broadHighlight.id}"]`,
      ),
    "multicolumn highlight fixture cleanup",
  );
  const fixtureHighlight = markReader.marks.addHighlight(
    markHit.range,
    "solid",
    "yellow",
    "Fixture highlight passage repeated to verify that a long saved selection preview is clamped cleanly without clipping its lower line or changing its vertical inset.",
  );
  markReader.search.clear();
  required<HTMLElement>(".epub-reader-shell__viewport").focus({
    preventScroll: true,
  });
  for (const chromeRegion of activeShell.querySelectorAll(
    ".epub-reader-shell__toolbar, .epub-reader-controls",
  )) {
    chromeRegion.dispatchEvent(
      new PointerEvent("pointerleave", { pointerType: "mouse" }),
    );
  }
  await waitFor(
    () => activeShell.classList.contains("is-chrome-hidden"),
    "reader chrome to auto-hide before saved highlight activation",
  );
  const highlightOverlay = await waitFor(
    () =>
      Array.from(
        contentDocument.querySelectorAll<HTMLElement>(
          "[data-epub-decoration-id]",
        ),
      ).find(
        (candidate) => {
          const bounds = candidate.getBoundingClientRect();
          const view = contentDocument.defaultView!;
          return (
            candidate.dataset.epubDecorationId === fixtureHighlight.id &&
            bounds.width > 0 &&
            bounds.height > 0 &&
            bounds.right > 0 &&
            bounds.bottom > 0 &&
            bounds.left < view.innerWidth &&
            bounds.top < view.innerHeight
          );
        },
      ),
    "visible highlight decoration",
  );
  const highlightBounds = highlightOverlay.getBoundingClientRect();
  highlightOverlay.dispatchEvent(
    new contentDocument.defaultView!.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: highlightBounds.left + highlightBounds.width / 2,
      clientY: highlightBounds.top + highlightBounds.height / 2,
    }),
  );
  const markPopover = await waitFor(
    () => document.querySelector<HTMLElement>(".epub-reader-mark-popover"),
    "mark popover",
  );
  assert(
    activeShell.classList.contains("is-chrome-hidden"),
    "activating a saved highlight must not reveal the edge reader chrome",
  );
  const readerBodyBounds = required<HTMLElement>(
    ".epub-reader-shell__body",
  ).getBoundingClientRect();
  const markPopoverBounds = markPopover.getBoundingClientRect();
  assert(
    markPopoverBounds.left >= readerBodyBounds.left &&
      markPopoverBounds.right <= readerBodyBounds.right &&
      markPopoverBounds.top >= readerBodyBounds.top &&
      markPopoverBounds.bottom <= readerBodyBounds.bottom,
    "mark popover must remain inside the reader after measuring its real height",
  );
  const popoverSave = buttonWithText(markPopover, "Save Change");
  assert(
    getComputedStyle(popoverSave).whiteSpace === "nowrap",
    "mark popover Save Change action must remain on one line",
  );
  const popoverActionHeight = popoverSave.getBoundingClientRect().height;
  click(buttonWithText(markPopover, "Delete"));
  const popoverDeleteConfirmation = await waitFor(
    () =>
      markPopover.querySelector<HTMLElement>(
        ".epub-reader-mark-popover__delete-confirm",
      ),
    "mark popover deletion confirmation",
  );
  assert(
    [...popoverDeleteConfirmation.querySelectorAll("button")].every(
      (button) =>
        Math.abs(button.getBoundingClientRect().height - popoverActionHeight) <=
        0.5,
    ),
    "mark popover regular and confirmation actions must share one button height",
  );
  click(buttonWithText(popoverDeleteConfirmation, "Cancel"));
  const popoverExcerpt = required<HTMLElement>(
    ".epub-reader-mark-popover__excerpt",
  );
  const popoverExcerptText = required<HTMLElement>(
    ".epub-reader-mark-popover__excerpt > span",
  );
  const popoverExcerptStyle = getComputedStyle(popoverExcerpt);
  assert(
    Math.abs(
      parseFloat(popoverExcerptStyle.paddingTop) -
        parseFloat(popoverExcerptStyle.paddingBottom),
    ) <= 0.5 &&
      getComputedStyle(popoverExcerptText).webkitLineClamp === "3" &&
      popoverExcerptText.scrollHeight > popoverExcerptText.clientHeight,
    "long mark excerpts must ellipsize after three lines with equal vertical inset",
  );
  const popoverColorLegend = required<HTMLElement>(
    ".epub-reader-mark-popover__field--color legend",
  );
  const popoverColors = required<HTMLElement>(
    ".epub-reader-mark-popover__colors",
  );
  assert(
    popoverColors.getBoundingClientRect().top -
      popoverColorLegend.getBoundingClientRect().bottom >=
      9,
    "the Color label and selected swatch ring must remain visually separated",
  );
  const popoverStyleLegend = required<HTMLElement>(
    ".epub-reader-mark-popover__field:not(.epub-reader-mark-popover__field--color) legend",
  );
  const popoverStyles = required<HTMLElement>(
    ".epub-reader-mark-popover__styles",
  );
  assert(
    popoverStyles.getBoundingClientRect().top -
      popoverStyleLegend.getBoundingClientRect().bottom >=
      8,
    "the Style label and option grid must retain a calm visual gap",
  );
  const popoverSwatch = required<HTMLElement>(
    ".epub-reader-mark-popover__colors button",
  ).getBoundingClientRect();
  assert(
    Math.abs(popoverSwatch.width - popoverSwatch.height) <= 0.5,
    "mark popover color controls must render as circles",
  );
  click(
    required<HTMLButtonElement>(".epub-reader-shell__dismiss-layer"),
  );
  await waitFor(
    () => !document.querySelector(".epub-reader-mark-popover"),
    "outside click to dismiss mark popover",
  );
  await markReader.history.back();
  markReader.marks.addAnnotation(
    { start: markLocator, end: markLocator },
    "Fixture note",
    "underline",
    "blue",
    "Fixture passage",
  );
  const unsavedBookmarkButton = buttonWithLabel("Bookmark current page");
  assert(
    unsavedBookmarkButton.getAttribute("aria-pressed") === "false" &&
      unsavedBookmarkButton.querySelector("path")?.getAttribute("fill") ===
        "none",
    "an unsaved page must use the outline bookmark icon",
  );
  const fixtureBookmark = await markReader.marks.addBookmark(
    "Fixture bookmark note",
  );
  assert(fixtureBookmark, "mark manager fixture must capture a bookmark");
  const savedBookmarkButton = await waitFor(
    () =>
      document.querySelector<HTMLButtonElement>(
        'button[aria-label="Remove bookmark from current page"]',
      ),
    "saved bookmark toolbar state",
  );
  assert(
    savedBookmarkButton.getAttribute("aria-pressed") === "true" &&
      savedBookmarkButton.querySelector("path")?.getAttribute("fill") ===
        "currentColor",
    "a saved page must use the filled bookmark icon",
  );
  const marksButton = buttonWithLabel("Marks");
  click(marksButton);
  const marksPanel = await waitForPanel("Marks");
  const panelContent = required<HTMLElement>(
    ".epub-reader-shell__panel-content",
  );
  assert(
    getComputedStyle(panelContent).scrollbarGutter === "stable" &&
      panelContent.scrollWidth <= panelContent.clientWidth,
    "left panels must reserve their scrollbar and avoid horizontal overflow",
  );
  assert(
    marksPanel.querySelectorAll(".epub-marks-panel__filters button").length ===
      4,
    "mark manager must expose symmetric type filters",
  );
  assert(
    !marksPanel.textContent?.includes("Bookmark page"),
    "page bookmarking belongs to the reader toolbar rather than the management panel",
  );
  click(buttonWithLabel("Show highlights"));
  await waitFor(
    () =>
      marksPanel.querySelectorAll(".epub-marks-panel__list li").length === 1,
    "highlight-only mark filter",
  );
  const inlineEdit = buttonWithText(marksPanel, "Edit");
  const markCard = inlineEdit.closest<HTMLElement>("li");
  assert(markCard, "Edit action must remain inside its mark card");
  const editBounds = inlineEdit.getBoundingClientRect();
  const markCardBounds = markCard.getBoundingClientRect();
  const locationButton = required<HTMLElement>(
    ".epub-marks-panel__location",
  );
  const editStyle = getComputedStyle(inlineEdit);
  const locationStyle = getComputedStyle(locationButton);
  const markStatusBounds = required<HTMLElement>(
    ".epub-marks-panel__status",
  ).getBoundingClientRect();
  assert(
    editStyle.position === "absolute" &&
      editBounds.right <= markCardBounds.right &&
      editBounds.bottom <= markCardBounds.bottom &&
      editBounds.bottom > markCardBounds.bottom - 18 &&
      editStyle.borderTopWidth === "0px" &&
      editStyle.backgroundColor === "rgba(0, 0, 0, 0)" &&
      editStyle.fontStyle === "normal" &&
      Number(editStyle.fontWeight) >= 700 &&
      parseFloat(locationStyle.paddingRight) >= 56 &&
      locationStyle.borderTopWidth === "0px" &&
      Math.abs(markStatusBounds.right - editBounds.right) <= 0.5,
    "Edit and status must share a right-hand axis inside one card frame",
  );
  click(inlineEdit);
  const markEditor = await waitFor(
    () => marksPanel.querySelector<HTMLElement>(".epub-mark-editor"),
    "inline mark editor",
  );
  assert(
    markEditor.querySelector(".epub-mark-editor__header")?.textContent
      ?.trim()
      .startsWith("Edit highlight"),
    "the inline editor must expose its own compact editing hierarchy",
  );
  const editingItem = markEditor.closest<HTMLElement>("li");
  assert(
    editingItem?.classList.contains("is-editing") &&
      getComputedStyle(editingItem).boxShadow !== "none" &&
      getComputedStyle(
        editingItem.querySelector<HTMLElement>(
          ".epub-marks-panel__location",
        )!,
      ).display === "none",
    "the open editor must identify its card without repeating the collapsed summary",
  );
  const appearanceFields = markEditor.querySelectorAll<HTMLElement>(
    ".epub-mark-editor__appearance > *",
  );
  const inlineStyles = required<HTMLElement>(
    ".epub-mark-editor__styles",
  );
  const inlineStyleButtons = inlineStyles.querySelectorAll("button");
  const inlineStyleLegend = inlineStyles.parentElement!.querySelector("legend")!;
  assert(
    appearanceFields.length === 2 &&
      appearanceFields[1]!.getBoundingClientRect().top >
        appearanceFields[0]!.getBoundingClientRect().bottom &&
      inlineStyleButtons.length === 4 &&
      inlineStyles.getBoundingClientRect().top -
        inlineStyleLegend.getBoundingClientRect().bottom >=
        7,
    "the inline editor must expose color and the same separated 2-by-2 style controls as the popover",
  );
  const inlineUnderline = required<HTMLElement>(
    ".epub-mark-editor__styles .is-underline",
  ).closest<HTMLButtonElement>("button")!;
  click(inlineUnderline);
  await waitFor(
    () => inlineUnderline.getAttribute("aria-pressed") === "true",
    "inline graphical style control to update the selected highlight style",
  );
  const yellowSwatch = required<HTMLButtonElement>(
    ".epub-mark-editor__colors .is-yellow",
  );
  const yellowSwatchBounds = yellowSwatch.getBoundingClientRect();
  assert(
    getComputedStyle(yellowSwatch).backgroundColor !== "rgba(0, 0, 0, 0)" &&
      Math.abs(yellowSwatchBounds.width - yellowSwatchBounds.height) <= 0.5,
    "mark editor color swatches must retain a visible circular shape",
  );
  const tagInput = markEditor.querySelector<HTMLInputElement>(
    'input[placeholder="Separate tags with commas"]',
  );
  assert(tagInput, "mark editor must expose tag editing");
  const labelInput = required<HTMLTextAreaElement>(
    ".epub-mark-editor textarea",
  );
  labelInput.focus();
  assert(
    getComputedStyle(labelInput).outlineWidth === "0px" &&
      getComputedStyle(labelInput).boxShadow !== "none",
    "mark editor fields must use the same single restrained focus ring as Search",
  );
  setInputValue(tagInput, "review, favorite");
  const editorActionHeight = buttonWithText(
    markEditor,
    "Save",
  ).getBoundingClientRect().height;
  click(buttonWithText(markEditor, "Delete"));
  const inlineDeleteConfirmation = await waitFor(
    () => markEditor.querySelector<HTMLElement>(".epub-mark-editor__confirm"),
    "inline mark deletion confirmation",
  );
  const confirmationBounds = inlineDeleteConfirmation.getBoundingClientRect();
  const editorFooter = inlineDeleteConfirmation.parentElement!;
  const editorFooterBounds = editorFooter.getBoundingClientRect();
  const confirmationLabelBounds = inlineDeleteConfirmation
    .querySelector("span")!
    .getBoundingClientRect();
  const confirmationLabel = inlineDeleteConfirmation.querySelector("span")!;
  const confirmationActionsBounds = inlineDeleteConfirmation
    .querySelector("div")!
    .getBoundingClientRect();
  assert(
    confirmationBounds.left >= editorFooterBounds.left &&
      confirmationBounds.right <= editorFooterBounds.right &&
      Math.abs(
        confirmationLabelBounds.top + confirmationLabelBounds.height / 2 -
          (confirmationActionsBounds.top + confirmationActionsBounds.height / 2),
      ) <= 1 &&
      ![...markEditor.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Keep",
      ) &&
      ![...markEditor.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Save",
      ) &&
      getComputedStyle(editorFooter).backgroundColor !==
        getComputedStyle(markEditor).backgroundColor &&
      getComputedStyle(confirmationLabel).whiteSpace === "nowrap" &&
      confirmationLabel.scrollHeight === confirmationLabel.clientHeight &&
      [...inlineDeleteConfirmation.querySelectorAll("button")].every(
        (button) =>
          Math.abs(button.getBoundingClientRect().height - editorActionHeight) <=
          0.5,
      ),
    "mark deletion confirmation must use one danger strip with Cancel and Delete aligned on the right",
  );
  click(buttonWithText(inlineDeleteConfirmation, "Cancel"));
  const saveMark = await waitFor(
    () =>
      [...markEditor.querySelectorAll<HTMLButtonElement>("button")].find(
        (button) => button.textContent?.trim() === "Save",
      ),
    "regular mark editor actions after cancelling deletion",
  );
  assert(
    getComputedStyle(saveMark).whiteSpace === "nowrap",
    "mark editor Save action must remain on one line",
  );
  click(saveMark);
  await waitFor(
    () => !marksPanel.querySelector(".epub-mark-editor"),
    "inline mark editor to close after saving",
  );
  assert(
    marksPanel.querySelectorAll(".epub-marks-panel__tags em").length === 2,
    "saved mark tags must render in the manager",
  );
  click(buttonWithLabel("Show all"));
  await waitFor(
    () =>
      marksPanel.querySelectorAll(".epub-marks-panel__list li").length === 3,
    "all mark types after filter reset",
  );
  const bookmarkItem = required<HTMLElement>(
    ".epub-marks-panel__list li[data-mark-kind='bookmark'] > .epub-marks-panel__location",
  );
  const highlightItem = required<HTMLElement>(
    ".epub-marks-panel__list li[data-mark-kind='highlight'] > .epub-marks-panel__location",
  );
  const bookmarkPreview = required<HTMLElement>(
    ".epub-marks-panel__list li[data-mark-kind='bookmark'] .epub-marks-panel__location > strong",
  );
  const bookmarkPreviewStyle = getComputedStyle(bookmarkPreview);
  const cardHeightDelta = Math.abs(
    bookmarkItem.getBoundingClientRect().height -
      highlightItem.getBoundingClientRect().height,
  );
  const bookmarkClamped =
    bookmarkPreview.getBoundingClientRect().height <=
      parseFloat(bookmarkPreviewStyle.lineHeight) * 2 + 1 &&
    bookmarkPreviewStyle.webkitLineClamp === "2";
  assert(
    cardHeightDelta <= 0.5 && bookmarkClamped,
    "bookmark and highlight summaries must share a fixed height and ellipsize after two lines",
  );
  click(buttonWithText(marksPanel, "Select"));
  const selectVisible = await waitFor(
    () =>
      marksPanel.querySelector<HTMLInputElement>(
        ".epub-marks-panel__bulk input",
      ),
    "bulk select control",
  );
  selectVisible.click();
  click(buttonWithText(marksPanel, "Delete"));
  click(
    await waitFor(
      () =>
        Array.from(
          marksPanel.querySelectorAll<HTMLButtonElement>("button"),
        ).find((button) => button.textContent?.trim() === "Confirm delete 3"),
      "batch deletion confirmation",
    ),
  );
  await waitFor(
    () => marksPanel.textContent?.includes("No saved marks"),
    "atomic batch mark deletion",
  );
  steps.push(
    "mark manager filtered, edited, tagged and batch-deleted all mark kinds",
  );
  click(buttonWithLabel("Close Marks"));
  await waitFor(
    () => !document.querySelector(".epub-reader-shell__panel"),
    "marks panel to close",
  );

  const viewport = required<HTMLElement>(".epub-reader-shell__viewport");
  viewport.focus();
  dispatchKey(viewport, { key: "?", code: "Slash", shiftKey: true });
  const helpPanel = await waitForPanel("Keyboard shortcuts");
  await waitFor(
    () => helpPanel.contains(document.activeElement),
    "keyboard-help panel to receive focus",
  );
  dispatchKey(document.activeElement ?? viewport, {
    key: "Escape",
    code: "Escape",
  });
  await waitFor(
    () => !document.querySelector(".epub-reader-shell__panel"),
    "keyboard-help panel to close",
  );
  steps.push("keyboard shortcut opened and closed Help");

  click(buttonWithLabel("Search"));
  await waitForPanel("Search");
  const searchInput = await waitFor(
    () =>
      document.querySelector<HTMLInputElement>(
        'input[aria-label="Find in book"]',
      ),
    "search input",
  );
  searchInput.focus();
  assert(
    getComputedStyle(searchInput).outlineWidth === "0px",
    "search focus must use one restrained focus treatment instead of stacked outlines",
  );
  setInputValue(searchInput, "吾輩");
  searchInput.form?.requestSubmit();
  const searchSummary = await waitFor(() => {
    const text =
      document
        .querySelector(".epub-search-panel__summary")
        ?.textContent?.trim() ?? "";
    return /result/u.test(text) ? text : null;
  }, "search results");
  assert(
    document.querySelector(".epub-search-panel__results mark")?.textContent ===
      "吾輩",
    "search result must highlight the query",
  );
  assert(
    document.querySelectorAll(".epub-search-panel__group").length === 1,
    "search results must be grouped under their chapter",
  );
  const searchExcerpt = required<HTMLElement>(
    ".epub-search-result__excerpt",
  );
  const excerptStyle = getComputedStyle(searchExcerpt);
  assert(
    searchExcerpt.getBoundingClientRect().height <=
      parseFloat(excerptStyle.lineHeight) * 2 + 1,
    "search result excerpts must end on a complete line instead of clipping the next one",
  );
  assert(
    document
      .querySelector(".epub-search-panel__pager span")
      ?.textContent?.trim()
      .startsWith("–"),
    "a completed search must not claim a hit was navigated before activation",
  );
  steps.push(`search completed: ${searchSummary}`);
  click(required<HTMLButtonElement>(".epub-search-panel__results li button"));
  const located = await waitForPage(
    (position) => position.current === 1,
    "search locator to navigate to its first match",
  );
  steps.push(
    `lightweight search locator navigated to ${located.current}/${located.total}`,
  );
  click(buttonWithLabel("Close Search"));
  await waitFor(
    () => !document.querySelector(".epub-reader-shell__panel"),
    "search panel to close",
  );
  click(contentsButton);
  const historyPanel = await waitForPanel("Contents");
  click(
    required<HTMLButtonElement>(
      'button[aria-controls="epub-navigation-history"]',
    ),
  );
  const previousLocation = await waitFor(
    () =>
      historyPanel.querySelector<HTMLButtonElement>(
        "#epub-navigation-history .epub-contents__entries button",
      ),
    "search origin in navigation history",
  );
  click(previousLocation);
  await waitForPage(
    (position) => position.current === restored.current,
    "history entry to restore the previous reading location",
  );
  click(buttonWithLabel("Close Contents"));
  await waitFor(
    () => !document.querySelector(".epub-reader-shell__panel"),
    "contents panel to close after history navigation",
  );
  steps.push(
    "publication navigation synchronized Contents, remembered folds, exposed Page List and Landmarks, and restored History",
  );

  click(buttonWithLabel("Reader settings"));
  const settingsPanel = await waitForPanel("Reader settings");
  const settingsHeadings = Array.from(
    settingsPanel.querySelectorAll<HTMLElement>(
      ".epub-settings-panel__section h3",
    ),
    (heading) => heading.textContent?.trim(),
  );
  assert(
    ["Color theme", "Typography", "Layout", "Touch navigation"].every(
      (heading) => settingsHeadings.includes(heading),
    ),
    "the reflowable settings panel must retain every applicable focused settings section",
  );
  const readerShell = required<HTMLElement>(".epub-reader-shell");
  for (const theme of ["Graphite", "Dark"] as const) {
    click(buttonWithText(settingsPanel, theme));
    await waitFor(
      () => readerShell.dataset.theme === theme.toLowerCase(),
      `${theme} reader theme`,
    );
    const inactiveSegment = Array.from(
      settingsPanel.querySelectorAll<HTMLButtonElement>(
        ".epub-settings-panel__segmented button[aria-pressed='false']",
      ),
    )[0];
    assert(inactiveSegment, `${theme} theme needs an inactive segmented control`);
    const segmentSection = inactiveSegment.closest<HTMLElement>(
      ".epub-settings-panel__section",
    );
    assert(segmentSection, "segmented control must remain in its settings card");
    assert(
      getComputedStyle(inactiveSegment).backgroundColor !==
        getComputedStyle(segmentSection).backgroundColor,
      `${theme} theme buttons must remain distinct from their settings card`,
    );
  }
  const touchPreview = required<HTMLElement>(".epub-touch-preview");
  const touchPreviewMode = () =>
    touchPreview
      .querySelector(".epub-touch-preview__mode")
      ?.textContent?.trim();
  assert(
    touchPreviewMode() === "TAP + SWIPE",
    "touch preview must name the selected gesture mode",
  );
  click(buttonWithText(settingsPanel, "Tap zones"));
  await waitFor(
    () => touchPreviewMode() === "TAP ZONES",
    "tap-zone preview mode",
  );
  click(buttonWithText(settingsPanel, "Tap + swipe"));
  await waitFor(
    () => touchPreviewMode() === "TAP + SWIPE",
    "combined touch preview mode",
  );
  const advancedEntry = required<HTMLButtonElement>(
    ".epub-settings-panel__advanced-entry",
  );
  assert(
    getComputedStyle(advancedEntry).backgroundImage === "none",
    "advanced settings entry must use a flat surface without a decorative gradient",
  );
  click(advancedEntry);
  await waitFor(
    () => document.querySelector(".epub-settings-panel--advanced"),
    "advanced settings",
  );
  click(
    required<HTMLButtonElement>(".epub-settings-panel__maintenance-action"),
  );
  click(
    await waitFor(
      () =>
        document.querySelector<HTMLButtonElement>(
          ".epub-settings-panel__clear-confirm .is-danger",
        ),
      "clear-data confirmation",
    ),
  );
  await waitFor(
    () => document.querySelector(".epub-settings-panel__maintenance-status"),
    "clear-data status",
  );
  steps.push(
    "focused settings sections and advanced maintenance remained usable",
  );
  click(buttonWithLabel("Close Reader settings"));
  await waitFor(
    () => !document.querySelector(".epub-reader-shell__panel"),
    "settings panel to close",
  );
  click(buttonWithLabel("Close book"));
  await waitFor(
    () => document.querySelector<HTMLInputElement>(".epub-file-picker__input"),
    "file picker after clearing session",
  );
  await chooseFile(fixture);
  const reset = await waitForPage(
    (position) => position.current === 1,
    "cleared reading session to reopen at page one",
  );
  steps.push(
    `cleared reading session reopened at ${reset.current}/${reset.total}`,
  );

  const mixedResponse = await fetch(mixedFixtureUrl);
  assert(
    mixedResponse.ok,
    `mixed-layout fixture request failed with ${mixedResponse.status}`,
  );
  const mixedFixture = new File(
    [await mixedResponse.arrayBuffer()],
    "mixed-layout.epub",
    { type: "application/epub+zip" },
  );
  click(buttonWithLabel("Close book"));
  await waitFor(
    () => document.querySelector<HTMLInputElement>(".epub-file-picker__input"),
    "file picker before mixed-layout fixture",
  );
  await chooseFile(mixedFixture);
  click(buttonWithLabel("Reading statistics"));
  const mixedStatistics = await waitForPanel("Reading statistics");
  await waitFor(
    () =>
      mixedStatistics
        .querySelector('[aria-label="Registered reading statistics"]')
        ?.textContent?.trim() === "Mixed Layout Fixture",
    "registered tool to receive the mixed-layout reader",
  );
  const mixedReader = getActiveReader();
  const fixedHref = mixedReader?.state.reader?.publication.spine[1]?.href;
  assert(
    mixedReader && fixedHref,
    "registered tool must expose the mixed-layout reader and its fixed page",
  );
  dispatchKey(document.activeElement ?? required(".epub-reader-shell"), {
    key: "Escape",
    code: "Escape",
  });
  await waitFor(
    () => !document.querySelector(".epub-reader-shell__panel"),
    "mixed-layout statistics panel to close",
  );
  await mixedReader.goTo({ kind: "href", href: fixedHref });
  await waitFor(
    () =>
      required<HTMLElement>(".epub-reader-shell").dataset.renderer ===
      "fixed-layout",
    "mixed-layout fixed page navigation",
  );
  const spreadRoot = await waitFor(
    () => document.querySelector<HTMLElement>('[data-epub-spread="true"]'),
    "fixed-layout spread",
  );

  click(buttonWithLabel("Reader settings"));
  const comicSettings = await waitForPanel("Reader settings");
  assert(
    comicSettings
      .querySelector(".epub-settings-panel__comic h3")
      ?.textContent?.trim() === "Comic display",
    "mixed publications must expose comic display settings",
  );
  const comicPreview = required<HTMLElement>(".epub-comic-layout-preview");
  const previewMode = () =>
    comicPreview
      .querySelector(".epub-comic-layout-preview__mode")
      ?.textContent?.trim();
  assert(
    previewMode() === "WHOLE PAGE",
    "comic preview must name the selected whole-page fit mode",
  );
  for (const [label, className, mode] of [
    ["Fit width", "is-width", "FIT WIDTH"],
    ["Fit height", "is-height", "FIT HEIGHT"],
    ["Original", "is-original", "ORIGINAL 1:1"],
    ["Whole page", "is-contain", "WHOLE PAGE"],
  ] as const) {
    click(buttonWithText(comicSettings, label));
    await waitFor(
      () =>
        comicPreview.classList.contains(className) && previewMode() === mode,
      `${label} comic preview`,
    );
  }

  click(buttonWithText(comicSettings, "Normal"));
  await waitFor(
    () => spreadRoot.style.gap === "24px",
    "normal fixed-layout spread spacing",
  );
  click(buttonWithText(comicSettings, "None"));
  await waitFor(
    () =>
      spreadRoot.style.gap === "0px" && fixedSpreadFacingGap(spreadRoot) <= 1,
    "gapless fixed-layout page alignment",
  );
  assert(
    comicPreview.classList.contains("has-no-gutter"),
    "comic preview must show pages touching when gutter is None",
  );
  steps.push(
    "comic fit previews matched their controls and None gutter joined facing pages",
  );

  return steps;
}

function firstVisibleText(document: Document): Text | null {
  const win = document.defaultView;
  if (!win) return null;
  const walker = document.createTreeWalker(
    document.body,
    win.NodeFilter.SHOW_TEXT,
  );
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue?.trim()) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const bounds = parent.getBoundingClientRect();
    if (
      bounds.right > 0 &&
      bounds.bottom > 0 &&
      bounds.left < win.innerWidth &&
      bounds.top < win.innerHeight
    )
      return node as Text;
  }
  return null;
}
