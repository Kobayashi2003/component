import type {
  ContentPresentationHints,
  PublicationDiagnostic,
  PublicationPath,
  SpineItem,
  TextDirection,
  WritingMode,
} from '../publication';
import { resolvePublicationDocumentBase, resolvePublicationDocumentReference } from '../publication';
import { inspectXhtmlIntrinsicViewport } from './intrinsic-viewport';
import {
  decodePublicationText,
  PublicationResourceSession,
  rewriteCssReferences,
} from '../resources';
import type {
  BrowserXmlPlatform,
  MaterializedContentDocument,
  XhtmlMaterializerOptions,
} from './model';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/**
 * Builds a self-contained browser-loadable XHTML document from a spine item.
 * Publication-relative resources are rebound to object URLs owned by the open
 * PublicationResourceSession; navigation links are annotated, not followed.
 */
export async function materializeXhtmlSpineItem(
  item: SpineItem,
  session: PublicationResourceSession,
  platform: BrowserXmlPlatform,
  options: XhtmlMaterializerOptions = {},
): Promise<MaterializedContentDocument> {
  if (item.remote || !item.path) {
    throw new Error(`XHTML materializer requires a container-local spine item: ${item.href}.`);
  }
  if (!isXhtmlMediaType(item.mediaType)) {
    throw new Error(`XHTML materializer cannot render media type ${item.mediaType}.`);
  }

  const diagnostics: PublicationDiagnostic[] = [];
  const read = await session.resolver.read('', item.path);
  diagnostics.push(...read.diagnostics);
  if (!read.resource) {
    throw new Error(`Unable to read XHTML content document ${item.path}.`);
  }

  const source = decodePublicationText(read.resource.bytes, read.resource.mediaType);
  const parsed = parseXhtmlContentDocument(source, item.path, item.index, platform);
  const document = parsed.document;
  diagnostics.push(...parsed.diagnostics);

  if (options.disableScripts ?? true) {
    disableScripts(document, diagnostics, item.path);
  }
  disableAutomaticDocumentNavigation(document, diagnostics, item.path);

  const baseHref = inspectAndNeutralizeDocumentBase(document, item.path, diagnostics);
  const xmlBases = inspectAndNeutralizeXmlBases(document, item.path, baseHref, diagnostics);
  forceDeterministicImageLoading(document);
  await rewriteDocumentResources(document, item.path, baseHref, xmlBases, session, diagnostics);
  if (options.annotateLinks ?? true) {
    annotateNavigationLinks(document, item.path, baseHref, xmlBases, diagnostics);
  }

  const hints = inspectStaticPresentationHints(document);
  const serialized = ensureXmlDeclaration(platform.serializeXml(document));
  const url = session.createGeneratedTextUrl(
    `xhtml:${item.path}`,
    serialized,
    'application/xhtml+xml;charset=utf-8',
  );

  return {
    sourcePath: item.path,
    markup: serialized,
    url,
    mediaType: 'application/xhtml+xml',
    hints,
    diagnostics,
  };
}

export function parseXhtmlContentDocument(
  source: string,
  path: PublicationPath,
  spineIndex: number,
  platform: BrowserXmlPlatform,
): { readonly document: Document; readonly diagnostics: readonly PublicationDiagnostic[] } {
  let document = platform.parseXml(source, 'application/xhtml+xml');
  if (isParsedXhtml(document)) return { document, diagnostics: [] };

  const htmlDocument = platform.parseXml(source, 'text/html');
  assertParsedXhtml(htmlDocument, path);
  document = htmlDocument;
  return {
    document,
    diagnostics: [{
      code: 'CONTENT_XHTML_PARSED_AS_HTML',
      severity: 'warning',
      phase: 'compatibility',
      message: `Recovered non-well-formed XHTML content ${path} with the browser HTML parser.`,
      path,
      spineIndex,
      repair: {
        strategy: 'parse-malformed-xhtml-as-html',
        description: 'Use browser HTML parsing as a compatibility fallback, then serialize deterministic script-disabled markup.',
        confidence: 0.9,
      },
    }],
  };
}

