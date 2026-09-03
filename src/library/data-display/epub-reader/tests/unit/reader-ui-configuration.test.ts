import { BUILT_IN_READER_INPUT_BINDINGS, BUILTIN_READER_THEMES } from '../../core';
import {
  DEFAULT_READER_UI_CONFIGURATION,
  configureReaderUi,
} from '../../react/configuration/reader-ui-configuration';
import { readerLayoutForWidth } from '../../react/configuration/layout';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Reader UI configuration unit test failed: ${message}`);
}

function assertThrows(run: () => void, message: string): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

assert(Object.isFrozen(DEFAULT_READER_UI_CONFIGURATION), 'the default configuration must be immutable');
assert(Object.isFrozen(DEFAULT_READER_UI_CONFIGURATION.messages), 'default messages must be immutable');
assert(Object.isFrozen(DEFAULT_READER_UI_CONFIGURATION.layout), 'default layout must be immutable');
assert(Object.isFrozen(DEFAULT_READER_UI_CONFIGURATION.appearance), 'default appearance must be immutable');
assert(DEFAULT_READER_UI_CONFIGURATION.layout.compactBreakpointPx === 700, 'the default compact breakpoint must preserve current behavior');
assert(DEFAULT_READER_UI_CONFIGURATION.layout.panelWidthPx === 380, 'the default panel width must preserve current behavior');
assert(readerLayoutForWidth(700, 700) === 'compact', 'the compact breakpoint must be inclusive');
assert(readerLayoutForWidth(701, 700) === 'wide', 'width above the configured breakpoint must stay wide');
assert(readerLayoutForWidth(640, 640) === 'compact', 'custom breakpoints must drive the same layout decision');

const configured = configureReaderUi({
  inputBindings: [{
    id: 'test.ui.input',
    priority: 100,
    kinds: ['keyboard'],
    map: signal => signal.kind === 'keyboard' && signal.key === 'j'
      ? { type: 'navigate', direction: 'forward', source: 'keyboard' }
      : null,
  }],
  themes: [{ id: 'test-ui-theme', label: 'UI theme', background: '#101214' }],
  messages: {
    reading: 'Currently reading',
    sectionPosition: (section, total) => `${section}/${total}`,
  },
  layout: { compactBreakpointPx: 640, panelWidthPx: 420 },
  appearance: { density: 'compact', motion: 'reduced' },
  tools: [{
    id: 'product.statistics',
    label: 'Statistics',
    shortLabel: 'Stats',
    description: 'Publication reading statistics',
    placement: 'secondary',
    renderIcon: () => null,
    render: () => null,
  }],
  surfaceRenderers: [{ kind: 'footnote', render: () => null }],
});

assert(configured.messages.reading === 'Currently reading', 'custom static messages must override defaults');
assert(configured.messages.sectionPosition(2, 5) === '2/5', 'custom dynamic messages must receive their values');
assert(configured.layout.compactBreakpointPx === 640 && configured.layout.panelWidthPx === 420, 'validated layout values must be retained');
assert(configured.appearance.density === 'compact' && configured.appearance.motion === 'reduced', 'validated appearance values must be retained');
assert(configured.toolModules[0]?.id === 'product.statistics', 'validated peer tools must be retained for the React composition root');
assert(Object.isFrozen(configured.toolModules), 'validated tool contributions must be immutable');
assert(configured.surfaceRenderers[0]?.kind === 'footnote', 'validated Surface Renderer overrides must be retained');
assert(Object.isFrozen(configured.surfaceRenderers), 'validated Surface Renderer overrides must be immutable');
assert(
  configured.extensions.inputMap.description.bindingIds.length === BUILT_IN_READER_INPUT_BINDINGS.length + 1,
  'the UI configuration must compose input contributions through the Core registry',
);
assert(
  configured.extensions.themeCatalog.list().length === BUILTIN_READER_THEMES.length + 1,
  'the UI configuration must compose theme contributions through the Core registry',
);
assert(configured.extensions.themeCatalog.resolve('test-ui-theme')?.background === '#101214', 'the contributed theme must reach the Core catalog');

assertThrows(() => configureReaderUi({ layout: { compactBreakpointPx: 200 } }), 'unsafe compact breakpoints must be rejected');
assertThrows(() => configureReaderUi({ layout: { panelWidthPx: Number.NaN } }), 'non-finite layout values must be rejected');
assertThrows(
  () => configureReaderUi({ appearance: { density: 'dense' as 'compact' } }),
  'unknown density values must be rejected',
);
assertThrows(
  () => configureReaderUi({ messages: { reading: '' } }),
  'empty messages must be rejected',
);
assertThrows(
  () => configureReaderUi({ messages: { unknown: 'value' } as never }),
  'unknown message keys must be rejected',
);
assertThrows(
  () => configureReaderUi({ messages: { sectionPosition: () => '' } }),
  'dynamic message functions with empty output must be rejected',
);
assertThrows(
  () => configureReaderUi({ unknown: true } as never),
  'unknown top-level configuration keys must be rejected',
);
assertThrows(
  () => configureReaderUi({
    tools: [{
      id: 'search',
      label: 'Replacement search',
      shortLabel: 'Search',
      description: 'Attempts to replace a built-in',
      placement: 'primary',
      renderIcon: () => null,
      render: () => null,
    }],
  }),
  'built-in tool ids must be reserved',
);
assertThrows(
  () => configureReaderUi({
    surfaceRenderers: [
      { kind: 'image', render: () => null },
      { kind: 'image', render: () => null },
    ],
  }),
  'multiple configured providers for one Surface kind must be rejected',
);

console.log('Reader UI configuration unit test: PASS');
