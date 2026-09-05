import { BUILT_IN_READER_TOOL_MANIFEST } from "../../react/tools/built-in-reader-tool-manifest";
import {
  readerSurfaceForSource,
  surfaceReturnFocus,
  type ReaderSurface,
} from "../../react/chrome/reader-surface-model";
import { placeMarkPopover } from "../../react/overlays/mark-popover-position";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Reader UI contract test failed: ${message}`);
}

const expectedToolIds = [
  "contents",
  "search",
  "marks",
  "settings",
  "compatibility",
  "help",
];
assert(
  BUILT_IN_READER_TOOL_MANIFEST.map((panel) => panel.id).join(",") ===
    expectedToolIds.join(","),
  "the default reader tools and their stable order must remain observable during modularization",
);
assert(
  new Set(BUILT_IN_READER_TOOL_MANIFEST.map((panel) => panel.id)).size ===
    BUILT_IN_READER_TOOL_MANIFEST.length,
  "default tool ids must be unique",
);
for (const panel of BUILT_IN_READER_TOOL_MANIFEST) {
  assert(panel.label.trim() !== "", `${panel.id} must have a panel label`);
  assert(
    panel.shortLabel.trim() !== "",
    `${panel.id} must have a compact label`,
  );
  assert(
    panel.description.trim() !== "",
    `${panel.id} must have a panel description`,
  );
}

const directFocus = { id: "direct" } as unknown as HTMLElement;
const activationFocus = { id: "activation" } as unknown as HTMLElement;
const imageTrigger = { id: "image" } as unknown as HTMLElement;
const firstSource = new Uint8Array([1]);
const secondSource = new Uint8Array([2]);
assert(
  surfaceReturnFocus({
    kind: "panel",
    panel: "contents",
    returnFocus: directFocus,
  }) === directFocus,
  "a panel must return focus to the control that opened it",
);
assert(
  surfaceReturnFocus({
    kind: "footnote",
    source: new Uint8Array(),
    footnote: {},
    returnFocus: directFocus,
  } as ReaderSurface) === directFocus,
  "a footnote must retain its explicit return target",
);
assert(
  surfaceReturnFocus({
    kind: "external-link",
    source: new Uint8Array(),
    target: {},
    returnFocus: directFocus,
  } as ReaderSurface) === directFocus,
  "external-link confirmation must retain its explicit return target",
);
assert(
  surfaceReturnFocus({
    kind: "selection",
    source: firstSource,
    activation: { returnFocus: activationFocus },
  } as ReaderSurface) === activationFocus,
  "selection tools must return to their publication surface",
);
assert(
  surfaceReturnFocus({
    kind: "mark",
    source: firstSource,
    activation: { returnFocus: activationFocus },
  } as ReaderSurface) === activationFocus,
  "mark tools must return to their activation target",
);
assert(
  surfaceReturnFocus({
    kind: "image",
    source: firstSource,
    activation: { trigger: imageTrigger },
  } as ReaderSurface) === imageTrigger,
  "the image viewer must return to its image trigger",
);
assert(
  surfaceReturnFocus({ kind: "none" }) === null,
  "an empty surface has no focus target",
);
for (const kind of ["selection", "mark", "image"] as const) {
  const surface = {
    kind,
    source: firstSource,
    activation: {},
  } as unknown as ReaderSurface;
  assert(
    readerSurfaceForSource(surface, firstSource) === surface,
    `${kind} surface must remain live for its owning publication`,
  );
  assert(
    readerSurfaceForSource(surface, secondSource).kind === "none",
    `${kind} surface must close when the publication source changes`,
  );
}

const belowPlacement = placeMarkPopover(
  { x: 190, y: 80 },
  { width: 380, height: 520 },
  { width: 336, height: 300 },
);
assert(
  belowPlacement.side === "below" && belowPlacement.top === 90,
  "a mark editor should open below its anchor when space is available",
);
const abovePlacement = placeMarkPopover(
  { x: 370, y: 470 },
  { width: 380, height: 520 },
  { width: 336, height: 300 },
);
assert(
  abovePlacement.side === "above" &&
    abovePlacement.left === 32 &&
    abovePlacement.top === 160,
  "a mark editor should flip and remain inside the right and bottom edges",
);
const constrainedPlacement = placeMarkPopover(
  { x: 8, y: 100 },
  { width: 300, height: 220 },
  { width: 276, height: 340 },
);
assert(
  constrainedPlacement.left === 12 &&
    constrainedPlacement.top === 12 &&
    constrainedPlacement.maxHeight === 196,
  "a tall mark editor should clamp to a short viewport and become scrollable",
);

console.log("Reader UI contract unit test: PASS");
