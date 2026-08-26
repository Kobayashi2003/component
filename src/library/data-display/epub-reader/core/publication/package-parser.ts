import type {
  Contributor,
  EpubVersion,
  ManifestItem,
  MetadataEntry,
  PageProgressionDirection,
  Publication,
  PublicationDiagnostic,
  PublicationMetadata,
  PublicationPath,
  PublicationRendition,
  RenditionFlow,
  RenditionLayout,
  RenditionOrientation,
  RenditionSpread,
  SpineItem,
  SpineRenditionOverrides,
  TextDirection,
  Landmark,
} from './model';
import { resolvePublicationReference } from './path';
import { attr, childElements, firstChild, parseXml, textContent, tokenList, type XmlElementNode } from '../xml/xml';

export interface ParsedPackageDocument {
  readonly publication: Publication | null;
  readonly navigationItem?: ManifestItem;
  readonly ncxItem?: ManifestItem;
  readonly epub2Guide: readonly Landmark[];
  readonly diagnostics: readonly PublicationDiagnostic[];
}

const DEFAULT_RENDITION: PublicationRendition = Object.freeze({
  layout: 'reflowable',
  orientation: 'auto',
  spread: 'auto',
  flow: 'auto',
});

export function parsePackageDocument(xml: string, packagePath: PublicationPath): ParsedPackageDocument {
  const parsed = parseXml(xml, packagePath, 'package');
  const diagnostics = [...parsed.diagnostics];
  const root = parsed.root;
  if (!root || root.localName !== 'package') {
    diagnostics.push(diag('PACKAGE_ROOT_INVALID', 'fatal', 'Package document does not have a <package> root.', packagePath));
    return { publication: null, epub2Guide: [], diagnostics };
  }

  const version = (attr(root, 'version') ?? 'unknown') as EpubVersion;
  const metadataElement = firstChild(root, 'metadata');
  const manifestElement = firstChild(root, 'manifest');
  const spineElement = firstChild(root, 'spine');

  if (!metadataElement) diagnostics.push(diag('PACKAGE_METADATA_MISSING', 'error', 'Package document is missing <metadata>.', packagePath));
  if (!manifestElement) diagnostics.push(diag('PACKAGE_MANIFEST_MISSING', 'fatal', 'Package document is missing <manifest>.', packagePath));
  if (!spineElement) diagnostics.push(diag('PACKAGE_SPINE_MISSING', 'fatal', 'Package document is missing <spine>.', packagePath));
  if (!manifestElement || !spineElement) return { publication: null, epub2Guide: [], diagnostics };

  const metadata = parseMetadata(metadataElement, root, diagnostics, packagePath);
  const rendition = parseGlobalRendition(metadataElement, diagnostics, packagePath);
  const manifest = parseManifest(manifestElement, diagnostics, packagePath);
  const manifestById = new Map(manifest.map(item => [item.id, item]));
  const { spine, progression } = parseSpine(root, spineElement, manifestById, diagnostics, packagePath);
  const guide = parseGuide(firstChild(root, 'guide'), packagePath, diagnostics);

  const navigationItem = manifest.find(item => item.properties.includes('nav'));
  const spineTocId = attr(spineElement, 'toc');
  const ncxItem = spineTocId
    ? manifestById.get(spineTocId)
    : manifest.find(item => item.mediaType === 'application/x-dtbncx+xml');

  if (version.startsWith('3') && !navigationItem) {
    diagnostics.push(diag('PACKAGE_NAV_ITEM_MISSING', 'error', 'EPUB 3 package has no manifest item with the `nav` property.', packagePath));
  }

  const publication: Publication = {
    version,
    packagePath,
    metadata,
    manifest,
    spine,
    navigation: { source: 'none', toc: [], landmarks: [], pageList: [] },
    pageProgressionDirection: progression,
    rendition,
  };

  return { publication, navigationItem, ncxItem, epub2Guide: guide, diagnostics };
}

