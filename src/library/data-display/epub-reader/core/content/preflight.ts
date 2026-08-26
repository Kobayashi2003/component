import type { PublicationArchive } from '../archive';
import {
  resolvePublicationReference,
  resolveSpineRendition,
  type ContentPageProfile,
  type ContentPresentationHints,
  type IntrinsicViewport,
  type Publication,
  type PublicationDiagnostic,
  type PublicationPath,
  type TextDirection,
  type WritingMode,
} from '../publication';
import { parseXml, type XmlElementNode } from '../xml';
import { semanticXmlText } from '../text';

export interface PublicationContentPreflightResult {
  readonly hints: ReadonlyMap<number, ContentPresentationHints>;
  readonly diagnostics: readonly PublicationDiagnostic[];
}

/**
 * Inspect content before the first renderer plan. This intentionally handles a
 * narrow but high-value CSS subset (html/body class/id + writing-mode/direction)
 * so Japanese EPUB templates such as `.vrtl` do not begin with a false
 * horizontal plan and then self-correct only after iframe layout.
 */
export async function preflightPublicationContent(
  archive: PublicationArchive,
  publication: Publication,
  signal: AbortSignal = new AbortController().signal,
): Promise<PublicationContentPreflightResult> {
  const hints = new Map<number, ContentPresentationHints>();
  const diagnostics: PublicationDiagnostic[] = [];
  const stylesheetCache = new Map<PublicationPath, Promise<string>>();
  const results = await mapWithConcurrency(publication.spine, 4, async item => {
    throwIfAborted(signal);
    const itemDiagnostics: PublicationDiagnostic[] = [];
    if (!item.path || item.remote || !archive.has(item.path)) return { item, diagnostics: itemDiagnostics };
    const media = item.mediaType.split(';', 1)[0]?.trim().toLowerCase();
    if (media !== 'application/xhtml+xml' && media !== 'text/html' && media !== 'image/svg+xml') return { item, diagnostics: itemDiagnostics };

    try {
      if (media === 'image/svg+xml') {
        const source = await archive.readText(item.path);
        throwIfAborted(signal);
        const parsed = parseXml(source, item.path, 'content');
        itemDiagnostics.push(...parsed.diagnostics);
        if (!parsed.root) return { item, diagnostics: itemDiagnostics };
        const viewport = svgViewport(parsed.root);
        const hint: ContentPresentationHints = {
          ...(viewport ? { viewport } : {}),
          page: {
            kind: 'single-svg-page',
            pageLike: true,
            semanticTextLength: semanticXmlText(parsed.root).length,
            replacedElementCount: 1,
            ...(viewport ? { intrinsicViewport: viewport } : {}),
          },
        };
        return { item, hint, diagnostics: itemDiagnostics };
      }

      const source = await archive.readText(item.path);
      throwIfAborted(signal);
      const parsed = parseXml(source, item.path, 'content');
      // Preflight is advisory. Browser materialization has an HTML-parser
      // compatibility fallback, so XML well-formedness failures here must not
      // prematurely classify an otherwise recoverable book as degraded.
      itemDiagnostics.push(...parsed.diagnostics.map(diagnostic => diagnostic.severity === 'error'
        ? { ...diagnostic, severity: 'warning' as const }
        : diagnostic));
      if (!parsed.root) return { item, diagnostics: itemDiagnostics };
      const html = parsed.root;
      const body = findFirst(html, 'body') ?? html;
      const css = await collectDocumentCss(archive, item.path, html, itemDiagnostics, stylesheetCache);
      throwIfAborted(signal);
      const presentation = inspectPresentation(html, body, css);
      const page = await classifyPage(archive, item.path, body, resolveSpineRendition(publication, item).layout === 'reflowable', itemDiagnostics);
      throwIfAborted(signal);
      const hint: ContentPresentationHints = {
        ...(presentation.writingMode ? { writingMode: presentation.writingMode } : {}),
        ...(presentation.direction ? { direction: presentation.direction } : {}),
        ...(page.intrinsicViewport ? { viewport: page.intrinsicViewport } : {}),
        page,
      };

      if (presentation.legacyWritingMode) {
        itemDiagnostics.push({
          code: 'CONTENT_PREFLIGHT_LEGACY_WRITING_MODE',
          severity: 'info',
          phase: 'compatibility',
          path: item.path,
          spineIndex: item.index,
          message: `Resolved ${presentation.writingMode} from a legacy -epub/-webkit writing-mode declaration before rendering.`,
          repair: {
            strategy: 'interpret-legacy-epub-writing-mode',
            description: 'Treat legacy EPUB/WebKit writing-mode declarations as their standard CSS writing-mode equivalent.',
            confidence: 0.99,
          },
        });
      }

      if (page.pageLike && resolveSpineRendition(publication, item).layout === 'reflowable') {
        itemDiagnostics.push({
          code: page.likelySpanningSpread
            ? 'CONTENT_REFLOWABLE_UNMARKED_SPANNING_IMAGE'
            : 'CONTENT_REFLOWABLE_PAGE_LIKE_IMAGE',
          severity: 'info',
          phase: 'compatibility',
          path: item.path,
          spineIndex: item.index,
          message: page.likelySpanningSpread
            ? 'A reflowable spine item is structurally a single landscape image and is treated as an unmarked spread-sized page.'
            : 'A reflowable spine item is structurally a single image page and may participate in cross-spine page composition.',
          repair: {
            strategy: page.likelySpanningSpread
              ? 'classify-reflowable-image-as-spanning-page'
              : 'classify-reflowable-image-as-page-like',
            description: 'Preserve the authored reflowable declaration while using content structure to choose a page-like spread execution strategy.',
            confidence: page.likelySpanningSpread ? 0.9 : 0.96,
          },
        });
      }
      return { item, hint, diagnostics: itemDiagnostics };
    } catch (cause) {
      if (signal.aborted) throw cause;
      itemDiagnostics.push({
        code: 'CONTENT_PREFLIGHT_FAILED',
        severity: 'warning',
        phase: 'content',
        path: item.path,
        spineIndex: item.index,
        message: `Content preflight failed for ${item.path}; renderer-side inspection will remain available.`,
        cause,
      });
      return { item, diagnostics: itemDiagnostics };
    }
  });

  // Workers run concurrently, but externally visible diagnostics and hints
  // retain authored spine order for deterministic reports and tests.
  for (const result of results) {
    if (result.hint) hints.set(result.item.index, result.hint);
    diagnostics.push(...result.diagnostics);
  }

  return { hints, diagnostics };
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error ? signal.reason : new DOMException('Publication preflight aborted.', 'AbortError');
}

