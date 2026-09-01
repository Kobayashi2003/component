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

/**
 * A declaration that reached `html` or `body`, kept with enough of the cascade
 * to pick a winner. Order alone is not enough: books routinely ship a paired
 * horizontal/vertical stylesheet where the *later* sheet says `body {
 * vertical-rl }` while the page is actually horizontal because an earlier sheet
 * said `body.imgpage { horizontal-tb }` and specificity decides.
 */
interface CascadeCandidate<T> {
  readonly value: T;
  readonly legacy: boolean;
  /** Author-origin precedence: normal rule < inline < important rule < important inline. */
  readonly rank: number;
  readonly specificity: number;
  readonly order: number;
}

function winner<T>(current: CascadeCandidate<T> | undefined, next: CascadeCandidate<T>): CascadeCandidate<T> {
  if (!current) return next;
  if (next.rank !== current.rank) return next.rank > current.rank ? next : current;
  if (next.specificity !== current.specificity) return next.specificity > current.specificity ? next : current;
  return next.order >= current.order ? next : current;
}

const RANK_RULE = 0;
const RANK_INLINE = 1;
const RANK_IMPORTANT_RULE = 2;
const RANK_IMPORTANT_INLINE = 3;

function inspectPresentation(
  html: XmlElementNode,
  body: XmlElementNode,
  stylesheets: readonly string[],
): PresentationInspection {
  let writingMode: CascadeCandidate<WritingMode> | undefined;
  let direction: CascadeCandidate<TextDirection> | undefined;
  let order = 0;

  const consider = (
    declarations: ReadonlyMap<string, Declaration>,
    rank: number,
    important: number,
    specificity: number,
  ): void => {
    order += 1;
    const mode = writingModeFromDeclarations(declarations);
    if (mode.value) {
      writingMode = winner(writingMode, {
        value: mode.value,
        legacy: mode.legacy,
        rank: mode.important ? important : rank,
        specificity,
        order,
      });
    }
    const dir = declarations.get('direction');
    const value = dir?.value.trim().toLowerCase();
    if (value === 'ltr' || value === 'rtl') {
      direction = winner(direction, {
        value,
        legacy: false,
        rank: dir!.important ? important : rank,
        specificity,
        order,
      });
    }
  };

  // The `dir` attribute is a presentational hint and loses to any declaration.
  for (const element of [html, body]) {
    const attribute = element.attributes.dir?.trim().toLowerCase();
    if (attribute === 'ltr' || attribute === 'rtl') {
      order += 1;
      direction = winner(direction, { value: attribute, legacy: false, rank: -1, specificity: 0, order });
    }
  }

  const htmlIdentity = elementIdentity(html, 'html');
  const chains: readonly (readonly ElementIdentity[])[] = [
    [htmlIdentity],
    [htmlIdentity, elementIdentity(body, 'body')],
  ];
  for (const css of stylesheets) {
    for (const rule of cssRules(css)) {
      let specificity = -1;
      for (const selector of rule.selectors) {
        if (!chains.some(chain => selectorMatches(selector, chain))) continue;
        specificity = Math.max(specificity, selectorSpecificity(selector));
      }
      if (specificity < 0) continue;
      consider(parseDeclarations(rule.block), RANK_RULE, RANK_IMPORTANT_RULE, specificity);
    }
  }

  // Inline styles are applied last so that, at equal importance, they win.
  for (const element of [html, body]) {
    consider(parseDeclarations(element.attributes.style ?? ''), RANK_INLINE, RANK_IMPORTANT_INLINE, 0);
  }

  return {
    ...(writingMode ? { writingMode: writingMode.value } : {}),
    ...(direction ? { direction: direction.value } : {}),
    legacyWritingMode: writingMode?.legacy ?? false,
  };
}

/**
 * Selector specificity as an `id * 10000 + class * 100 + type` weight. Selectors
 * inside `:not()` are counted both for the functional pseudo-class and for their
 * own contents, which over-counts by one level; nothing in the preflight subset
 * is decided by that margin.
 */
function selectorSpecificity(selector: string): number {
  const source = selector.trim();
  const ids = source.match(/#[\w-]+/gu)?.length ?? 0;
  const classes = source.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/gu)?.length ?? 0;
  const types = (source.match(/(?:^|[\s>+~])[A-Za-z][\w-]*/gu)?.length ?? 0)
    + (source.match(/::[\w-]+/gu)?.length ?? 0);
  return ids * 10000 + classes * 100 + types;
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

/**
 * Match a selector against an ancestor chain. Preflight only ever asks about
 * `html` and `body`, so a right-to-left walk over that two-element chain is
 * both complete and cheap. Templates routinely write `html.vrtl body` or
 * `:root`, neither of which a terminal-compound-only matcher can see.
 */
function selectorMatches(selectorSource: string, chain: readonly ElementIdentity[]): boolean {
  const selector = selectorSource
    .trim()
    .replace(/:root\b/giu, 'html')
    .replace(/::?[\w-]+(?:\([^)]*\))?/gu, '');
  // `html` and `body` are never siblings, so a sibling combinator cannot relate
  // them and the rule can be rejected outright.
  if (/[+~]/u.test(selector)) return false;

  const steps: { readonly compound: string; readonly child: boolean }[] = [];
  let child = false;
  for (const token of selector.split(/\s*(>)\s*|\s+/u)) {
    if (!token) continue;
    if (token === '>') { child = true; continue; }
    steps.push({ compound: token, child: steps.length > 0 && child });
    child = false;
  }
  if (!steps.length) return false;

  let index = chain.length - 1;
  if (!compoundMatches(steps[steps.length - 1]!.compound, chain[index]!)) return false;
  for (let step = steps.length - 1; step > 0; step -= 1) {
    const ancestor = steps[step - 1]!.compound;
    if (steps[step]!.child) {
      index -= 1;
      if (index < 0 || !compoundMatches(ancestor, chain[index]!)) return false;
      continue;
    }
    let found = -1;
    for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
      if (compoundMatches(ancestor, chain[candidate]!)) { found = candidate; break; }
    }
    if (found < 0) return false;
    index = found;
  }
  return true;
}

