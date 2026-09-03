import { configureReaderExtensions } from '../../core';
import { BUILT_IN_READER_TOOL_MANIFEST } from '../tools/built-in-reader-tool-manifest';
import { createReaderToolRegistry } from '../tools/reader-tool-registry';
import { createReaderSurfaceRendererRegistry } from '../surfaces/reader-surface-renderer-registry';
import type {
  ReaderUiAppearanceConfiguration,
  ReaderUiConfiguration,
  ReaderUiConfigurationOptions,
  ReaderUiLayoutConfiguration,
  ReaderUiMessages,
} from './model';

const defaultReaderUiMessages: ReaderUiMessages = {
  openingPublicationTitle: 'Opening publication…',
  loadingChapter: 'Loading…',
  reading: 'Reading',
  preparingBook: 'Preparing your book',
  skipToContent: 'Skip to reading content',
  readerInstructions: 'Use the Left and Right Arrow keys to turn pages. Press C to toggle controls or question mark for keyboard help.',
  toolbarLabel: 'EPUB reader toolbar',
  publicationNavigationLabel: 'Publication navigation',
  readingToolsLabel: 'Reading tools',
  back: 'Back',
  forward: 'Forward',
  backToPreviousLocation: 'Back to previous reading location',
  forwardToNextLocation: 'Forward to next reading location',
  moreTools: 'More reader tools',
  enterFullscreen: 'Enter full screen',
  exitFullscreen: 'Exit full screen',
  fullscreen: 'Full screen',
  fullscreenUnavailable: 'Full screen is not available.',
  pinControls: 'Pin controls',
  unpinControls: 'Unpin controls',
  keepControlsVisible: 'Keep controls visible',
  allowControlsToHide: 'Allow controls to hide automatically',
  actionFailed: 'That did not work. Try again.',
  unresolvedPublicationLink: 'This book link could not be opened.',
  bookmarkSaved: 'Bookmark saved',
  beginningOfBook: 'Beginning of book',
  endOfBook: 'End of book',
  highlightSaved: 'Highlight saved',
  noteSaved: 'Note saved',
  closeFootnote: 'Close footnote',
  openNoteLocation: 'Open note location',
  readingNavigation: 'Reading navigation',
  previous: 'Previous',
  next: 'Next',
  unavailable: 'Unavailable',
  opening: 'Opening…',
  ready: 'Ready',
  loadingEpub: 'Loading EPUB…',
  preparing: 'Preparing…',
  openingPublication: 'Opening publication',
  unableToOpenEpub: 'Unable to open EPUB',
  epubOpenFailed: 'The EPUB could not be opened.',
  tryAgain: 'Try again',
  compatibilityStatus: status => `Compatibility: ${status}`,
  closePanel: label => `Close ${label}`,
  sectionPosition: (section, total) => `Section ${section} of ${total}`,
  sectionsPosition: (start, end, total) => `Sections ${start}–${end} of ${total}`,
  positionInPublication: 'Position in publication',
  positionInSection: 'Position in current section',
  progressThrough: (percent, scope) => `${percent}% through ${scope}`,
  openPhase: phase => ({
    archive: 'Opening archive…',
    package: 'Reading publication metadata…',
    preflight: 'Checking book content…',
    resources: 'Preparing book resources…',
    rendition: 'Preparing the reading view…',
  })[phase],
};

export const DEFAULT_READER_UI_MESSAGES: ReaderUiMessages = Object.freeze(defaultReaderUiMessages);

export const DEFAULT_READER_UI_LAYOUT: ReaderUiLayoutConfiguration = Object.freeze({
  compactBreakpointPx: 700,
  panelWidthPx: 380,
});

export const DEFAULT_READER_UI_APPEARANCE: ReaderUiAppearanceConfiguration = Object.freeze({
  density: 'comfortable',
  motion: 'system',
});