interface PresentationInspection {
  readonly writingMode?: WritingMode;
  readonly direction?: TextDirection;
  readonly legacyWritingMode: boolean;
}

function inspectPresentation(
  html: XmlElementNode,
  body: XmlElementNode,
  stylesheets: readonly string[],
): PresentationInspection {
  let writingMode: WritingMode | undefined;
  let direction: TextDirection | undefined;
  let legacyWritingMode = false;

  for (const element of [html, body]) {
    const dir = element.attributes.dir?.trim().toLowerCase();
    if (dir === 'ltr' || dir === 'rtl') direction = dir;
    const inline = parseDeclarations(element.attributes.style ?? '');
    const resolved = writingModeFromDeclarations(inline);
    if (resolved.value) {
      writingMode = resolved.value;
      legacyWritingMode ||= resolved.legacy;
    }
    const cssDirection = inline.get('direction')?.trim().toLowerCase();
    if (cssDirection === 'ltr' || cssDirection === 'rtl') direction = cssDirection;
  }

  const targets = [elementIdentity(html, 'html'), elementIdentity(body, 'body')];
  for (const css of stylesheets) {
    for (const rule of cssRules(css)) {
      if (!rule.selectors.some(selector => targets.some(target => simpleSelectorMatches(selector, target)))) continue;
      const declarations = parseDeclarations(rule.block);
      const resolved = writingModeFromDeclarations(declarations);
      if (resolved.value) {
        writingMode = resolved.value;
        legacyWritingMode ||= resolved.legacy;
      }
      const cssDirection = declarations.get('direction')?.trim().toLowerCase();
      if (cssDirection === 'ltr' || cssDirection === 'rtl') direction = cssDirection;
    }
  }

  return { writingMode, direction, legacyWritingMode };
}

interface ElementIdentity {
  readonly tag: string;
  readonly id?: string;
  readonly classes: ReadonlySet<string>;
}