async function rewriteDocumentResources(
  document: Document,
  basePath: PublicationPath,
  baseHref: string | undefined,
  xmlBases: ReadonlyMap<Element, string | undefined>,
  session: PublicationResourceSession,
  diagnostics: PublicationDiagnostic[],
): Promise<void> {
  const elements = Array.from(document.getElementsByTagName('*'));

  for (const element of elements) {
    const namespace = element.namespaceURI;
    const local = element.localName.toLowerCase();
    const elementBaseHref = xmlBases.get(element) ?? baseHref;

    if (namespace === XHTML_NS && local === 'link' && hasRelToken(element, 'stylesheet')) {
      await rewriteUrlAttribute(element, 'href', basePath, elementBaseHref, session, diagnostics);
      continue;
    }

    if ((namespace === XHTML_NS || namespace === SVG_NS) && local === 'style') {
      const css = await rewriteDocumentInlineCss(basePath, elementBaseHref, element.textContent ?? '', session);
      diagnostics.push(...css.diagnostics);
      element.textContent = css.css;
      continue;
    }

    if (element.hasAttribute('style')) {
      const css = await rewriteDocumentInlineCss(basePath, elementBaseHref, element.getAttribute('style') ?? '', session);
      diagnostics.push(...css.diagnostics);
      element.setAttribute('style', css.css);
    }

    if (namespace === XHTML_NS) {
      if (['img', 'audio', 'video', 'source', 'track', 'input', 'embed', 'iframe'].includes(local)) {
        await rewriteUrlAttribute(element, 'src', basePath, elementBaseHref, session, diagnostics);
      }
      if (local === 'video') {
        await rewriteUrlAttribute(element, 'poster', basePath, elementBaseHref, session, diagnostics);
      }
      if (local === 'object') {
        await rewriteUrlAttribute(element, 'data', basePath, elementBaseHref, session, diagnostics);
      }
      if (local === 'img' || local === 'source') {
        await rewriteSrcsetAttribute(element, basePath, elementBaseHref, session, diagnostics);
      }
    }

    if (namespace === SVG_NS && ['image', 'use'].includes(local)) {
      await rewriteUrlAttribute(element, 'href', basePath, elementBaseHref, session, diagnostics);
      if (element.hasAttributeNS(XLINK_NS, 'href')) {
        await rewriteNamespacedUrlAttribute(
          element,
          XLINK_NS,
          'xlink:href',
          basePath,
          elementBaseHref,
          session,
          diagnostics,
        );
      }
    }
  }
}

async function rewriteUrlAttribute(
  element: Element,
  attribute: string,
  basePath: PublicationPath,
  baseHref: string | undefined,
  session: PublicationResourceSession,
  diagnostics: PublicationDiagnostic[],
): Promise<void> {
  if (!element.hasAttribute(attribute)) return;
  const authored = element.getAttribute(attribute)?.trim() ?? '';
  if (!authored) return;
  if (authored.startsWith('#') && !baseHref) return;

  const result = await materializeDocumentReference(basePath, baseHref, authored, session);
  diagnostics.push(...result.diagnostics);
  element.setAttribute(attribute, result.resource?.url ?? 'about:blank');
}

async function rewriteNamespacedUrlAttribute(
  element: Element,
  namespace: string,
  qualifiedName: string,
  basePath: PublicationPath,
  baseHref: string | undefined,
  session: PublicationResourceSession,
  diagnostics: PublicationDiagnostic[],
): Promise<void> {
  const authored = element.getAttributeNS(namespace, 'href')?.trim() ?? '';
  if (!authored) return;
  if (authored.startsWith('#') && !baseHref) return;
  const result = await materializeDocumentReference(basePath, baseHref, authored, session);
  diagnostics.push(...result.diagnostics);
  element.setAttributeNS(namespace, qualifiedName, result.resource?.url ?? 'about:blank');
}

async function rewriteSrcsetAttribute(
  element: Element,
  basePath: PublicationPath,
  baseHref: string | undefined,
  session: PublicationResourceSession,
  diagnostics: PublicationDiagnostic[],
): Promise<void> {
  const authored = element.getAttribute('srcset');
  if (!authored) return;

  const candidates = parseSrcset(authored);
  const rewritten: string[] = [];
  for (const candidate of candidates) {
    if (/^data:/i.test(candidate.url)) {
      rewritten.push(formatSrcsetCandidate(candidate.url, candidate.descriptor));
      continue;
    }
    const result = await materializeDocumentReference(basePath, baseHref, candidate.url, session);
    diagnostics.push(...result.diagnostics);
    rewritten.push(formatSrcsetCandidate(result.resource?.url ?? 'about:blank', candidate.descriptor));
  }
  element.setAttribute('srcset', rewritten.join(', '));
}