function parseMetadata(
  metadata: XmlElementNode | undefined,
  packageElement: XmlElementNode,
  diagnostics: PublicationDiagnostic[],
  packagePath: PublicationPath,
): PublicationMetadata {
  if (!metadata) return { creators: [], contributors: [], entries: [] };

  const children = childElements(metadata);
  const entries: MetadataEntry[] = [];
  const byId = new Map<string, XmlElementNode>();
  const refinements = new Map<string, XmlElementNode[]>();

  for (const element of children) {
    const id = attr(element, 'id');
    if (id) byId.set(id, element);

    if (element.localName === 'meta') {
      const property = attr(element, 'property') ?? attr(element, 'name');
      const value = attr(element, 'content') ?? textContent(element);
      const refines = attr(element, 'refines');
      if (property) {
        entries.push(metadataEntry(property, value, element));
        if (refines?.startsWith('#')) {
          const target = refines.slice(1);
          const list = refinements.get(target) ?? [];
          list.push(element);
          refinements.set(target, list);
        }
      }
      continue;
    }

    if (isDublinCoreElement(element)) {
      entries.push(metadataEntry(`dc:${element.localName}`, textContent(element), element));
    }
  }

  const dc = (name: string) => children.filter(element => element.localName === name && isDublinCoreElement(element));
  const firstText = (name: string) => dc(name).map(textContent).find(Boolean);

  const uniqueIdentifierId = attr(packageElement, 'unique-identifier');
  let identifierElement = uniqueIdentifierId ? byId.get(uniqueIdentifierId) : undefined;
  if (!identifierElement || identifierElement.localName !== 'identifier') identifierElement = dc('identifier')[0];

  const identifier = identifierElement ? {
    value: textContent(identifierElement),
    scheme: identifierScheme(identifierElement, refinements),
  } : undefined;

  if (!identifier?.value) diagnostics.push(diag('PACKAGE_IDENTIFIER_MISSING', 'error', 'Publication identifier is missing.', packagePath));

  const titleElements = dc('title');
  const title = titleElements.map(textContent).find(Boolean);
  let subtitle: string | undefined;
  for (const element of titleElements) {
    const id = attr(element, 'id');
    if (!id) continue;
    const titleType = findRefinementValue(refinements.get(id), 'title-type');
    if (titleType === 'subtitle') {
      subtitle = textContent(element);
      break;
    }
  }

  const creators = dc('creator').map(element => contributorFromElement(element, refinements));
  const contributors = dc('contributor').map(element => contributorFromElement(element, refinements));

  const modified = children
    .filter(element => element.localName === 'meta' && attr(element, 'property') === 'dcterms:modified' && !attr(element, 'refines'))
    .map(textContent)
    .find(Boolean);

  return {
    identifier,
    title,
    subtitle,
    language: firstText('language'),
    modified,
    publisher: firstText('publisher'),
    description: firstText('description'),
    rights: firstText('rights'),
    creators,
    contributors,
    entries,
  };
}

function parseManifest(
  manifestElement: XmlElementNode,
  diagnostics: PublicationDiagnostic[],
  packagePath: PublicationPath,
): ManifestItem[] {
  const items: ManifestItem[] = [];
  for (const element of childElements(manifestElement, 'item')) {
    const id = attr(element, 'id');
    const sourceHref = attr(element, 'href');
    const mediaType = attr(element, 'media-type');
    if (!id || !sourceHref || !mediaType) {
      diagnostics.push(diag('PACKAGE_MANIFEST_ITEM_INVALID', 'error', 'Manifest item is missing id, href, or media-type.', packagePath));
      continue;
    }

    try {
      const ref = resolvePublicationReference(packagePath, sourceHref);
      items.push({
        id,
        sourceHref,
        href: ref.href,
        path: ref.path,
        remote: ref.remote,
        mediaType,
        mediaOverlay: attr(element, 'media-overlay'),
        fallback: attr(element, 'fallback'),
        properties: tokenList(attr(element, 'properties')),
      });
    } catch (cause) {
      diagnostics.push({ ...diag('PACKAGE_MANIFEST_HREF_INVALID', 'error', `Manifest href could not be resolved: ${sourceHref}.`, packagePath), cause });
    }
  }
  return items;
}

