import type { Publication } from '../publication';
import type { RendererContentDocument } from '../renderer';
import type { ReaderNavigator } from './navigator';
import { isFootnoteReference, type FootnoteLinkActivation } from './footnote';

export interface PublicationLinkRouterOptions {
  /** Host application decides whether/how external URLs open. Native iframe navigation stays blocked. */
  readonly onExternalLink?: (href: string) => void;
  readonly onUnresolvedPublicationLink?: (href: string) => void;
  /** Return true when the host displayed the referenced note without navigation. */
  readonly onFootnoteLink?: (activation: FootnoteLinkActivation) => boolean | Promise<boolean>;
}

/** Routes authored EPUB hyperlinks through ReaderNavigator instead of allowing iframe replacement. */
export class PublicationLinkRouter {
  private readonly cleanups = new Map<Document, () => void>();

  constructor(
    private readonly publication: Publication,
    private readonly navigator: Pick<ReaderNavigator, 'goTo'>,
    private readonly options: PublicationLinkRouterOptions = {},
    private readonly navigateInternal?: (href: string) => Promise<unknown>,
  ) {}

  syncDocuments(contexts: readonly RendererContentDocument[]): void {
    const live = new Set(contexts.map(context => context.document));
    for (const [document, cleanup] of this.cleanups) {
      if (!live.has(document)) {
        cleanup();
        this.cleanups.delete(document);
      }
    }
    for (const context of contexts) {
      if (this.cleanups.has(context.document)) continue;
      this.cleanups.set(context.document, this.attach(context));
    }
  }

  dispose(): void {
    for (const cleanup of this.cleanups.values()) cleanup();
    this.cleanups.clear();
  }

  private attach(context: RendererContentDocument): () => void {
    const listener = (event: Event) => {
      const anchor = closestAnchor(event.target);
      if (!anchor) return;
      const href = anchor.getAttribute('data-epub-href');
      if (!href) return;
      event.preventDefault();

      if (hasExternalScheme(href)) {
        this.options.onExternalLink?.(href);
        return;
      }
      void this.activateInternal(anchor, href);
    };
    context.document.addEventListener('click', listener, true);
    return () => context.document.removeEventListener('click', listener, true);
  }

  private async activateInternal(anchor: Element, href: string): Promise<void> {
    if (isFootnoteReference(anchor) && this.options.onFootnoteLink) {
      try {
        const handled = await this.options.onFootnoteLink({
          href,
          label: anchor.textContent?.replace(/\s+/gu, ' ').trim() ?? '',
          trigger: anchor as HTMLElement,
        });
        if (handled) return;
      } catch {
        // A malformed or unavailable note degrades to ordinary navigation.
      }
    }
    const resource = stripFragment(href);
    const inSpine = this.publication.spine.some(item => stripFragment(item.href) === resource);
    if (!inSpine) {
      this.options.onUnresolvedPublicationLink?.(href);
      return;
    }
    const navigation = this.navigateInternal
      ? this.navigateInternal(href)
      : this.navigator.goTo({ kind: 'href', href });
    void navigation.catch(() => {
      this.options.onUnresolvedPublicationLink?.(href);
    });
  }
}

function closestAnchor(target: EventTarget | null): Element | null {
  if (!target || typeof target !== 'object') return null;
  const node = target as Node;
  const element = node.nodeType === 1 ? node as Element : node.parentElement;
  return element?.closest('a[data-epub-href]') ?? null;
}

function stripFragment(href: string): string {
  const index = href.indexOf('#');
  return index < 0 ? href : href.slice(0, index);
}

function hasExternalScheme(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/iu.test(href);
}
