import type { ReaderMark, SearchHit, TocItem } from "../../core";
import {
  chapterContext,
  filterMarks,
  groupMarksByChapter,
  groupSearchHitsByChapter,
  locatorHref,
  markLocator,
  markPreview,
  tocItemCount,
} from "../../react/panels/panel-model";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Panel model test failed: ${message}`);
}

const toc: readonly TocItem[] = [
  {
    label: "Part one",
    children: [
      { label: "Opening", href: "text/a.xhtml", children: [] },
      { label: "Middle", href: "text/b.xhtml#start", children: [] },
      { label: "Later", href: "text/b.xhtml#later", children: [] },
    ],
  },
];

const marks: readonly ReaderMark[] = [
  {
    id: "b",
    kind: "bookmark",
    locator: { href: "text/b.xhtml", spineIndex: 2, locations: {} },
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "a",
    kind: "bookmark",
    locator: { href: "text/a.xhtml", spineIndex: 1, locations: {} },
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "b2",
    kind: "bookmark",
    locator: { href: "text/b.xhtml#later", spineIndex: 2, locations: {} },
    createdAt: "",
    updatedAt: "",
  },
];

assert(tocItemCount(toc) === 4, "nested TOC entries must be counted");
assert(
  chapterContext(toc, "text/b.xhtml#other", 2).label === "Middle",
  "fragments must resolve to the same chapter",
);
assert(
  chapterContext(toc, "text/b.xhtml", 2).path.join(" / ") ===
    "Part one / Middle",
  "chapter ancestry must be retained",
);
assert(
  chapterContext(toc, "text/b.xhtml#start", 2).label === "Middle",
  "an exact fragment must select its own TOC entry",
);
assert(
  chapterContext(toc, "text/b.xhtml#later", 2).label === "Later",
  "distinct anchors in one document must retain distinct chapter context",
);
const groups = groupMarksByChapter(marks, toc);
assert(
  groups.length === 3,
  "marks at distinct TOC anchors in one document must remain distinguishable",
);
assert(
  groups[0]?.chapter.label === "Opening" &&
    groups[1]?.chapter.label === "Middle" &&
    groups[2]?.chapter.label === "Later",
  "groups must follow reading and anchor order",
);

const previewMark: ReaderMark = {
  id: "highlight",
  kind: "highlight",
  range: {
    start: {
      href: "text/a.xhtml",
      spineIndex: 1,
      locations: { progression: 0.25 },
      text: { highlight: "A durable content preview" },
    },
    end: {
      href: "text/a.xhtml",
      spineIndex: 1,
      locations: { progression: 0.3 },
    },
  },
  color: "yellow",
  highlight: "solid",
  createdAt: "",
  updatedAt: "",
};
assert(
  filterMarks([...marks, previewMark], "highlight").length === 1,
  "mark filters should expose one kind without changing source order",
);
assert(
  markLocator(previewMark).locations.progression === 0.25,
  "mark navigation should use the range start consistently",
);
assert(
  markPreview(previewMark) === "A durable content preview",
  "mark previews should fall back to locator text context",
);

const searchHits: readonly SearchHit[] = [
  searchHit("one", "text/a.xhtml", 1),
  searchHit("two", "text/b.xhtml", 2, "later"),
  searchHit("three", "text/b.xhtml", 2, "later"),
];
const searchGroups = groupSearchHitsByChapter(searchHits, toc);
assert(
  searchGroups.length === 2,
  "search hits should be grouped by their closest TOC chapter",
);
assert(
  searchGroups[1]?.chapter.label === "Later" &&
    searchGroups[1]?.results[0]?.index === 1,
  "search groups must preserve global result indexes and fragment context",
);
assert(
  locatorHref(searchHits[1]!.range.start) === "text/b.xhtml#later",
  "locator fragments should participate in navigation grouping",
);

function searchHit(
  id: string,
  href: string,
  spineIndex: number,
  fragment?: string,
): SearchHit {
  const locator = { href, spineIndex, locations: fragment ? { fragment } : {} };
  return {
    id,
    query: "a",
    spineIndex,
    href,
    range: { start: locator, end: locator },
    excerpt: "a",
    excerptMatchStart: 0,
    excerptMatchEnd: 1,
    match: "a",
  };
}

console.log("Panel model unit test: PASS");