function parseSpine(
  packageElement: XmlElementNode,
  spineElement: XmlElementNode,
  manifestById: ReadonlyMap<string, ManifestItem>,
  diagnostics: PublicationDiagnostic[],
  packagePath: PublicationPath,
): { spine: SpineItem[]; progression: PageProgressionDirection } {
  const rawProgression = attr(spineElement, 'page-progression-direction');
  const progression: PageProgressionDirection = rawProgression === 'ltr' || rawProgression === 'rtl'
    ? rawProgression
    : 'default';
  if (rawProgression && rawProgression !== 'default' && rawProgression !== 'ltr' && rawProgression !== 'rtl') {
    diagnostics.push(diag('PACKAGE_PAGE_PROGRESSION_INVALID', 'warning', `Unknown page-progression-direction: ${rawProgression}.`, packagePath));
  }

  const spine: SpineItem[] = [];
  const spineStep = cfiElementStep(packageElement, spineElement);
  for (const element of childElements(spineElement, 'itemref')) {
    const idref = attr(element, 'idref');
    if (!idref) {
      diagnostics.push(diag('PACKAGE_SPINE_IDREF_MISSING', 'error', 'Spine itemref is missing idref.', packagePath));
      continue;
    }
    const manifest = manifestById.get(idref);
    if (!manifest) {
      diagnostics.push(diag('PACKAGE_SPINE_IDREF_UNRESOLVED', 'error', `Spine idref ${idref} does not resolve to a manifest item.`, packagePath));
      continue;
    }
    const properties = tokenList(attr(element, 'properties'));
    const itemrefId = attr(element, 'id');
    const itemrefStep = cfiElementStep(spineElement, element);
    spine.push({
      index: spine.length,
      idref,
      ...(itemrefId ? { itemrefId } : {}),
      cfiBase: `${spineStep}${itemrefStep}!`,
      href: manifest.href,
      path: manifest.path,
      remote: manifest.remote,
      mediaType: manifest.mediaType,
      linear: attr(element, 'linear') !== 'no',
      properties,
      rendition: parseSpineRendition(properties, diagnostics, packagePath, spine.length),
    });
  }
  return { spine, progression };
}


function cfiElementStep(parent: XmlElementNode, child: XmlElementNode): string {
  const elements = childElements(parent);
  const index = elements.indexOf(child);
  if (index < 0) throw new Error('Cannot compute CFI step for a non-child package element.');
  const id = attr(child, 'id');
  return `/${(index + 1) * 2}${id ? `[${escapeCfiAssertion(id)}]` : ''}`;
}

function escapeCfiAssertion(value: string): string {
  return value.replace(/[\]^,();]|\[/g, character => `^${character}`);
}

function parseGlobalRendition(
  metadata: XmlElementNode | undefined,
  diagnostics: PublicationDiagnostic[],
  packagePath: PublicationPath,
): PublicationRendition {
  if (!metadata) return DEFAULT_RENDITION;
  const metas = childElements(metadata, 'meta').filter(meta => !attr(meta, 'refines'));
  const value = (property: string): string | undefined => metas
    .filter(meta => attr(meta, 'property') === property)
    .map(textContent)
    .find(Boolean);

  return {
    layout: enumValue(value('rendition:layout'), ['reflowable', 'pre-paginated'], 'reflowable', 'rendition:layout', diagnostics, packagePath),
    orientation: enumValue(value('rendition:orientation'), ['auto', 'portrait', 'landscape'], 'auto', 'rendition:orientation', diagnostics, packagePath),
    spread: enumValue(value('rendition:spread'), ['auto', 'none', 'landscape', 'portrait', 'both'], 'auto', 'rendition:spread', diagnostics, packagePath),
    flow: enumValue(value('rendition:flow'), ['auto', 'paginated', 'scrolled-continuous', 'scrolled-doc'], 'auto', 'rendition:flow', diagnostics, packagePath),
  } as PublicationRendition;
}

