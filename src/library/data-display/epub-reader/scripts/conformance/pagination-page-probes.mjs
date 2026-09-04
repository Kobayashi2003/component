/** Runs inside the page. Drives the real engine and measures the invariants. */
export const measurePagination = async (viewports) => {
  const core = await import("./core/index.js");
  const bytes = new Uint8Array(
    await (await fetch("./book.epub")).arrayBuffer(),
  );
  const stage = document.getElementById("stage");
  const reader = await core.BrowserEpubReader.open(bytes, stage, {
    preferences: { pageMarginPercent: 4 },
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

  const measure = () => {
    const snapshot = reader.snapshot;
    const layout = snapshot.renderer.layout;
    const plan = snapshot.renderer.plan;
    const frame = stage.querySelector("iframe");
    if (!frame?.contentDocument || !plan || !layout) return null;
    const document_ = frame.contentDocument;
    const root_ = document_.documentElement;
    const style = document_.defaultView.getComputedStyle(document_.body);
    const advance = (layout.pageWidth ?? 0) + (layout.pageGap ?? 0);
    if (!advance) return null;

    const body = document_.body.getBoundingClientRect();
    let straddling = 0;
    let rects = 0;
    const walker = document_.createTreeWalker(
      document_.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.data.trim()) continue;
      const range = document_.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        rects += 1;
        const near =
          layout.scrollAxis === "vertical"
            ? rect.top - body.top
            : rect.left - body.left;
        const far =
          (layout.scrollAxis === "vertical"
            ? rect.bottom - body.top
            : rect.right - body.left) - 0.5;
        if (Math.floor(near / advance) !== Math.floor(far / advance))
          straddling += 1;
      }
    }

    const annotations = [...document_.querySelectorAll("rt")];
    return {
      viewport: `${plan.viewport.width}x${plan.viewport.height}`,
      writingMode: style.writingMode,
      columnFill: style.columnFill,
      scrollAxis: layout.scrollAxis,
      advance,
      advanceMatchesViewport: Math.abs(advance - plan.viewport.height) < 0.5,
      pages: layout.pageCount,
      scrollLandsOnPage:
        Math.abs(root_.scrollTop - (layout.currentPage - 1) * advance) < 1.5,
      straddling,
      rects,
      rubyOverflow: annotations.length
        ? Math.max(
            ...annotations.map(
              (element) => element.getBoundingClientRect().right,
            ),
          ) - body.right
        : null,
    };
  };

  const samples = [];
  for (const [width, height] of viewports) {
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    await settle();
    await reader.syncViewportFromElement();
    await settle();
    const sample = measure();
    if (sample) samples.push(sample);
  }

  const before = reader.snapshot.renderer.layout?.currentPage;
  await reader.next();
  await settle();
  const forward = reader.snapshot.renderer.layout?.currentPage;
  await reader.previous();
  await settle();
  const back = reader.snapshot.renderer.layout?.currentPage;

  return {
    presentation: reader.snapshot.presentation,
    samples,
    roundTrip: { before, forward, back },
  };
};

/**
 * Walk a mixed-layout publication from the first page and record what each turn
 * actually lands on. Two things go wrong here that pure geometry does not catch:
 * a page that reports no position at all, and a page that is simply blank.
 */
export const walkMixedLayout = async (steps) => {
  const core = await import("./core/index.js");
  const bytes = new Uint8Array(
    await (await fetch("./mixed.epub")).arrayBuffer(),
  );
  // Its own container: the geometry probe above leaves its reader mounted, and
  // sharing a stage would let that reader's surfaces count as on screen here.
  const stage = document.createElement("div");
  stage.style.cssText = "width:900px;height:560px;background:#fff";
  document.body.appendChild(stage);
  const reader = await core.BrowserEpubReader.open(bytes, stage, {});
  const settle = () => new Promise((resolve) => setTimeout(resolve, 320));
  await settle();

  const look = () => {
    const snapshot = reader.snapshot;
    const plan = snapshot.renderer.plan;
    const layout = snapshot.renderer.layout;
    // Match the surface to the active spine item by its title. A renderer swap
    // leaves the outgoing iframe in the tree for a moment, and reading that one
    // reports the previous page's ink for the page that just arrived.
    const wanted = plan?.href ? plan.href.split("/").pop() : null;
    const frame = [...stage.querySelectorAll("iframe")]
      .reverse()
      .find((element) => wanted && (element.title ?? "").endsWith(wanted));
    const document_ = frame?.contentDocument;
    let painted = 0;
    if (document_?.body) {
      const view = document_.documentElement;
      const walker = document_.createTreeWalker(
        document_.body,
        NodeFilter.SHOW_TEXT,
      );
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.data.trim()) continue;
        const range = document_.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.width <= 0 || rect.height <= 0) continue;
          if (
            rect.bottom > 0 &&
            rect.top < view.clientHeight &&
            rect.right > 0 &&
            rect.left < view.clientWidth
          )
            painted += 1;
        }
      }
    }
    return {
      spine: plan?.spineIndex ?? null,
      href: plan?.href ?? null,
      renderer: plan?.renderer ?? null,
      chrome: snapshot.presentation?.chrome ?? null,
      currentPage: layout?.currentPage ?? null,
      pageCount: layout?.pageCount ?? null,
      showing: [...stage.querySelectorAll("iframe")]
        .filter((element) => element.style.visibility !== "hidden")
        .map((element) =>
          (element.title ?? "").replace(/^EPUB(?: fixed page)?: /, ""),
        )
        .sort(),
      scrollTop: frame?.contentDocument?.documentElement?.scrollTop ?? 0,
      painted,
      matchedSurface: Boolean(frame),
    };
  };

  const visited = [look()];
  for (let i = 0; i < steps; i += 1) {
    const result = await reader.next();
    await settle();
    visited.push({ ...look(), boundary: result?.status === "boundary" });
    if (result?.status === "boundary") break;
  }
  stage.remove();
  return visited;
};
