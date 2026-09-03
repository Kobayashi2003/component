import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Landmark, Locator, Publication, TocItem } from '../../core';
import { useOptionalEpubReaderContext } from '../reader/context';
import type { EpubReaderHandle } from '../state/model';
import { publicationContentsKey, readCollapsedSections, writeCollapsedSections } from './contents/collapse-state';
import { chapterContext, documentHref, locatorHref, tocItemCount, tocItemForHref } from './panel-model';

type NavigationView = 'contents' | 'pages' | 'landmarks' | 'history';

export function EpubContents({ reader: explicit }: { readonly reader?: EpubReaderHandle }) {
  const contextual = useOptionalEpubReaderContext();
  const reader = explicit ?? contextual;
  if (!reader) throw new Error('<EpubContents> requires a reader prop or EpubReaderProvider.');
  const snapshot = reader.state.reader;
  if (!snapshot) return null;
  const publicationKey = publicationContentsKey(snapshot.publication);
  return <EpubContentsView key={publicationKey} reader={reader} publication={snapshot.publication} publicationKey={publicationKey} />;
}

interface EpubContentsViewProps {
  readonly reader: EpubReaderHandle;
  readonly publication: Publication;
  readonly publicationKey: string;
}

function EpubContentsView({ reader, publication, publicationKey }: EpubContentsViewProps) {
  const snapshot = reader.state.reader!;
  const { toc, pageList, landmarks } = publication.navigation;
  const currentLocator = snapshot.locator;
  const currentHref = currentLocator ? locatorHref(currentLocator) : undefined;
  const activeItem = useMemo(() => tocItemForHref(toc, currentHref), [currentHref, toc]);
  const [view, setView] = useState<NavigationView>('contents');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => readCollapsedSections(publicationKey));
  const activeLinkRef = useRef<HTMLButtonElement | null>(null);
  const branchIds = useMemo(() => collectBranchIds(toc), [toc]);
  const history = snapshot.navigationHistory;

  useEffect(() => {
    if (view === 'contents') activeLinkRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeItem, view]);

  const updateCollapsed = (next: ReadonlySet<string>) => {
    setCollapsed(next);
    writeCollapsedSections(publicationKey, next);
  };
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateCollapsed(next);
  };

  const tabs: readonly { readonly id: NavigationView; readonly label: string; readonly count: number }[] = [
    { id: 'contents', label: 'Contents', count: tocItemCount(toc) },
    { id: 'pages', label: 'Pages', count: pageList.length },
    { id: 'landmarks', label: 'Landmarks', count: landmarks.length },
    { id: 'history', label: 'History', count: history.backCount + history.forwardCount },
  ];

  return (
    <nav className="epub-reader-panel epub-contents" aria-label="Publication navigation">
      <div className="epub-contents__tabs" role="tablist" aria-label="Publication navigation views">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={view === tab.id}
            aria-controls={`epub-navigation-${tab.id}`}
            onClick={() => setView(tab.id)}
          >
            <span>{tab.label}</span>
            <small>{tab.count}</small>
          </button>
        ))}
      </div>

      {view === 'contents' ? (
        <section id="epub-navigation-contents" role="tabpanel" className="epub-contents__toc">
          <div className="epub-contents__summary">
            <span>{tocItemCount(toc)} sections</span>
            {branchIds.length > 0 ? (
              <button type="button" onClick={() => updateCollapsed(collapsed.size ? new Set() : new Set(branchIds))}>
                {collapsed.size ? 'Expand all' : 'Collapse all'}
              </button>
            ) : null}
          </div>
          {toc.length > 0
            ? <TocItems items={toc} reader={reader} activeItem={activeItem} collapsed={collapsed} onToggle={toggle} path="toc" activeLinkRef={activeLinkRef} />
            : <p className="epub-reader-panel__empty">This publication does not provide a table of contents.</p>}
        </section>
      ) : null}

      {view === 'pages' ? (
        <section id="epub-navigation-pages" role="tabpanel">
          <NavigationEntries
            entries={pageList}
            empty="This publication does not provide a page list."
            currentHref={currentHref}
            label={item => item.label}
            meta={() => 'Page'}
            onActivate={item => void reader.goTo({ kind: 'href', href: item.href })}
          />
        </section>
      ) : null}

      {view === 'landmarks' ? (
        <section id="epub-navigation-landmarks" role="tabpanel">
          <NavigationEntries
            entries={landmarks}
            empty="This publication does not provide landmarks."
            currentHref={currentHref}
            label={item => item.label || landmarkLabel(item)}
            meta={item => item.types.join(' · ')}
            onActivate={item => void reader.goTo({ kind: 'href', href: item.href })}
          />
        </section>
      ) : null}

      {view === 'history' ? (
        <section id="epub-navigation-history" role="tabpanel" className="epub-contents__history">
          {history.back.length === 0 && history.forward.length === 0
            ? <p className="epub-reader-panel__empty">Locations opened from search, marks, and publication navigation will appear here.</p>
            : (
              <>
                <HistoryGroup direction="back" label="Previous locations" locations={[...history.back].reverse()} toc={toc} reader={reader} />
                <HistoryGroup direction="forward" label="Forward locations" locations={[...history.forward].reverse()} toc={toc} reader={reader} />
              </>
            )}
        </section>
      ) : null}
    </nav>
  );
}

