import {
  configureReaderExtensions,
  type BrowserEpubReaderOptions,
  type ContentDocumentCompatibilityRule,
  type ReaderInputBinding,
  type ReaderThemeDefinition,
} from '../core';

const verticalDocumentCompatibility: ContentDocumentCompatibilityRule = {
  id: 'example.compatibility.vertical-document-marker',
  family: 'content-document',
  stage: 'content-document.processing',
  revision: '1',
  enabledByDefault: true,
  apply(context, state) {
    if (!context.authoredSource.includes('data-example-vertical')) return { value: state };
    return {
      value: {
        ...state,
        hints: { ...state.hints, writingMode: 'vertical-rl' },
      },
    };
  },
};

const vimPageKeys: ReaderInputBinding = {
  id: 'example.input.vim-page-keys',
  priority: 100,
  kinds: ['keyboard'],
  shortcuts: [{
    label: 'Navigation',
    items: [
      { keys: ['J'], action: 'Next page' },
      { keys: ['K'], action: 'Previous page' },
    ],
  }],
  map(signal) {
    if (signal.kind !== 'keyboard') return null;
    if (signal.key.toLowerCase() === 'j') {
      return { type: 'navigate', direction: 'forward', source: 'keyboard' };
    }
    if (signal.key.toLowerCase() === 'k') {
      return { type: 'navigate', direction: 'backward', source: 'keyboard' };
    }
    return null;
  },
};

const midnightTheme: ReaderThemeDefinition = {
  id: 'example-midnight',
  label: 'Midnight',
  preview: 'linear-gradient(135deg, #111827, #334155)',
  foreground: '#e5e7eb',
  background: '#111827',
  link: '#93c5fd',
  colorScheme: 'dark',
  forceTextColor: true,
  ui: {
    reader: '#0f172a',
    surface: '#111827',
    surfaceRaised: '#1e293b',
    text: '#f8fafc',
    textMuted: '#cbd5e1',
    line: '#334155',
    accent: '#93c5fd',
  },
};

export const readerExtensions = configureReaderExtensions({
  compatibilityModules: [verticalDocumentCompatibility],
  inputBindings: [vimPageKeys],
  themes: [midnightTheme],
});

export const readerOptions = {
  extensions: readerExtensions,
  preferences: { theme: 'example-midnight' },
} satisfies BrowserEpubReaderOptions;