function parseSpineRendition(
  properties: readonly string[],
  diagnostics: PublicationDiagnostic[],
  packagePath: PublicationPath,
  spineIndex: number,
): SpineRenditionOverrides {
  const out: {
    layout?: RenditionLayout;
    orientation?: RenditionOrientation;
    spread?: RenditionSpread;
    flow?: RenditionFlow;
    pageSpread?: 'left' | 'right' | 'center';
    alignXCenter?: boolean;
  } = {};

  applyExclusive('layout', [
    ['rendition:layout-reflowable', 'reflowable'],
    ['rendition:layout-pre-paginated', 'pre-paginated'],
  ] as const);
  applyExclusive('orientation', [
    ['rendition:orientation-auto', 'auto'],
    ['rendition:orientation-portrait', 'portrait'],
    ['rendition:orientation-landscape', 'landscape'],
  ] as const);
  applyExclusive('spread', [
    ['rendition:spread-auto', 'auto'],
    ['rendition:spread-none', 'none'],
    ['rendition:spread-landscape', 'landscape'],
    ['rendition:spread-portrait', 'portrait'],
    ['rendition:spread-both', 'both'],
  ] as const);
  applyExclusive('flow', [
    ['rendition:flow-auto', 'auto'],
    ['rendition:flow-paginated', 'paginated'],
    ['rendition:flow-scrolled-continuous', 'scrolled-continuous'],
    ['rendition:flow-scrolled-doc', 'scrolled-doc'],
  ] as const);

  const placement: Array<readonly [string, 'left' | 'right' | 'center']> = [
    ['rendition:page-spread-left', 'left'],
    ['page-spread-left', 'left'],
    ['rendition:page-spread-right', 'right'],
    ['page-spread-right', 'right'],
    ['rendition:page-spread-center', 'center'],
  ];
  const placementByToken = new Map(placement);
  const placementHits = properties
    .map(token => [token, placementByToken.get(token)] as const)
    .filter((entry): entry is readonly [string, 'left' | 'right' | 'center'] => entry[1] !== undefined);
  const distinctPlacement = [...new Set(placementHits.map(([, value]) => value))];
  if (distinctPlacement.length > 1) {
    diagnostics.push({ ...diag('PACKAGE_SPINE_PAGE_SPREAD_CONFLICT', 'error', 'Spine item declares conflicting page-spread properties; the first authored value is used for reading-system recovery.', packagePath), spineIndex, repair: { strategy: 'use-first-authored-page-spread', description: 'Use the first authored page-spread token and ignore conflicting later tokens.', confidence: 1 } });
  }
  if (placementHits[0]) out.pageSpread = placementHits[0][1];

  if (properties.includes('rendition:align-x-center')) out.alignXCenter = true;
  return out;

  function applyExclusive<K extends 'layout' | 'orientation' | 'spread' | 'flow', V extends NonNullable<(typeof out)[K]>>(
    key: K,
    mappings: readonly (readonly [string, V])[],
  ) {
    const valueByToken = new Map<string, V>(mappings);
    const hits = properties
      .map(token => [token, valueByToken.get(token)] as const)
      .filter((entry): entry is readonly [string, V] => entry[1] !== undefined);
    const values = [...new Set(hits.map(([, value]) => value))];
    if (values.length > 1) {
      diagnostics.push({ ...diag('PACKAGE_SPINE_RENDITION_CONFLICT', 'error', `Spine item declares conflicting rendition ${key} overrides; the first authored value is used for reading-system recovery.`, packagePath), spineIndex, repair: { strategy: 'use-first-authored-rendition-override', description: `Use the first authored rendition ${key} override and ignore conflicting later tokens.`, confidence: 1 } });
    }
    if (hits[0] !== undefined) (out as Record<string, unknown>)[key] = hits[0][1];
  }
}