async function rewriteDocumentInlineCss(
  basePath: PublicationPath,
  baseHref: string | undefined,
  cssText: string,
  session: PublicationResourceSession,
): Promise<{ readonly css: string; readonly diagnostics: readonly PublicationDiagnostic[] }> {
  const diagnostics: PublicationDiagnostic[] = [];
  const rewritten = await rewriteCssReferences(cssText, async source => {
    const trimmed = source.trim();
    if (/^data:/i.test(trimmed)) return source;
    if (trimmed.startsWith('#') && !baseHref) return source;

    try {
      const result = await materializeDocumentReference(basePath, baseHref, source, session);
      diagnostics.push(...result.diagnostics);
      return result.resource?.url ?? 'about:blank';
    } catch (cause) {
      diagnostics.push({
        code: 'CONTENT_CSS_REFERENCE_INVALID',
        severity: 'warning',
        phase: 'content',
        message: `Inline CSS reference could not be resolved: ${source}.`,
        path: basePath,
        cause,
      });
      return 'about:blank';
    }
  });
  return { css: rewritten.css, diagnostics };
}

async function materializeDocumentReference(
  basePath: PublicationPath,
  baseHref: string | undefined,
  source: string,
  session: PublicationResourceSession,
) {
  const resolved = resolvePublicationDocumentReference(basePath, baseHref, source);
  return session.materialize('', referenceHrefWithFragment(resolved));
}


function referenceHrefWithFragment(
  resolved: ReturnType<typeof resolvePublicationDocumentReference>,
): string {
  if (!resolved.remote || !resolved.fragment) return resolved.href;
  const url = new URL(resolved.href);
  url.hash = resolved.fragment;
  return url.href;
}

function inspectAndNeutralizeDocumentBase(
  document: Document,
  path: PublicationPath,
  diagnostics: PublicationDiagnostic[],
): string | undefined {
  const bases = Array.from(document.getElementsByTagNameNS(XHTML_NS, 'base'));
  for (const candidate of bases) {
    const target = candidate.getAttribute('target');
    if (target) {
      candidate.setAttribute('data-epub-authored-target', target);
      candidate.removeAttribute('target');
    }
  }
  const base = bases.find(element => element.hasAttribute('href'));
  const href = base?.getAttribute('href')?.trim() || undefined;
  if (!base || !href) return undefined;

  try {
    // Validate now so every later resource rewrite has the same failure boundary.
    resolvePublicationDocumentReference(path, href, '');
    base.setAttribute('data-epub-authored-href', href);
    base.removeAttribute('href');
    diagnostics.push({
      code: 'CONTENT_BASE_ELEMENT_USED',
      severity: 'info',
      phase: 'content',
      message: `Honored and neutralized authored <base href> while materializing ${path}.`,
      path,
    });
    return href;
  } catch (cause) {
    base.setAttribute('data-epub-authored-href', href);
    base.removeAttribute('href');
    diagnostics.push({
      code: 'CONTENT_BASE_REFERENCE_INVALID',
      severity: 'warning',
      phase: 'content',
      message: `Ignored invalid <base href> in ${path}: ${href}.`,
      path,
      cause,
    });
    return undefined;
  }
}

function inspectAndNeutralizeXmlBases(
  document: Document,
  path: PublicationPath,
  documentBaseHref: string | undefined,
  diagnostics: PublicationDiagnostic[],
): ReadonlyMap<Element, string | undefined> {
  const resolvedBases = new Map<Element, string | undefined>();
  let applied = 0;

  for (const element of Array.from(document.getElementsByTagName('*'))) {
    const parentBase = element.parentElement
      ? resolvedBases.get(element.parentElement) ?? documentBaseHref
      : documentBaseHref;
    const authored = element.getAttributeNS(XML_NS, 'base')?.trim();
    let effective = parentBase;

    if (authored) {
      element.setAttribute('data-epub-authored-xml-base', authored);
      element.removeAttributeNS(XML_NS, 'base');
      try {
        effective = resolvePublicationDocumentBase(path, parentBase, authored);
        applied += 1;
      } catch (cause) {
        diagnostics.push({
          code: 'CONTENT_XML_BASE_REFERENCE_INVALID',
          severity: 'warning',
          phase: 'content',
          message: `Ignored invalid xml:base in ${path}: ${authored}.`,
          path,
          cause,
        });
      }
    }

    resolvedBases.set(element, effective);
  }

  if (applied > 0) {
    diagnostics.push({
      code: 'CONTENT_XML_BASE_APPLIED',
      severity: 'info',
      phase: 'compatibility',
      message: `Applied and neutralized ${applied} inherited xml:base declaration(s) while materializing ${path}.`,
      path,
      repair: {
        strategy: 'apply-nested-xml-base-semantics',
        description: 'Resolve descendant resources and links against inherited XML Base declarations before generating isolated reader markup.',
        confidence: 0.99,
      },
    });
  }

  return resolvedBases;
}

