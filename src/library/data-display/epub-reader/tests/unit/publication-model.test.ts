import {
  DEFAULT_READER_PREFERENCES,
  hasMixedLayout,
  isFixedLayout,
  normalizeReaderPreferences,
  resolvePublicationLayoutProfile,
  resolveSpineRendition,
  validatePublicationModel,
  type Publication,
  type SpineItem,
} from '../../core/epub/publication';

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

// Publication-level layout profile. Reader chrome keys off this instead of the
// active renderer plan, so that a book which alternates illustration pages with
// chapters does not restyle its interface on every page turn.
assert(resolvePublicationLayoutProfile(publication) === 'mixed', 'interleaved layouts must resolve to a mixed profile');

const reflowableOnly: Publication = { ...publication, spine: [publication.spine[0]!] };
assert(resolvePublicationLayoutProfile(reflowableOnly) === 'reflowable', 'an all-reflowable reading order must not report mixed');

const fixedOnly: Publication = { ...publication, spine: [publication.spine[1]!] };
assert(resolvePublicationLayoutProfile(fixedOnly) === 'fixed-layout', 'an all-pre-paginated reading order must resolve to fixed-layout');

// Only a publication that is pre-paginated from cover to colophon earns the
// immersive chrome; a mixed one must stay on standard chrome throughout.
const chromeFor = (book: Publication) => resolvePublicationLayoutProfile(book) === 'fixed-layout' ? 'immersive' : 'standard';
assert(chromeFor(publication) === 'standard', 'mixed-layout books must keep standard chrome');
assert(chromeFor(fixedOnly) === 'immersive', 'fully pre-paginated books keep the immersive chrome');
assert(chromeFor(reflowableOnly) === 'standard', 'reflowable books keep standard chrome');

// The profile must be decided by the whole reading order, not by whichever item
// happens to be first: front matter is routinely pre-paginated.
const fixedFrontMatter: Publication = {
  ...publication,
  spine: [publication.spine[1]!, { ...publication.spine[0]!, index: 1 } as SpineItem],
};
assert(resolvePublicationLayoutProfile(fixedFrontMatter) === 'mixed', 'a pre-paginated first item must not make the whole book fixed-layout');
assert(hasMixedLayout(fixedFrontMatter), 'hasMixedLayout must agree with the layout profile');

const normalized = normalizeReaderPreferences({
  ...DEFAULT_READER_PREFERENCES,
  fontSizePercent: 999,
  lineHeight: 0.2,
  pageMarginPercent: 99,
  fixedLayoutFit: 'invalid' as typeof DEFAULT_READER_PREFERENCES.fixedLayoutFit,
  fixedLayoutGutter: 'invalid' as typeof DEFAULT_READER_PREFERENCES.fixedLayoutGutter,
  touchNavigation: 'invalid' as typeof DEFAULT_READER_PREFERENCES.touchNavigation,
  pageTurnZonePercent: 99,
});
assert(normalized.fontSizePercent === 300, 'font size should be clamped');
assert(normalized.lineHeight === 0.8, 'line height should be clamped');
assert(normalized.pageMarginPercent === 18, 'page margins should be clamped');
assert(normalized.fixedLayoutFit === 'contain', 'unknown fixed-layout fit modes should fall back to contain');
assert(normalized.fixedLayoutGutter === 'none', 'unknown fixed-layout gutter modes should fall back to none');
assert(normalized.touchNavigation === 'both', 'unknown touch navigation modes should fall back to both gestures');
assert(normalized.pageTurnZonePercent === 40, 'page-turn zones should be clamped');

console.log('Publication model unit test: PASS');
