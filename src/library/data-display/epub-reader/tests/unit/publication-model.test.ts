import {
  DEFAULT_READER_PREFERENCES,
  hasMixedLayout,
  isFixedLayout,
  normalizeReaderPreferences,
  resolveSpineRendition,
  validatePublicationModel,
  type Publication,
} from '../../core/publication';

const publication: Publication = {
  version: '3.3',
  packagePath: 'EPUB/package.opf',
  metadata: {
    title: 'Mixed layout fixture',
    creators: [],
    contributors: [],
    entries: [],
  },
  manifest: [
    { id: 'c1', sourceHref: 'c1.xhtml', href: 'EPUB/c1.xhtml', path: 'EPUB/c1.xhtml', remote: false, mediaType: 'application/xhtml+xml', properties: [] },
    { id: 'p1', sourceHref: 'p1.xhtml', href: 'EPUB/p1.xhtml', path: 'EPUB/p1.xhtml', remote: false, mediaType: 'application/xhtml+xml', properties: [] },
  ],
  spine: [
    {
      index: 0,
      idref: 'c1',
      href: 'EPUB/c1.xhtml',
      path: 'EPUB/c1.xhtml',
      remote: false,
      mediaType: 'application/xhtml+xml',
      linear: true,
      properties: [],
      rendition: {},
    },
    {
      index: 1,
      idref: 'p1',
      href: 'EPUB/p1.xhtml',
      path: 'EPUB/p1.xhtml',
      remote: false,
      mediaType: 'application/xhtml+xml',
      linear: true,
      properties: ['rendition:layout-pre-paginated'],
      rendition: { layout: 'pre-paginated', pageSpread: 'right' },
    },
  ],
  navigation: { source: 'none', toc: [], landmarks: [], pageList: [] },
  pageProgressionDirection: 'rtl',
  rendition: {
    layout: 'reflowable',
    orientation: 'auto',
    spread: 'auto',
    flow: 'auto',
  },
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(validatePublicationModel(publication).length === 0, 'fixture must satisfy model invariants');
assert(hasMixedLayout(publication), 'mixed layout must be detected, not normalized away');
assert(!isFixedLayout(publication, publication.spine[0]!), 'first item should inherit reflowable');
assert(isFixedLayout(publication, publication.spine[1]!), 'second item should override to fixed layout');
assert(resolveSpineRendition(publication, publication.spine[1]!).pageSpread === 'right', 'spread placement must survive resolution');

const normalized = normalizeReaderPreferences({
  ...DEFAULT_READER_PREFERENCES,
  fontSizePercent: 999,
  lineHeight: 0.2,
  pageMarginPercent: 99,
  fixedLayoutFit: 'invalid' as typeof DEFAULT_READER_PREFERENCES.fixedLayoutFit,
  fixedLayoutGutter: 999,
  touchNavigation: 'invalid' as typeof DEFAULT_READER_PREFERENCES.touchNavigation,
  pageTurnZonePercent: 99,
});
assert(normalized.fontSizePercent === 300, 'font size should be clamped');
assert(normalized.lineHeight === 0.8, 'line height should be clamped');
assert(normalized.pageMarginPercent === 18, 'page margins should be clamped');
assert(normalized.fixedLayoutFit === 'contain', 'unknown fixed-layout fit modes should fall back to contain');
assert(normalized.fixedLayoutGutter === 64, 'fixed-layout gutters should be clamped');
assert(normalized.touchNavigation === 'both', 'unknown touch navigation modes should fall back to both gestures');
assert(normalized.pageTurnZonePercent === 40, 'page-turn zones should be clamped');

console.log('Publication model unit test: PASS');