function forceDeterministicImageLoading(document: Document): void {
  for (const image of Array.from(document.getElementsByTagNameNS(XHTML_NS, 'img'))) {
    // Pagination measures the entire document. Lazy images outside the initial
    // viewport can otherwise acquire intrinsic dimensions after a page count
    // has already been committed and shift every following column.
    image.setAttribute('loading', 'eager');
  }
}

/**
 * Small deterministic srcset tokenizer. It intentionally treats data: URLs as
 * a single URL token up to whitespace so their payload comma is not mistaken
 * for a candidate separator.
 */
export function parseSrcset(input: string): readonly { readonly url: string; readonly descriptor?: string }[] {
  const out: { url: string; descriptor?: string }[] = [];
  let i = 0;

  while (i < input.length) {
    while (i < input.length && (isAsciiWhitespace(input[i]!) || input[i] === ',')) i += 1;
    if (i >= input.length) break;

    const start = i;
    const dataUrl = input.slice(i, i + 5).toLowerCase() === 'data:';
    if (dataUrl) {
      while (i < input.length && !isAsciiWhitespace(input[i]!)) i += 1;
    } else {
      while (i < input.length && !isAsciiWhitespace(input[i]!) && input[i] !== ',') i += 1;
    }
    const url = input.slice(start, i).replace(/,+$/, '');

    while (i < input.length && isAsciiWhitespace(input[i]!)) i += 1;
    const descriptorStart = i;
    while (i < input.length && input[i] !== ',') i += 1;
    const descriptor = input.slice(descriptorStart, i).trim() || undefined;
    if (i < input.length && input[i] === ',') i += 1;

    if (url) out.push({ url, descriptor });
  }

  return out;
}

function annotateNavigationLinks(
  document: Document,
  basePath: PublicationPath,
  baseHref: string | undefined,
  xmlBases: ReadonlyMap<Element, string | undefined>,
  diagnostics: PublicationDiagnostic[],
): void {
  for (const anchor of Array.from(document.getElementsByTagNameNS(XHTML_NS, 'a'))) {
    const href = anchor.getAttribute('href')?.trim();
    if (!href) continue;
    const target = anchor.getAttribute('target');
    if (target) {
      anchor.setAttribute('data-epub-authored-target', target);
      anchor.removeAttribute('target');
    }
    try {
      const effectiveBaseHref = xmlBases.get(anchor) ?? baseHref;
      const resolved = resolvePublicationDocumentReference(basePath, effectiveBaseHref, href);
      anchor.setAttribute('data-epub-href', referenceHrefWithFragment(resolved));
      if (!resolved.remote && resolved.path === basePath && resolved.fragment) {
        // Same-document fragments remain native browser navigation targets.
        anchor.setAttribute('href', `#${encodeURIComponent(resolved.fragment)}`);
      } else if (href.startsWith('#')) {
        // An authored <base href> can make a fragment-only URL target another
        // resource. The base is neutralized in the generated Blob document, so
        // do not accidentally reinterpret it as a native fragment here.
        anchor.setAttribute('href', 'about:blank');
      }
    } catch (cause) {
      diagnostics.push({
        code: 'CONTENT_LINK_REFERENCE_INVALID',
        severity: 'warning',
        phase: 'content',
        message: `Hyperlink could not be resolved: ${href}.`,
        path: basePath,
        cause,
      });
    }
  }
}

