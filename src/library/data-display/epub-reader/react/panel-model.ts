import type { ReaderMark, TocItem } from '../core';

export interface ChapterContext {
  readonly label: string;
  readonly path: readonly string[];
  readonly spineIndex: number;
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
  const target = documentHref(href);
  let best: readonly string[] | null = null;

  const visit = (items: readonly TocItem[], parents: readonly string[]) => {
    for (const item of items) {
      const path = [...parents, item.label];
      if (item.href && documentHref(item.href) === target) best = path;
      visit(item.children, path);
    }
  };
  visit(toc, []);

  const path = best ?? [`Section ${spineIndex + 1}`];
  return { label: path[path.length - 1]!, path, spineIndex };
}

export function groupMarksByChapter(
  marks: readonly ReaderMark[],
  toc: readonly TocItem[],
): readonly MarkChapterGroup[] {
  const groups = new Map<string, { chapter: ChapterContext; marks: ReaderMark[] }>();
  for (const mark of marks) {
    const locator = mark.kind === 'bookmark' ? mark.locator : mark.range.start;
    const chapter = chapterContext(toc, locator.href, locator.spineIndex);
    const key = `${chapter.spineIndex}:${documentHref(locator.href)}`;
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
