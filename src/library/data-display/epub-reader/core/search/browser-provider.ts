import type { BrowserXmlPlatform } from '../content';
import { BrowserDomXmlPlatform, parseXhtmlContentDocument } from '../content';
import { createCompositeLocator } from '../locator';
import type { Publication } from '../publication';
import type { PublicationResourceSession } from '../resources';
import { decodePublicationText } from '../resources';
import { buildSemanticTextProjection, type SemanticTextSegment } from '../text';
import type { SearchDocument, SearchDocumentProvider } from './model';

export class BrowserPublicationSearchProvider implements SearchDocumentProvider {
  constructor(
    private readonly publication: Publication,
    private readonly resources: PublicationResourceSession,
    ownerDocument: Document,
    private readonly xmlPlatform: BrowserXmlPlatform = new BrowserDomXmlPlatform(ownerDocument),
  ) {}

  async load(spineIndex: number, signal: AbortSignal): Promise<SearchDocument | null> {
    throwIfAborted(signal);
    const document = await this.build(spineIndex);
    throwIfAborted(signal);
    return document;
  }

  private async build(spineIndex: number): Promise<SearchDocument | null> {
    const item = this.publication.spine[spineIndex];
    if (!item?.path || item.remote) return null;
    const media = item.mediaType.split(';', 1)[0]?.trim().toLowerCase();
    if (media !== 'application/xhtml+xml' && media !== 'text/html' && media !== 'image/svg+xml') return null;
    const read = await this.resources.resolver.read('', item.path);
    if (!read.resource) return null;
    const source = decodePublicationText(read.resource.bytes, read.resource.mediaType);
    const parsedContent = media === 'image/svg+xml'
      ? { document: this.xmlPlatform.parseXml(source, 'image/svg+xml'), diagnostics: [] }
      : parseXhtmlContentDocument(source, item.path, item.index, this.xmlPlatform);
    const parsed = parsedContent.document;
    if (media === 'image/svg+xml' && (parsed.documentElement?.localName === 'parsererror' || parsed.getElementsByTagName('parsererror').length > 0)) {
      throw new Error(`Search content document is not well-formed XML: ${item.path}.`);
    }
    removeExecutableScripts(parsed);
    const root = parsed.body ?? parsed.documentElement;
    if (!root) return null;
    const projection = buildSemanticTextProjection(parsed, root);
    const text = projection.text;

    return {
      spineIndex,
      href: item.href,
      text,
      diagnostics: parsedContent.diagnostics,
      locatorRange: (start, end) => {
        const startPoint = pointAt(projection.segments, Math.max(0, Math.min(text.length, start)), false);
        const endPoint = pointAt(projection.segments, Math.max(0, Math.min(text.length, end)), true);
        if (!startPoint || !endPoint) {
          const base = { href: item.href, spineIndex, locations: { progression: text.length ? start / text.length : 0 } };
          return { start: base, end: { ...base, locations: { progression: text.length ? end / text.length : 0 } } };
        }
        return {
          start: createCompositeLocator(parsed, this.publication, spineIndex, item.href, text.length ? start / text.length : 0, startPoint),
          end: createCompositeLocator(parsed, this.publication, spineIndex, item.href, text.length ? end / text.length : 0, endPoint),
        };
      },
    };
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException('Search aborted.', 'AbortError');
}

function pointAt(segments: readonly SemanticTextSegment[], offset: number, endBias: boolean) {
  if (segments.length === 0) return null;
  let segment = segments.find(candidate => offset >= candidate.start && offset <= candidate.end);
  if (!segment) {
    if (endBias) segment = [...segments].reverse().find(candidate => candidate.end <= offset);
    else segment = segments.find(candidate => candidate.start >= offset);
  }
  segment ??= endBias ? segments[segments.length - 1]! : segments[0]!;
  const local = Math.max(0, Math.min(segment.sourceBoundaries.length - 1, offset - segment.start));
  return { node: segment.node, offset: segment.sourceBoundaries[local] ?? 0 };
}

function removeExecutableScripts(document: Document): void {
  for (const script of Array.from(document.getElementsByTagName('script'))) script.remove();
  for (const script of Array.from(document.getElementsByTagNameNS('http://www.w3.org/2000/svg', 'script'))) script.remove();
}