function parseGuide(
  guide: XmlElementNode | undefined,
  packagePath: PublicationPath,
  diagnostics: PublicationDiagnostic[],
): Landmark[] {
  if (!guide) return [];
  const landmarks: Landmark[] = [];
  for (const reference of childElements(guide, 'reference')) {
    const type = attr(reference, 'type');
    const href = attr(reference, 'href');
    if (!type || !href) continue;
    try {
      const ref = resolvePublicationReference(packagePath, href);
      landmarks.push({ types: [type], label: attr(reference, 'title'), href: ref.href, path: ref.path, fragment: ref.fragment });
    } catch (cause) {
      diagnostics.push({ ...diag('PACKAGE_GUIDE_HREF_INVALID', 'warning', `EPUB 2 guide href could not be resolved: ${href}.`, packagePath), cause });
    }
  }
  return landmarks;
}

function contributorFromElement(
  element: XmlElementNode,
  refinements: ReadonlyMap<string, XmlElementNode[]>,
): Contributor {
  const id = attr(element, 'id');
  const refined = id ? refinements.get(id) : undefined;
  return {
    name: textContent(element),
    id,
    role: attr(element, 'opf:role', 'role') ?? findRefinementValue(refined, 'role'),
    fileAs: attr(element, 'opf:file-as', 'file-as') ?? findRefinementValue(refined, 'file-as'),
  };
}

function identifierScheme(
  element: XmlElementNode,
  refinements: ReadonlyMap<string, XmlElementNode[]>,
): string | undefined {
  const legacy = attr(element, 'opf:scheme', 'scheme');
  if (legacy) return legacy;
  const id = attr(element, 'id');
  return id ? findRefinementValue(refinements.get(id), 'identifier-type') : undefined;
}

function findRefinementValue(elements: readonly XmlElementNode[] | undefined, property: string): string | undefined {
  return elements?.find(element => attr(element, 'property') === property)
    ? textContent(elements.find(element => attr(element, 'property') === property)!)
    : undefined;
}

function metadataEntry(property: string, value: string, element: XmlElementNode): MetadataEntry {
  const rawDirection = attr(element, 'dir');
  const direction: TextDirection | undefined = rawDirection === 'ltr' || rawDirection === 'rtl' || rawDirection === 'auto'
    ? rawDirection
    : undefined;
  return {
    property,
    value,
    id: attr(element, 'id'),
    refines: attr(element, 'refines'),
    scheme: attr(element, 'scheme', 'opf:scheme'),
    language: attr(element, 'xml:lang', 'lang'),
    direction,
  };
}

function isDublinCoreElement(element: XmlElementNode): boolean {
  const isDcNamespace = element.namespaceUri === 'http://purl.org/dc/elements/1.1/';
  if (!isDcNamespace && !element.name.startsWith('dc:')) return false;
  return [
    'identifier', 'title', 'language', 'contributor', 'coverage', 'creator', 'date', 'description', 'format', 'publisher', 'relation', 'rights', 'source', 'subject', 'type',
  ].includes(element.localName);
}

function enumValue<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  property: string,
  diagnostics: PublicationDiagnostic[],
  packagePath: PublicationPath,
): T {
  if (!value) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  diagnostics.push(diag('PACKAGE_RENDITION_VALUE_INVALID', 'warning', `Unknown ${property} value ${JSON.stringify(value)}; specification default ${fallback} is used.`, packagePath));
  return fallback;
}

function diag(
  code: string,
  severity: PublicationDiagnostic['severity'],
  message: string,
  path: PublicationPath,
): PublicationDiagnostic {
  return { code, severity, phase: 'package', message, path };
}