/** Validates UI settings and composes Core extensions through their existing registries. */
export function configureReaderUi(options: ReaderUiConfigurationOptions = {}): ReaderUiConfiguration {
  assertKnownKeys(options, {
    compatibilityModules: undefined,
    inputBindings: undefined,
    themes: undefined,
    tools: undefined,
    surfaceRenderers: undefined,
    messages: undefined,
    layout: undefined,
    appearance: undefined,
  }, 'Reader UI configuration');
  assertKnownKeys(options.messages, DEFAULT_READER_UI_MESSAGES, 'Reader UI messages');
  assertKnownKeys(options.layout, DEFAULT_READER_UI_LAYOUT, 'Reader UI layout');
  assertKnownKeys(options.appearance, DEFAULT_READER_UI_APPEARANCE, 'Reader UI appearance');

  const messages = Object.freeze({ ...DEFAULT_READER_UI_MESSAGES, ...options.messages });
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === 'string' && (!value.trim() || value.length > 320)) {
      throw new TypeError(`Reader UI message ${key} must be a non-empty string of at most 320 characters.`);
    }
    if (typeof value !== 'string' && typeof value !== 'function') {
      throw new TypeError(`Reader UI message ${key} must be a string or message function.`);
    }
  }
  validateDynamicMessages(messages);

  const layout = Object.freeze({ ...DEFAULT_READER_UI_LAYOUT, ...options.layout });
  assertFiniteRange(layout.compactBreakpointPx, 320, 1600, 'compactBreakpointPx');
  assertFiniteRange(layout.panelWidthPx, 280, 720, 'panelWidthPx');

  const appearance = Object.freeze({ ...DEFAULT_READER_UI_APPEARANCE, ...options.appearance });
  if (!['comfortable', 'compact'].includes(appearance.density)) {
    throw new TypeError(`Unsupported Reader UI density: ${String(appearance.density)}.`);
  }
  if (!['system', 'reduced'].includes(appearance.motion)) {
    throw new TypeError(`Unsupported Reader UI motion policy: ${String(appearance.motion)}.`);
  }

  const toolModules = createReaderToolRegistry(options.tools ?? []).modules;
  const surfaceRenderers = createReaderSurfaceRendererRegistry([], options.surfaceRenderers ?? []).renderers;
  for (const module of toolModules) {
    if (BUILT_IN_READER_TOOL_MANIFEST.some(builtIn => builtIn.id === module.id)) {
      throw new TypeError(`Reader tool id ${module.id} is reserved by a built-in tool.`);
    }
    if (module.command && BUILT_IN_READER_TOOL_MANIFEST.some(
      builtIn => 'command' in builtIn && builtIn.command === module.command,
    )) {
      throw new TypeError(`Reader command ${module.command} is reserved by a built-in tool.`);
    }
  }

  return Object.freeze({
    extensions: configureReaderExtensions({
      compatibilityModules: options.compatibilityModules,
      inputBindings: options.inputBindings,
      themes: options.themes,
    }),
    toolModules,
    surfaceRenderers,
    messages,
    layout,
    appearance,
  });
}

export const DEFAULT_READER_UI_CONFIGURATION = configureReaderUi();

function assertKnownKeys(
  value: object | undefined,
  allowed: object,
  label: string,
): void {
  if (!value) return;
  const known = new Set(Object.keys(allowed));
  for (const key of Object.keys(value)) {
    if (!known.has(key)) throw new TypeError(`${label} contains an unsupported key: ${key}.`);
  }
}

function assertFiniteRange(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`Reader UI ${name} must be between ${minimum} and ${maximum}.`);
  }
}

function validateDynamicMessages(messages: ReaderUiMessages): void {
  const samples = [
    ...(['clean', 'repaired', 'degraded', 'blocked'] as const).map(status => messages.compatibilityStatus(status)),
    messages.closePanel('Panel'),
    messages.sectionPosition(1, 2),
    messages.sectionsPosition(1, 2, 3),
    messages.progressThrough(50, 'publication'),
    messages.progressThrough(50, 'section'),
    ...(['archive', 'package', 'preflight', 'resources', 'rendition'] as const).map(phase => messages.openPhase(phase)),
  ];
  if (samples.some(value => typeof value !== 'string' || !value.trim() || value.length > 320)) {
    throw new TypeError('Reader UI message functions must return non-empty strings of at most 320 characters.');
  }
}
