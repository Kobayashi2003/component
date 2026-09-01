import { createCompositeLocator, resolveCompositeLocator } from '../locator';
import type { DomPoint } from '../locator';
import type { Locator, LocatorRange, Publication } from '../../epub/publication';
import type { RendererContentDocument } from '../../presentation/renderer';
import type { ReaderSelection } from './model';
import { buildSemanticTextProjection, isSemanticTextNode } from '../../epub/text';

/** Convert the browser Selection into durable locator endpoints without mutating EPUB DOM. */
export function captureReaderSelection(
  context: RendererContentDocument,
  publication: Publication,
  selection: Selection | null = getDocumentSelection(context.document),
): ReaderSelection | null {
  if (!selection || selection.rangeCount === 0) return null;
  const native = selection.getRangeAt(0);
  if (!containsNode(context.document, native.startContainer) || !containsNode(context.document, native.endContainer)) return null;

  const startPoint = normalizePoint(native.startContainer, native.startOffset);
  const endPoint = normalizePoint(native.endContainer, native.endOffset);
  if (!startPoint || !endPoint) return null;

  const start = locatorForPoint(context, publication, startPoint);
  const end = locatorForPoint(context, publication, endPoint);
  const text = native.toString();
  return { range: { start, end }, text, collapsed: native.collapsed };
}

/** XMLDocument does not consistently expose Document.getSelection in browsers. */
export function getDocumentSelection(document: Document): Selection | null {
  const documentSelection = typeof document.getSelection === 'function'
    ? document.getSelection()
    : null;
  return documentSelection ?? document.defaultView?.getSelection() ?? null;
}


export function captureSelectionFromDocuments(
  contexts: readonly RendererContentDocument[],
  publication: Publication,
): ReaderSelection | null {
  for (const context of contexts) {
    const captured = captureReaderSelection(context, publication);
    if (captured && (!captured.collapsed || captured.text)) return captured;
  }
  return null;
}

export function resolveLocatorRangeInDocument(
  context: RendererContentDocument,
  publication: Publication,
  range: LocatorRange,
): Range | null {
  const index = context.spineIndex;
  if (index < Math.min(range.start.spineIndex, range.end.spineIndex)
    || index > Math.max(range.start.spineIndex, range.end.spineIndex)) return null;

  const body = context.document.body ?? context.document.documentElement;
  if (!body) return null;
  const native = context.document.createRange();

  const startPoint = range.start.spineIndex === index
    ? resolvePoint(context, publication, range.start)
    : firstPoint(body);
  const endPoint = range.end.spineIndex === index
    ? resolvePoint(context, publication, range.end)
    : lastPoint(body);
  if (!startPoint || !endPoint) return null;

  try {
    native.setStart(startPoint.node, clampOffset(startPoint.node, startPoint.offset));
    native.setEnd(endPoint.node, clampOffset(endPoint.node, endPoint.offset));
    return native;
  } catch {
    native.detach?.();
    return null;
  }
}

function locatorForPoint(
  context: RendererContentDocument,
  publication: Publication,
  point: DomPoint,
): Locator {
  return createCompositeLocator(
    context.document,
    publication,
    context.spineIndex,
    context.href,
    estimateTextProgression(context.document, point),
    point,
  );
}

function resolvePoint(
  context: RendererContentDocument,
  publication: Publication,
  locator: Locator,
): DomPoint | null {
  if (locator.spineIndex !== context.spineIndex || locator.href !== context.href) return null;
  return resolveCompositeLocator(context.document, publication, context.spineIndex, locator).point;
}

function estimateTextProgression(document: Document, point: DomPoint): number {
  const projection = buildSemanticTextProjection(document);
  if (!projection.text) return 0;
  if (point.node.nodeType === 3 && isSemanticTextNode(point.node as Text)) {
    const entry = projection.segments.find(candidate => candidate.node === point.node);
    if (entry) {
      const sourceOffset = Math.max(0, Math.min((point.node as Text).data.length, point.offset));
      let normalized = 0;
      for (let i = 0; i < entry.sourceBoundaries.length; i += 1) {
        if ((entry.sourceBoundaries[i] ?? 0) <= sourceOffset) normalized = i;
        else break;
      }
      return Math.max(0, Math.min(1, (entry.start + normalized) / projection.text.length));
    }
  }
  const root = document.body ?? document.documentElement;
  if (!root) return 0;
  try {
    const range = document.createRange();
    range.setStart(root, 0);
    range.setEnd(point.node, clampOffset(point.node, point.offset));
    const prefix = range.cloneContents();
    range.detach?.();
    const temp = document.implementation.createHTMLDocument('');
    temp.body.appendChild(temp.importNode(prefix, true));
    const before = buildSemanticTextProjection(temp).text.length;
    return Math.max(0, Math.min(1, before / projection.text.length));
  } catch {
    return 0;
  }
}

function normalizePoint(node: Node, offset: number): DomPoint | null {
  if (node.nodeType === 3) return { node, offset: clampOffset(node, offset) };
  if (node.nodeType === 1) return { node, offset: clampOffset(node, offset) };
  return null;
}

function containsNode(document: Document, node: Node): boolean {
  return node === document || document.documentElement?.contains(node) === true;
}

function firstPoint(root: Node): DomPoint {
  const doc = root.ownerDocument!;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (isSemanticTextNode(node) && node.data.trim()) return { node, offset: 0 };
  }
  return { node: root, offset: 0 };
}

function lastPoint(root: Node): DomPoint {
  const doc = root.ownerDocument!;
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  let last: Node | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (isSemanticTextNode(node) && node.data.trim()) last = node;
  }
  if (last?.nodeType === 3) return { node: last, offset: (last as Text).data.length };
  return { node: root, offset: root.childNodes.length };
}

function clampOffset(node: Node, offset: number): number {
  const max = node.nodeType === 3 ? (node as Text).data.length : node.childNodes.length;
  return Math.max(0, Math.min(max, offset));
}
