import {
  DEFAULT_READER_PREFERENCES,
  parseReadingSessionRecord,
  type ReadingSessionRecord,
} from "../../core";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const timestamp = "2026-09-03T00:00:00.000Z";
const locator = {
  href: "EPUB/chapter.xhtml",
  spineIndex: 0,
  locations: {
    cfi: "epubcfi(/6/2!/4/2/1:0)",
    progression: 0.25,
    dom: { path: [1, 0], offset: 0, nodeType: "text" as const },
  },
  text: { before: "before", highlight: "selected", after: "after" },
};

const current: ReadingSessionRecord = {
  locator,
  preferences: DEFAULT_READER_PREFERENCES,
  marks: [
    {
      id: "bookmark:1",
      kind: "bookmark",
      locator,
      label: "Start",
      tags: ["review"],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "highlight:1",
      kind: "highlight",
      range: { start: locator, end: locator },
      color: "yellow",
      highlight: "solid",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "annotation:1",
      kind: "annotation",
      range: { start: locator, end: locator },
      body: "Note",
      color: "blue",
      highlight: "underline",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  updatedAt: timestamp,
};

assert(
  parseReadingSessionRecord(current)?.marks.length === 3,
  "the exact current Reading Session shape must load",
);
assert(
  parseReadingSessionRecord({ locator, marks: [], updatedAt: timestamp }) !==
    null,
  "preferences remain optional when persistence is disabled",
);

const invalidRecords: readonly [unknown, string][] = [
  [{ ...current, legacyVersion: 1 }, "unknown top-level fields"],
  [{ ...current, updatedAt: "not-a-date" }, "invalid timestamps"],
  [
    { ...current, locator: { ...locator, locations: { progression: 1.5 } } },
    "out-of-range locator progressions",
  ],
  [
    {
      ...current,
      locator: {
        ...locator,
        locations: { dom: { path: [-1], offset: 0, nodeType: "text" } },
      },
    },
    "invalid DOM paths",
  ],
  [
    {
      ...current,
      preferences: { ...DEFAULT_READER_PREFERENCES, fontSizePercent: "100" },
    },
    "malformed preference values",
  ],
  [
    {
      ...current,
      preferences: {
        ...DEFAULT_READER_PREFERENCES,
        compatibility: { recoverContainerStructure: true },
      },
    },
    "partial compatibility preferences",
  ],
  [
    {
      ...current,
      marks: [
        {
          id: "highlight:broken",
          kind: "highlight",
          range: { start: locator, end: locator },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    },
    "partial highlights",
  ],
  [
    {
      ...current,
      marks: [
        {
          id: "bookmark:broken",
          kind: "bookmark",
          locator,
          tags: [1],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    },
    "malformed tags",
  ],
];

for (const [record, label] of invalidRecords) {
  assert(
    parseReadingSessionRecord(record) === null,
    `the codec must reject ${label}`,
  );
}

console.log("Reading session codec unit test: PASS");
