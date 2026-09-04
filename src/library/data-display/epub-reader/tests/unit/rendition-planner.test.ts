import {
  DEFAULT_READER_PREFERENCES,
  type Publication,
  type SpineItem,
} from "../../core/epub/publication";
import {
  DEFAULT_RENDITION_PLANNER_POLICY,
  detectTrueSpreadPair,
  planRendition,
  type RenditionPlannerPolicy,
} from "../../core/presentation/rendition";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makePublication(overrides: Partial<Publication> = {}): Publication {
  const spine: SpineItem[] = [
    makeSpine(0, "chapter-1", { layout: "reflowable" }),
    makeSpine(1, "plate-right", {
      layout: "pre-paginated",
      pageSpread: "right",
    }),
    makeSpine(2, "plate-left", {
      layout: "pre-paginated",
      pageSpread: "left",
    }),
    makeSpine(3, "chapter-2", {
      layout: "reflowable",
      flow: "scrolled-continuous",
    }),
  ];

  return {
    version: "3.3",
    packagePath: "EPUB/package.opf",
    metadata: {
      title: "Planner fixture",
      creators: [],
      contributors: [],
      entries: [],
    },
    manifest: spine.map((item) => ({
      id: item.idref,
      sourceHref: item.href.replace("EPUB/", ""),
      href: item.href,
      path: item.path,
      remote: false,
      mediaType: item.mediaType,
      properties: [],
    })),
    spine,
    navigation: {
      source: "none",
      toc: [],
      landmarks: [],
      pageList: [],
    },
    pageProgressionDirection: "rtl",
    rendition: {
      layout: "reflowable",
      orientation: "auto",
      spread: "auto",
      flow: "auto",
    },
    ...overrides,
  };
}

function makeSpine(
  index: number,
  idref: string,
  rendition: SpineItem["rendition"] = {},
): SpineItem {
  return {
    index,
    idref,
    href: `EPUB/${idref}.xhtml`,
    path: `EPUB/${idref}.xhtml`,
    remote: false,
    mediaType: "application/xhtml+xml",
    linear: true,
    properties: [],
    rendition,
  };
}

const publication = makePublication();
const SPREAD_CAPABLE_POLICY: RenditionPlannerPolicy = {
  ...DEFAULT_RENDITION_PLANNER_POLICY,
  syntheticSpreads: {
    ...DEFAULT_RENDITION_PLANNER_POLICY.syntheticSpreads,
    supported: true,
  },
};

// 1. Page progression is not writing mode. RTL book + vertical content keeps
// both facts separately.
{
  const item = publication.spine[0]!;
  const plan = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 1200, height: 800 },
    policy: SPREAD_CAPABLE_POLICY,
    contentHints: {
      writingMode: "vertical-rl",
      direction: "rtl",
    },
  });
  assert(
    plan.pageProgression.value === "rtl",
    "publication page progression must resolve to RTL",
  );
  assert(
    plan.writingMode.value === "vertical-rl",
    "content writing mode must remain vertical-rl",
  );
  assert(
    plan.renderer === "reflowable-paginated",
    "wide reflowable content remains paginated",
  );
  assert(
    plan.spread.mode === "double",
    "auto spread may use a wide landscape viewport",
  );
}

// 2. User page progression can override publication progression without
// mutating text direction or writing mode.
{
  const item = publication.spine[0]!;
  const plan = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 800, height: 1200 },
    preferences: {
      ...DEFAULT_READER_PREFERENCES,
      pageProgression: "ltr",
    },
  });
  assert(
    plan.pageProgression.value === "ltr" &&
      plan.pageProgression.source === "user",
    "user progression must win",
  );
  assert(
    plan.textDirection.value === "auto",
    "text direction must not be inferred from user page progression",
  );
}

