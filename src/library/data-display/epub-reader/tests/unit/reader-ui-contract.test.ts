import { BUILT_IN_READER_TOOL_MANIFEST } from '../../react/tools/built-in-reader-tool-manifest';
import { surfaceReturnFocus, type ReaderSurface } from '../../react/chrome/reader-surface-model';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Reader UI contract test failed: ${message}`);
}

const expectedToolIds = ['contents', 'search', 'marks', 'settings', 'compatibility', 'help'];
assert(
  BUILT_IN_READER_TOOL_MANIFEST.map(panel => panel.id).join(',') === expectedToolIds.join(','),
  'the default reader tools and their stable order must remain observable during modularization',
);
assert(new Set(BUILT_IN_READER_TOOL_MANIFEST.map(panel => panel.id)).size === BUILT_IN_READER_TOOL_MANIFEST.length, 'default tool ids must be unique');
for (const panel of BUILT_IN_READER_TOOL_MANIFEST) {
  assert(panel.label.trim() !== '', `${panel.id} must have a panel label`);
  assert(panel.shortLabel.trim() !== '', `${panel.id} must have a compact label`);
  assert(panel.description.trim() !== '', `${panel.id} must have a panel description`);
}

const directFocus = { id: 'direct' } as unknown as HTMLElement;
const activationFocus = { id: 'activation' } as unknown as HTMLElement;
const imageTrigger = { id: 'image' } as unknown as HTMLElement;
assert(
  surfaceReturnFocus({ kind: 'panel', panel: 'contents', returnFocus: directFocus }) === directFocus,
  'a panel must return focus to the control that opened it',
);
assert(
  surfaceReturnFocus({ kind: 'footnote', source: new Uint8Array(), footnote: {}, returnFocus: directFocus } as ReaderSurface) === directFocus,
  'a footnote must retain its explicit return target',
);
assert(
  surfaceReturnFocus({ kind: 'external-link', source: new Uint8Array(), target: {}, returnFocus: directFocus } as ReaderSurface) === directFocus,
  'external-link confirmation must retain its explicit return target',
);
assert(
  surfaceReturnFocus({ kind: 'selection', activation: { returnFocus: activationFocus } } as ReaderSurface) === activationFocus,
  'selection tools must return to their publication surface',
);
assert(
  surfaceReturnFocus({ kind: 'mark', activation: { returnFocus: activationFocus } } as ReaderSurface) === activationFocus,
  'mark tools must return to their activation target',
);
assert(
  surfaceReturnFocus({ kind: 'image', activation: { trigger: imageTrigger } } as ReaderSurface) === imageTrigger,
  'the image viewer must return to its image trigger',
);
assert(surfaceReturnFocus({ kind: 'none' }) === null, 'an empty surface has no focus target');

console.log('Reader UI contract unit test: PASS');
