import { createReaderSurfaceRendererRegistry } from '../../react/surfaces/reader-surface-renderer-registry';
import type { AnyReaderSurfaceRenderer, ReaderSurfaceRendererKind } from '../../react/surfaces/model';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Reader Surface Renderer registry unit test failed: ${message}`);
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

const renderer = (kind: ReaderSurfaceRendererKind, value: string): AnyReaderSurfaceRenderer => ({
  kind,
  render: () => value,
} as AnyReaderSurfaceRenderer);

const defaultFootnote = renderer('footnote', 'default footnote');
const defaultImage = renderer('image', 'default image');
const configuredFootnote = renderer('footnote', 'configured footnote');
const registry = createReaderSurfaceRendererRegistry(
  [defaultImage, defaultFootnote],
  [configuredFootnote],
);

assert(Object.isFrozen(registry) && Object.isFrozen(registry.renderers), 'registry output must be immutable');
assert(registry.resolve('footnote') === registry.renderers[0], 'configured provider must replace the default for its semantic kind');
assert(registry.resolve('footnote') !== defaultFootnote, 'single-provider override must not form a renderer chain');
assert(registry.resolve('image')?.kind === 'image', 'unreplaced defaults must remain active');
assert(registry.renderers.map(item => item.kind).join(',') === 'footnote,image', 'provider order must follow fixed semantic kind order');

assertThrows(
  () => createReaderSurfaceRendererRegistry([], [renderer('mark', 'one'), renderer('mark', 'two')]),
  'two configured providers for one kind must be rejected',
);
assertThrows(
  () => createReaderSurfaceRendererRegistry([], [{ kind: 'panel', render: () => null } as never]),
  'non-transient and arbitrary surface kinds must be rejected',
);
assertThrows(
  () => createReaderSurfaceRendererRegistry([], [{ kind: 'selection' } as never]),
  'providers without a render function must be rejected',
);

console.log('Reader Surface Renderer registry unit test: PASS');