function elementIdentity(element: XmlElementNode, tag: string): ElementIdentity {
  return {
    tag,
    ...(element.attributes.id ? { id: element.attributes.id } : {}),
    classes: new Set((element.attributes.class ?? '').split(/\s+/u).filter(Boolean)),
  };
}

function simpleSelectorMatches(selectorSource: string, target: ElementIdentity): boolean {
  const selector = selectorSource.trim().replace(/::?[\w-]+(?:\([^)]*\))?/gu, '');
  // Only the terminal simple selector can target html/body for the preflight
  // subset; combinator-heavy selectors are intentionally ignored.
  if (/[>+~]/u.test(selector) || /\s/u.test(selector.trim())) return false;
  const tagMatch = /^([A-Za-z][\w-]*)/u.exec(selector);
  if (tagMatch && tagMatch[1]!.toLowerCase() !== target.tag) return false;
  for (const cls of selector.matchAll(/\.([\w-]+)/gu)) if (!target.classes.has(cls[1]!)) return false;
  const id = /#([\w-]+)/u.exec(selector)?.[1];
  if (id && id !== target.id) return false;
  return Boolean(tagMatch || selector.includes('.') || selector.includes('#') || selector === '*');
}

function cssRules(css: string): readonly { selectors: readonly string[]; block: string }[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  const out: { selectors: string[]; block: string }[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/gu;
  for (const match of clean.matchAll(pattern)) {
    const head = match[1]!.trim();
    if (!head || head.startsWith('@')) continue;
    out.push({ selectors: head.split(',').map(value => value.trim()).filter(Boolean), block: match[2]! });
  }
  return out;
}

function parseDeclarations(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of block.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).replace(/!important\s*$/iu, '').trim();
    if (name && value) out.set(name, value);
  }
  return out;
}

function writingModeFromDeclarations(declarations: ReadonlyMap<string, string>): { value?: WritingMode; legacy: boolean } {
  const standard = normalizeWritingMode(declarations.get('writing-mode'));
  if (standard) return { value: standard, legacy: false };
  for (const name of ['-epub-writing-mode', '-webkit-writing-mode']) {
    const value = normalizeWritingMode(declarations.get(name));
    if (value) return { value, legacy: true };
  }
  return { legacy: false };
}

function normalizeWritingMode(value: string | undefined): WritingMode | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'horizontal-tb' || normalized === 'vertical-rl' || normalized === 'vertical-lr'
    ? normalized
    : undefined;
}

async function classifyPage(
  archive: PublicationArchive,
  documentPath: PublicationPath,
  body: XmlElementNode,
  globallyReflowable: boolean,
  diagnostics: PublicationDiagnostic[],
): Promise<ContentPageProfile> {
  const text = semanticXmlText(body);
  const images = descendantsByName(body, 'img');
  const svg = descendantsByName(body, 'svg');
  const replacedElementCount = images.length + svg.length
    + descendantsByName(body, 'video').length
    + descendantsByName(body, 'object').length
    + descendantsByName(body, 'embed').length;

  if (images.length === 1 && text.trim().length <= 16 && replacedElementCount === 1) {
    const source = images[0]!.attributes.src?.trim();
    let viewport: IntrinsicViewport | undefined;
    if (source) {
      try {
        const resolved = resolvePublicationReference(documentPath, source);
        if (!resolved.remote && resolved.path && archive.has(resolved.path)) {
          viewport = imageDimensions(await archive.read(resolved.path));
        }
      } catch (cause) {
        diagnostics.push({
          code: 'CONTENT_PREFLIGHT_IMAGE_REFERENCE_FAILED',
          severity: 'info',
          phase: 'content',
          path: documentPath,
          message: `Could not inspect the single-image page resource ${source}.`,
          cause,
        });
      }
    }
    const aspect = viewport ? viewport.width / viewport.height : undefined;
    return {
      kind: 'single-image-page',
      pageLike: true,
      semanticTextLength: text.length,
      replacedElementCount,
      ...(viewport ? { intrinsicViewport: viewport } : {}),
      ...(globallyReflowable && aspect != null && aspect >= 1.18 ? { likelySpanningSpread: true } : {}),
    };
  }

  return {
    kind: text.trim() ? 'flowing-text' : 'unknown',
    pageLike: false,
    semanticTextLength: text.length,
    replacedElementCount,
  };
}