// 3. Fixed layout is exactly one page per spine item and ignores authored/user
// rendition flow. Adjacent explicit left/right slots are detected as a true spread.
{
  const base = makePublication();
  const original = base.spine[1]!;
  const item: SpineItem = {
    ...original,
    rendition: { ...original.rendition, flow: "scrolled-continuous" },
  };
  const fixedSpine = [...base.spine];
  fixedSpine[1] = item;
  const fixedWithFlow: Publication = { ...base, spine: fixedSpine };
  const plan = planRendition({
    publication: fixedWithFlow,
    spineItem: item,
    viewport: { width: 1024, height: 768 },
    policy: SPREAD_CAPABLE_POLICY,
    preferences: {
      ...DEFAULT_READER_PREFERENCES,
      flow: "scrolled",
    },
    contentHints: {
      viewport: { width: 1200, height: 1600 },
    },
  });
  assert(
    plan.overflow.value === "fixed-page",
    "fixed layout must ignore flow settings",
  );
  assert(
    plan.renderer === "fixed-layout",
    "fixed content must select the fixed-layout renderer independently from spread composition",
  );
  assert(
    plan.spread.mode === "double",
    "true spread should request double-slot composition in auto mode",
  );
  assert(
    plan.spread.trueSpread?.leftSpineIndex === 2,
    "true spread must preserve left slot",
  );
  assert(
    plan.spread.trueSpread?.rightSpineIndex === 1,
    "true spread must preserve right slot",
  );
  assert(
    plan.spread.gap === "none",
    "fixed-layout spread must not inject a gutter",
  );
  assert(
    plan.capabilities.textCustomization.fontSize === false,
    "fixed layout must disable font resizing capability",
  );
  assert(
    plan.diagnostics.some(
      (d) => d.code === "RENDITION_FLOW_IGNORED_FOR_FIXED_LAYOUT",
    ),
    "authored fixed flow must be diagnosed as ignored",
  );
  assert(
    plan.diagnostics.some(
      (d) => d.code === "RENDITION_USER_FLOW_IGNORED_FOR_FIXED_LAYOUT",
    ),
    "user fixed flow must be diagnosed as ignored",
  );

  const narrowPlan = planRendition({
    publication: fixedWithFlow,
    spineItem: item,
    viewport: { width: 390, height: 844 },
    policy: SPREAD_CAPABLE_POLICY,
    preferences: DEFAULT_READER_PREFERENCES,
  });
  assert(
    narrowPlan.spread.mode === "single",
    "auto true spreads should collapse to one page when a mobile viewport cannot fit both pages",
  );
  assert(
    narrowPlan.spread.trueSpread !== undefined,
    "responsive single-page mode must retain true-spread pairing metadata",
  );
}

// 4. User single-page mode is allowed to opt out of a SHOULD-level true spread.
{
  const item = publication.spine[1]!;
  const plan = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 1400, height: 900 },
    preferences: {
      ...DEFAULT_READER_PREFERENCES,
      spread: "single",
    },
  });
  assert(
    plan.renderer === "fixed-layout",
    "single/double composition must not change the fixed content renderer",
  );
  assert(
    plan.spread.mode === "single",
    "explicit user single mode should keep one fixed page visible",
  );
  assert(
    plan.spread.trueSpread !== undefined,
    "true-spread metadata must remain available even when user opts out",
  );
}

// 5. rendition:spread=none is a MUST-level constraint and blocks user double.
{
  const nonePublication = makePublication({
    rendition: {
      layout: "reflowable",
      orientation: "auto",
      spread: "none",
      flow: "auto",
    },
  });
  const item = nonePublication.spine[0]!;
  const plan = planRendition({
    publication: nonePublication,
    spineItem: item,
    viewport: { width: 1600, height: 900 },
    preferences: {
      ...DEFAULT_READER_PREFERENCES,
      spread: "double",
    },
  });
  assert(
    plan.spread.mode === "single",
    "publication spread=none must prevent a synthetic spread",
  );
  assert(
    plan.diagnostics.some(
      (d) => d.code === "RENDITION_USER_SPREAD_BLOCKED_BY_PUBLICATION_NONE",
    ),
    "blocked user spread must be explainable",
  );
}

// 6. page-spread-center disables spread for only that item.
{
  const centered = makeSpine(0, "centered", {
    layout: "pre-paginated",
    spread: "both",
    pageSpread: "center",
  });
  const centeredPublication = makePublication({
    spine: [centered],
    manifest: [
      {
        id: centered.idref,
        sourceHref: "centered.xhtml",
        href: centered.href,
        path: centered.path,
        remote: false,
        mediaType: centered.mediaType,
        properties: [],
      },
    ],
  });
  const plan = planRendition({
    publication: centeredPublication,
    spineItem: centered,
    viewport: { width: 1600, height: 900 },
    preferences: {
      ...DEFAULT_READER_PREFERENCES,
      spread: "double",
    },
  });
  assert(
    plan.renderer === "fixed-layout",
    "page-spread-center must not alter the content renderer",
  );
  assert(
    plan.spread.mode === "single",
    "page-spread-center must render the item alone",
  );
  assert(
    plan.spread.placement === "center",
    "center placement must be preserved",
  );
}

// 7. Reflowable authored scrolling is respected; spread placement is preserved
// but inactive because synthetic spreads do not apply to a scrolled rendition.
{
  const item = publication.spine[3]!;
  const plan = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 1200, height: 800 },
  });
  assert(
    plan.renderer === "reflowable-scroll",
    "authored scrolled-continuous must select scroll renderer",
  );
  assert(
    plan.overflow.value === "scrolled-continuous",
    "authored continuous scroll must be preserved",
  );
  assert(
    plan.spread.synthetic === false,
    "scrolled rendition must not create a synthetic spread",
  );
}