interface TocItemsProps {
  readonly items: readonly TocItem[];
  readonly reader: EpubReaderHandle;
  readonly activeItem: TocItem | null;
  readonly collapsed: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly path: string;
  readonly activeLinkRef: RefObject<HTMLButtonElement | null>;
}

function TocItems({ items, reader, activeItem, collapsed, onToggle, path, activeLinkRef }: TocItemsProps) {
  return (
    <ol>
      {items.map((item, index) => {
        const id = item.id ?? `${path}:${index}:${item.label}`;
        const active = item === activeItem;
        const activeBranch = active || containsItem(item.children, activeItem);
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
                ? <button ref={active ? activeLinkRef : undefined} className="epub-contents__link" type="button" aria-current={active ? 'location' : undefined} onClick={() => void reader.goTo({ kind: 'href', href: item.href! })}>{item.label}</button>
                : <span className="epub-contents__label">{item.label}</span>}
            </div>
            {item.children.length > 0 && !isCollapsed
              ? <TocItems items={item.children} reader={reader} activeItem={activeItem} collapsed={collapsed} onToggle={onToggle} path={id} activeLinkRef={activeLinkRef} />
              : null}
          </li>
        );
      })}
    </ol>
  );
}

interface NavigationEntry {
  readonly href: string;
}

interface NavigationEntriesProps<T extends NavigationEntry> {
  readonly entries: readonly T[];
  readonly empty: string;
  readonly currentHref?: string;
  readonly label: (entry: T) => string;
  readonly meta: (entry: T) => string;
  readonly onActivate: (entry: T) => void;
}

function NavigationEntries<T extends NavigationEntry>({ entries, empty, currentHref, label, meta, onActivate }: NavigationEntriesProps<T>) {
  if (entries.length === 0) return <p className="epub-reader-panel__empty">{empty}</p>;
  return (
    <ol className="epub-contents__entries">
      {entries.map((entry, index) => (
        <li key={`${entry.href}:${index}`}>
          <button type="button" aria-current={navigationEntryIsCurrent(entry.href, currentHref) ? 'location' : undefined} onClick={() => onActivate(entry)}>
            <strong>{label(entry)}</strong>
            <small>{meta(entry)}</small>
          </button>
        </li>
      ))}
    </ol>
  );
}

function HistoryGroup({ direction, label, locations, toc, reader }: { readonly direction: 'back' | 'forward'; readonly label: string; readonly locations: readonly Locator[]; readonly toc: readonly TocItem[]; readonly reader: EpubReaderHandle }) {
  if (locations.length === 0) return null;
  return (
    <section className="epub-contents__history-group" aria-label={label}>
      <header><strong>{label}</strong><small>{locations.length}</small></header>
      <ol className="epub-contents__entries">
        {locations.map((locator, index) => {
          const chapter = chapterContext(toc, locatorHref(locator), locator.spineIndex);
          const preview = locator.text?.highlight?.replace(/\s+/gu, ' ').trim();
          return (
            <li key={`${locator.href}:${locator.locations.cfi ?? locator.locations.fragment ?? locator.locations.progression ?? 0}:${index}`}>
              <button type="button" onClick={() => void reader.history[direction](index + 1)}>
                <span><strong>{chapter.label}</strong><small>{Math.round((locator.locations.progression ?? 0) * 100)}%</small></span>
                {preview ? <em>{preview}</em> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function navigationEntryIsCurrent(target: string, current?: string): boolean {
  if (!current) return false;
  return target.includes('#') ? target === current : documentHref(target) === documentHref(current);
}

function landmarkLabel(landmark: Landmark): string {
  return landmark.types.map(type => type.replace(/[-_]+/gu, ' ')).join(', ') || 'Landmark';
}

function containsItem(items: readonly TocItem[], target: TocItem | null): boolean {
  return target != null && items.some(item => item === target || containsItem(item.children, target));
}

function collectBranchIds(items: readonly TocItem[], path = 'toc'): readonly string[] {
  return items.flatMap((item, index) => {
    const id = item.id ?? `${path}:${index}:${item.label}`;
    return item.children.length > 0 ? [id, ...collectBranchIds(item.children, id)] : [];
  });
}