async function collectDocumentCss(
  archive: PublicationArchive,
  documentPath: PublicationPath,
  html: XmlElementNode,
  diagnostics: PublicationDiagnostic[],
  cache: Map<PublicationPath, Promise<string>>,
): Promise<string[]> {
  const paths: PublicationPath[] = [];
  for (const link of descendantsByName(html, 'link')) {
    const rel = (link.attributes.rel ?? '').toLowerCase().split(/\s+/u);
    const href = link.attributes.href?.trim();
    if (!href || !rel.includes('stylesheet')) continue;
    try {
      const ref = resolvePublicationReference(documentPath, href);
      if (!ref.remote && ref.path) paths.push(ref.path);
    } catch { /* renderer/resource diagnostics remain authoritative */ }
  }
  const out: string[] = [];
  const seen = new Set<PublicationPath>();
  const visit = async (path: PublicationPath): Promise<void> => {
    if (seen.has(path) || !archive.has(path)) return;
    seen.add(path);
    try {
      let pending = cache.get(path);
      if (!pending) {
        pending = archive.readText(path);
        cache.set(path, pending);
      }
      const css = await pending;
      out.push(css);
      for (const imported of cssImports(css)) {
        try {
          const ref = resolvePublicationReference(path, imported);
          if (!ref.remote && ref.path) await visit(ref.path);
        } catch { /* ignore malformed import here */ }
      }
    } catch (cause) {
      diagnostics.push({
        code: 'CONTENT_PREFLIGHT_STYLESHEET_READ_FAILED',
        severity: 'info',
        phase: 'content',
        path,
        message: `Could not inspect stylesheet ${path} during presentation preflight.`,
        cause,
      });
    }
  };
  for (const path of paths) await visit(path);
  return out;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, run));
  return results;
}

function cssImports(css: string): string[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  const out: string[] = [];
  const pattern = /@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?/giu;
  for (const match of clean.matchAll(pattern)) if (match[1]) out.push(match[1]);
  return out;
}

function descendantsByName(root: XmlElementNode, name: string): XmlElementNode[] {
  const out: XmlElementNode[] = [];
  const visit = (node: XmlElementNode) => {
    for (const child of node.children) {
      if (child.type !== 'element') continue;
      if (child.localName.toLowerCase() === name) out.push(child);
      visit(child);
    }
  };
  visit(root);
  return out;
}

function findFirst(root: XmlElementNode, name: string): XmlElementNode | undefined {
  if (root.localName.toLowerCase() === name) return root;
  for (const child of root.children) {
    if (child.type !== 'element') continue;
    const found = findFirst(child, name);
    if (found) return found;
  }
  return undefined;
}

function svgViewport(root: XmlElementNode): IntrinsicViewport | undefined {
  const viewBox = root.attributes.viewBox ?? root.attributes.viewbox;
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/u).map(Number);
    if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3]) && parts[2]! > 0 && parts[3]! > 0) {
      return { width: parts[2]!, height: parts[3]! };
    }
  }
  const width = cssNumeric(root.attributes.width);
  const height = cssNumeric(root.attributes.height);
  return width && height ? { width, height } : undefined;
}

function cssNumeric(value: string | undefined): number | undefined {
  const match = /^\s*(\d+(?:\.\d+)?)/u.exec(value ?? '');
  const number = match ? Number(match[1]) : NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

/** Read the common raster headers without requiring Canvas/Pillow in the core. */
export function imageDimensions(bytes: Uint8Array): IntrinsicViewport | undefined {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return width > 0 && height > 0 ? { width, height } : undefined;
  }
  if (bytes.length >= 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint16(6, true);
    const height = view.getUint16(8, true);
    return width > 0 && height > 0 ? { width, height } : undefined;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]!;
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = (bytes[offset]! << 8) | bytes[offset + 1]!;
      if (length < 2 || offset + length > bytes.length) break;
      const sof = (marker >= 0xc0 && marker <= 0xc3)
        || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb)
        || (marker >= 0xcd && marker <= 0xcf);
      if (sof && length >= 7) {
        const height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
        const width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
        return width > 0 && height > 0 ? { width, height } : undefined;
      }
      offset += length;
    }
  }
  return undefined;
}