function compoundMatches(compound: string, target: ElementIdentity): boolean {
  const tagMatch = /^([A-Za-z][\w-]*)/u.exec(compound);
  if (tagMatch && tagMatch[1]!.toLowerCase() !== target.tag) return false;
  for (const cls of compound.matchAll(/\.([\w-]+)/gu)) if (!target.classes.has(cls[1]!)) return false;
  const id = /#([\w-]+)/u.exec(compound)?.[1];
  if (id && id !== target.id) return false;
  return Boolean(tagMatch || compound.includes('.') || compound.includes('#') || compound === '*');
}

/**
 * Walk balanced braces so a rule keeps the at-rule context it was authored in.
 * A flat `{...}` scan lifts the `html` rule out of `@media print { … }` and
 * applies the print writing mode to the on-screen plan.
 */
function cssRules(css: string): readonly { selectors: readonly string[]; block: string }[] {
  const out: { selectors: string[]; block: string }[] = [];
  const visit = (source: string): void => {
    let cursor = 0;
    while (cursor < source.length) {
      const open = indexOfBrace(source, cursor);
      if (open < 0) break;
      const close = matchingBrace(source, open);
      if (close < 0) break;
      const preamble = source.slice(cursor, open);
      // Statement at-rules (`@import`, `@charset`) end in `;` and would
      // otherwise be glued onto the head of the next rule.
      const head = preamble.slice(preamble.lastIndexOf(';') + 1).trim();
      const block = source.slice(open + 1, close);
      cursor = close + 1;
      if (!head) continue;
      if (head.startsWith('@')) {
        if (atRuleAppliesToScreen(head)) visit(block);
        continue;
      }
      out.push({ selectors: head.split(',').map(value => value.trim()).filter(Boolean), block });
    }
  };
  visit(stripCssComments(css));
  return out;
}

/**
 * Conditional groups whose contents can style the reader. Declaration at-rules
 * (`@font-face`, `@keyframes`, `@page`) hold no page selectors, so descending
 * into them can only produce noise.
 */
function atRuleAppliesToScreen(head: string): boolean {
  const name = /^@([\w-]+)/u.exec(head)?.[1]?.toLowerCase();
  if (name === 'supports' || name === 'layer' || name === 'container' || name === 'scope') return true;
  if (name !== 'media') return false;
  const query = head.slice(name.length + 1).toLowerCase();
  if (/\bnot\s+(?:print|speech)\b/u.test(query)) return true;
  return !/\b(?:print|speech)\b/u.test(query) || /\b(?:screen|all)\b/u.test(query);
}

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//gu, '');
}

/** Brace scanning skips quoted values so `content: "{"` cannot unbalance it. */
function indexOfBrace(source: string, from: number): number {
  for (let index = from; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'") { index = endOfString(source, index); continue; }
    if (char === '{') return index;
  }
  return -1;
}

function matchingBrace(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' || char === "'") { index = endOfString(source, index); continue; }
    if (char === '{') depth += 1;
    else if (char === '}' && (depth -= 1) === 0) return index;
  }
  return -1;
}

function endOfString(source: string, start: number): number {
  const quote = source[start];
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '\\') { index += 1; continue; }
    if (source[index] === quote) return index;
  }
  return source.length;
}

interface Declaration {
  readonly value: string;
  readonly important: boolean;
}

function parseDeclarations(block: string): Map<string, Declaration> {
  const out = new Map<string, Declaration>();
  for (const part of block.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    const raw = part.slice(colon + 1);
    const important = /!important\s*$/iu.test(raw);
    const value = raw.replace(/!important\s*$/iu, '').trim();
    if (name && value) out.set(name, { value, important });
  }
  return out;
}

function writingModeFromDeclarations(
  declarations: ReadonlyMap<string, Declaration>,
): { value?: WritingMode; legacy: boolean; important: boolean } {
  const standard = declarations.get('writing-mode');
  const standardValue = normalizeWritingMode(standard?.value);
  if (standardValue) return { value: standardValue, legacy: false, important: standard!.important };
  for (const name of ['-epub-writing-mode', '-webkit-writing-mode']) {
    const declaration = declarations.get(name);
    const value = normalizeWritingMode(declaration?.value);
    if (value) return { value, legacy: true, important: declaration!.important };
  }
  return { legacy: false, important: false };
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
    // `rel="alternate stylesheet"` is not applied until a user picks it. The
    // Japanese vertical/horizontal sheet pair ships the unused half this way,
    // so loading it makes the wrong writing mode win the cascade.
    if (!href || !rel.includes('stylesheet') || rel.includes('alternate')) continue;
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
  const clean = stripCssComments(css);
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
