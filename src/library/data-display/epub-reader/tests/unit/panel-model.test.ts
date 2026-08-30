import type { ReaderMark, TocItem } from '../../core';
import { chapterContext, groupMarksByChapter, tocItemCount } from '../../react/panel-model';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Panel model test failed: ${message}`);
}

const toc: readonly TocItem[] = [{
  label: 'Part one',
  children: [
    { label: 'Opening', href: 'text/a.xhtml', children: [] },
    { label: 'Middle', href: 'text/b.xhtml#start', children: [] },
    { label: 'Later', href: 'text/b.xhtml#later', children: [] },
  ],
}];

const marks: readonly ReaderMark[] = [
  { id: 'b', kind: 'bookmark', locator: { href: 'text/b.xhtml', spineIndex: 2, locations: {} }, createdAt: '', updatedAt: '' },
  { id: 'a', kind: 'bookmark', locator: { href: 'text/a.xhtml', spineIndex: 1, locations: {} }, createdAt: '', updatedAt: '' },
  { id: 'b2', kind: 'bookmark', locator: { href: 'text/b.xhtml#later', spineIndex: 2, locations: {} }, createdAt: '', updatedAt: '' },
];

assert(tocItemCount(toc) === 4, 'nested TOC entries must be counted');
assert(chapterContext(toc, 'text/b.xhtml#other', 2).label === 'Middle', 'fragments must resolve to the same chapter');
assert(chapterContext(toc, 'text/b.xhtml', 2).path.join(' / ') === 'Part one / Middle', 'chapter ancestry must be retained');
assert(chapterContext(toc, 'text/b.xhtml#start', 2).label === 'Middle', 'an exact fragment must select its own TOC entry');
assert(chapterContext(toc, 'text/b.xhtml#later', 2).label === 'Later', 'distinct anchors in one document must retain distinct chapter context');
const groups = groupMarksByChapter(marks, toc);
assert(groups.length === 3, 'marks at distinct TOC anchors in one document must remain distinguishable');
assert(groups[0]?.chapter.label === 'Opening' && groups[1]?.chapter.label === 'Middle' && groups[2]?.chapter.label === 'Later', 'groups must follow reading and anchor order');

console.log('Panel model unit test: PASS');
