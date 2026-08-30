import type { ReaderMark, TocItem } from '../core';

export interface ChapterContext {
  readonly label: string;
  readonly path: readonly string[];
  readonly spineIndex: number;
  readonly href?: string;
}

export interface MarkChapterGroup {
  readonly key: string;
  readonly chapter: ChapterContext;
  readonly marks: readonly ReaderMark[];
}

export function documentHref(href?: string): string {
  return href?.split('#', 1)[0] ?? '';
}

export function chapterContext(
  toc: readonly TocItem[],
  href: string | undefined,
  spineIndex: number,
): ChapterContext {
  const match = findTocMatch(toc, href);
  const path = match?.path ?? [`Section ${spineIndex + 1}`];
  return { label: path[path.length - 1]!, path, spineIndex, href: match?.item.href };
}

export function tocItemForHref(toc: readonly TocItem[], href?: string): TocItem | null {
  return findTocMatch(toc, href)?.item ?? null;
}

export function groupMarksByChapter(
  marks: readonly ReaderMark[],
  toc: readonly TocItem[],
): readonly MarkChapterGroup[] {
  const groups = new Map<string, { chapter: ChapterContext; marks: ReaderMark[] }>();
  for (const mark of marks) {
    const locator = mark.kind === 'bookmark' ? mark.locator : mark.range.start;
    const chapter = chapterContext(toc, locator.href, locator.spineIndex);
    const key = `${chapter.spineIndex}:${chapter.href ?? documentHref(locator.href)}`;
    const group = groups.get(key) ?? { chapter, marks: [] };
    group.marks.push(mark);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([, left], [, right]) => left.chapter.spineIndex - right.chapter.spineIndex)
    .map(([key, group]) => ({ key, ...group }));
}

export function tocItemCount(items: readonly TocItem[]): number {
  return items.reduce((count, item) => count + 1 + tocItemCount(item.children), 0);
}

interface TocMatch {
  readonly item: TocItem;
  readonly path: readonly string[];
}

function findTocMatch(toc: readonly TocItem[], href?: string): TocMatch | null {
  if (!href) return null;
  const targetDocument = documentHref(href);
  let exact: TocMatch | null = null;
  let documentFallback: TocMatch | null = null;

  const visit = (items: readonly TocItem[], parents: readonly string[]) => {
    for (const item of items) {
      const path = [...parents, item.label];
      if (item.href === href && !exact) exact = { item, path };
      if (item.href && documentHref(item.href) === targetDocument && !documentFallback) {
        documentFallback = { item, path };
      }
      visit(item.children, path);
    }
  };
  visit(toc, []);
  return exact ?? documentFallback;
}