// 8. User flow may override an authored reflowable flow.
{
  const item = publication.spine[3]!;
  const plan = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 900, height: 1200 },
    preferences: {
      ...DEFAULT_READER_PREFERENCES,
      flow: "paginated",
    },
  });
  assert(
    plan.overflow.value === "paginated" && plan.overflow.source === "user",
    "user paginated mode should override authored reflowable scrolling",
  );
  assert(
    plan.renderer === "reflowable-paginated",
    "flow override must change renderer selection",
  );
}

// 9. Deprecated spread=portrait is interpreted by RS rules as both.
{
  const portraitPublication = makePublication({
    rendition: {
      layout: "reflowable",
      orientation: "auto",
      spread: "portrait",
      flow: "paginated",
    },
  });
  const item = portraitPublication.spine[0]!;
  const plan = planRendition({
    publication: portraitPublication,
    spineItem: item,
    viewport: { width: 700, height: 1100 },
    policy: SPREAD_CAPABLE_POLICY,
  });
  assert(
    plan.spread.mode === "double",
    "deprecated spread=portrait must be treated as both by the reading system",
  );
}

// 10. Auto spread policy is deterministic and configurable.
{
  const policy: RenditionPlannerPolicy = {
    ...DEFAULT_RENDITION_PLANNER_POLICY,
    syntheticSpreads: {
      ...DEFAULT_RENDITION_PLANNER_POLICY.syntheticSpreads,
      supported: true,
      autoMode: "never",
    },
  };
  const item = publication.spine[0]!;
  const plan = planRendition({
    publication,
    spineItem: item,
    viewport: { width: 2000, height: 1000 },
    policy,
  });
  assert(
    plan.spread.mode === "single",
    "policy autoMode=never must disable automatic spread creation",
  );
}

// 11. Orientation declaration produces an intent signal rather than conflating
// orientation with page progression or writing mode.
{
  const orientationPublication = makePublication({
    rendition: {
      layout: "reflowable",
      orientation: "portrait",
      spread: "auto",
      flow: "auto",
    },
  });
  const item = orientationPublication.spine[0]!;
  const plan = planRendition({
    publication: orientationPublication,
    spineItem: item,
    viewport: { width: 1200, height: 800 },
  });
  assert(
    plan.orientation.preference === "prefer-portrait",
    "portrait must be surfaced as an orientation preference",
  );
  assert(
    plan.orientation.matchesRequested === false,
    "landscape viewport must report an orientation mismatch",
  );
  assert(
    plan.pageProgression.value === "rtl",
    "orientation must not affect page progression",
  );
}

// 12. Pair detection follows spine reading order as well as authored slots.
{
  const pair = detectTrueSpreadPair(publication, publication.spine[2]!);
  assert(
    pair?.leftSpineIndex === 2 && pair.rightSpineIndex === 1,
    "pair detection must retain physical left/right slot identity",
  );
}

// 13. Spread composition is independent from per-slot renderer selection. This
// permits a mixed-layout publication to honor explicit left/right placement
// without pretending both slots belong to one fixed-layout renderer.
{
  const fixed = makeSpine(0, "mixed-fixed", {
    layout: "pre-paginated",
    pageSpread: "left",
  });
  const reflowable = makeSpine(1, "mixed-reflowable", {
    layout: "reflowable",
    flow: "paginated",
    pageSpread: "right",
  });
  const mixed: Publication = {
    ...makePublication(),
    spine: [fixed, reflowable],
    manifest: [fixed, reflowable].map((item) => ({
      id: item.idref,
      sourceHref: item.href.replace("EPUB/", ""),
      href: item.href,
      path: item.path,
      remote: false,
      mediaType: item.mediaType,
      properties: [],
    })),
  };
  const fixedPlan = planRendition({
    publication: mixed,
    spineItem: fixed,
    viewport: { width: 1400, height: 900 },
    policy: SPREAD_CAPABLE_POLICY,
  });
  const reflowPlan = planRendition({
    publication: mixed,
    spineItem: reflowable,
    viewport: { width: 1400, height: 900 },
    policy: SPREAD_CAPABLE_POLICY,
  });
  assert(
    fixedPlan.renderer === "fixed-layout",
    "fixed slot must retain its own renderer",
  );
  assert(
    reflowPlan.renderer === "reflowable-paginated",
    "reflowable slot must retain its own renderer",
  );
  assert(
    fixedPlan.spread.mode === "double" && reflowPlan.spread.mode === "double",
    "both slots should independently request the authored true-spread composition",
  );
}

console.log("Rendition planner unit test: PASS");
