import { useMemo, useState } from 'react';
import type { TocItem } from '../core';
import { useOptionalEpubReaderContext } from './context';
import type { EpubReaderHandle } from './model';
import { documentHref, tocItemCount } from './panel-model';

const EMPTY_TOC: readonly TocItem[] = [];

export function EpubContents({ reader: explicit }: { readonly reader?: EpubReaderHandle }) {
  const contextual = useOptionalEpubReaderContext();
  const reader = explicit ?? contextual;
  if (!reader) throw new Error('<EpubContents> requires a reader prop or EpubReaderProvider.');
  const toc = reader.state.reader?.publication.navigation.toc ?? EMPTY_TOC;
  const currentHref = reader.state.reader?.locator?.href;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set<string>());
  const branchIds = useMemo(() => collectBranchIds(toc), [toc]);
  const toggle = (id: string) => setCollapsed(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  return (
    <nav className="epub-reader-panel epub-contents" aria-label="Table of contents">
      <div className="epub-contents__summary">
        <span>{tocItemCount(toc)} sections</span>
        {branchIds.length > 0 ? (
          <button type="button" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(branchIds))}>
            {collapsed.size ? 'Expand all' : 'Collapse all'}
          </button>
        ) : null}
      </div>
      {toc.length > 0
        ? <TocItems items={toc} reader={reader} currentHref={currentHref} collapsed={collapsed} onToggle={toggle} path="toc" />
        : <p className="epub-reader-panel__empty">This publication does not provide a table of contents.</p>}
    </nav>
  );
}

interface TocItemsProps {
  readonly items: readonly TocItem[];
  readonly reader: EpubReaderHandle;
  readonly currentHref?: string;
  readonly collapsed: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly path: string;
}

function TocItems({ items, reader, currentHref, collapsed, onToggle, path }: TocItemsProps) {
  return (
    <ol>
      {items.map((item, index) => {
        const id = item.id ?? `${path}:${index}:${item.label}`;
        const active = sameDocument(item.href, currentHref);
        const activeBranch = active || containsDocument(item.children, currentHref);
        const isCollapsed = collapsed.has(id) && !activeBranch;
        return (
          <li key={id} className={activeBranch ? 'is-current-branch' : undefined}>
            <div className="epub-contents__item">
              {item.children.length > 0 ? (
                <button className="epub-contents__disclosure" type="button" aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${item.label}`} aria-expanded={!isCollapsed} onClick={() => onToggle(id)}>
                  <span aria-hidden="true">›</span>
                </button>
              ) : <span className="epub-contents__leaf" aria-hidden="true" />}
              {item.href
                ? <button className="epub-contents__link" type="button" aria-current={active ? 'location' : undefined} onClick={() => void reader.goTo({ kind: 'href', href: item.href! })}>{item.label}</button>
                : <span className="epub-contents__label">{item.label}</span>}
            </div>
            {item.children.length > 0 && !isCollapsed
              ? <TocItems items={item.children} reader={reader} currentHref={currentHref} collapsed={collapsed} onToggle={onToggle} path={id} />
              : null}
          </li>
        );
      })}
    </ol>
  );
}

function sameDocument(left?: string, right?: string): boolean {
  return Boolean(left && right && documentHref(left) === documentHref(right));
}

function containsDocument(items: readonly TocItem[], href?: string): boolean {
  return items.some(item => sameDocument(item.href, href) || containsDocument(item.children, href));
}

function collectBranchIds(items: readonly TocItem[], path = 'toc'): readonly string[] {
  return items.flatMap((item, index) => {
    const id = item.id ?? `${path}:${index}:${item.label}`;
    return item.children.length > 0 ? [id, ...collectBranchIds(item.children, id)] : [];
  });
}