function disableScripts(
  document: Document,
  diagnostics: PublicationDiagnostic[],
  path: PublicationPath,
): void {
  const scripts = [
    ...Array.from(document.getElementsByTagNameNS(XHTML_NS, 'script')),
    ...Array.from(document.getElementsByTagNameNS(SVG_NS, 'script')),
  ];
  if (scripts.length === 0) return;

  for (const script of scripts) {
    // Removing the element avoids both execution and external script fetches.
    script.remove();
  }

  diagnostics.push({
    code: 'CONTENT_SCRIPTING_DISABLED',
    severity: 'info',
    phase: 'content',
    message: `Disabled ${scripts.length} authored script element(s) in ${path}.`,
    path,
  });
}


function disableAutomaticDocumentNavigation(
  document: Document,
  diagnostics: PublicationDiagnostic[],
  path: PublicationPath,
): void {
  const refresh = Array.from(document.getElementsByTagNameNS(XHTML_NS, 'meta'))
    .filter(meta => (meta.getAttribute('http-equiv') ?? '').trim().toLowerCase() === 'refresh');
  for (const meta of refresh) {
    meta.setAttribute('data-epub-disabled-http-equiv', 'refresh');
    meta.removeAttribute('http-equiv');
    meta.removeAttribute('content');
  }

  for (const anchor of Array.from(document.getElementsByTagNameNS(XHTML_NS, 'a'))) {
    // Ping URLs are side-effecting network requests unrelated to reading
    // navigation and remain unnecessary even when the anchor itself is routed.
    anchor.removeAttribute('ping');
  }

  if (refresh.length > 0) {
    diagnostics.push({
      code: 'CONTENT_AUTOMATIC_NAVIGATION_DISABLED',
      severity: 'info',
      phase: 'content',
      message: `Disabled ${refresh.length} meta refresh navigation directive(s) in ${path}.`,
      path,
    });
  }
}

function inspectStaticPresentationHints(document: Document): ContentPresentationHints {
  const root = document.documentElement;
  const direction = normalizeDirection(root?.getAttribute('dir'));
  const writingMode = normalizeWritingMode(
    inlineStyleValue(root?.getAttribute('style') ?? '', 'writing-mode'),
  );
  const viewport = inspectXhtmlIntrinsicViewport(document);
  return {
    ...(direction ? { direction } : {}),
    ...(writingMode ? { writingMode } : {}),
    ...(viewport ? { viewport } : {}),
  };
}

function inlineStyleValue(style: string, property: string): string | undefined {
  for (const declaration of style.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    if (declaration.slice(0, colon).trim().toLowerCase() !== property) continue;
    return declaration.slice(colon + 1).trim().replace(/\s*!important\s*$/i, '');
  }
  return undefined;
}

function normalizeDirection(value: string | null): TextDirection | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'ltr' || normalized === 'rtl' || normalized === 'auto'
    ? normalized
    : undefined;
}

function normalizeWritingMode(value: string | undefined): WritingMode | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'horizontal-tb' || normalized === 'vertical-rl' || normalized === 'vertical-lr'
    ? normalized
    : undefined;
}

function assertParsedXhtml(document: Document, path: PublicationPath): void {
  const root = document.documentElement;
  if (!root) throw new Error(`XHTML content document has no root element: ${path}.`);

  const parserErrors = Array.from(document.getElementsByTagName('parsererror'));
  if (parserErrors.length > 0) {
    throw new Error(`XHTML content document is not well-formed XML: ${path}.`);
  }

  if (root.localName.toLowerCase() !== 'html') {
    throw new Error(`Expected XHTML html root element in ${path}, found ${root.localName}.`);
  }
}

function isParsedXhtml(document: Document): boolean {
  const root = document.documentElement;
  return Boolean(
    root
    && root.localName.toLowerCase() === 'html'
    && document.getElementsByTagName('parsererror').length === 0,
  );
}

function hasRelToken(element: Element, token: string): boolean {
  return (element.getAttribute('rel') ?? '')
    .split(/\s+/)
    .some(value => value.toLowerCase() === token);
}

function formatSrcsetCandidate(url: string, descriptor: string | undefined): string {
  return descriptor ? `${url} ${descriptor}` : url;
}

function isAsciiWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r' || char === '\f';
}

function ensureXmlDeclaration(source: string): string {
  return /^\s*<\?xml\b/i.test(source)
    ? source
    : `<?xml version="1.0" encoding="utf-8"?>\n${source}`;
}

function isXhtmlMediaType(mediaType: string): boolean {
  const normalized = mediaType.split(';', 1)[0]?.trim().toLowerCase();
  return normalized === 'application/xhtml+xml' || normalized === 'text/html';
}
