import type { RenditionCapabilities } from '../../core';
import { readerSettingsSectionVisibility } from '../../react/panels/settings/reader-settings-model';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Reader settings model unit test failed: ${message}`);
}

function capabilities(fontSize: boolean, lineHeight: boolean): Pick<RenditionCapabilities, 'textCustomization'> {
  return {
    textCustomization: {
      fontSize,
      fontFamily: true,
      lineHeight,
    },
  };
}

const reflowable = readerSettingsSectionVisibility({
  layout: 'reflowable',
  writingMode: 'horizontal-tb',
  capabilities: capabilities(true, true),
});
assert(!reflowable.showComic, 'reflowable publications must not show comic display settings');
assert(reflowable.showText, 'reflowable publications must show text settings');
assert(reflowable.typographyEnabled && reflowable.lineHeightEnabled, 'supported reflowable text controls must remain enabled');
assert(!reflowable.verticalWriting, 'horizontal publications must not use vertical typography labels');

const fixedLayout = readerSettingsSectionVisibility({
  layout: 'fixed-layout',
  writingMode: 'horizontal-tb',
  capabilities: capabilities(false, false),
});
assert(fixedLayout.showComic, 'fixed-layout publications must expose comic display settings');
assert(!fixedLayout.showText, 'fixed-layout publications must not expose text settings');
assert(!fixedLayout.typographyEnabled && !fixedLayout.lineHeightEnabled, 'hidden fixed-layout text controls must be disabled');

const mixed = readerSettingsSectionVisibility({
  layout: 'mixed',
  writingMode: 'vertical-rl',
  capabilities: capabilities(false, false),
});
assert(mixed.showComic && mixed.showText, 'mixed publications must expose both fixed and reflowable settings');
assert(mixed.typographyEnabled && mixed.lineHeightEnabled, 'one fixed-layout spine item must not disable publication-scoped mixed text settings');
assert(mixed.verticalWriting, 'vertical publications must expose vertical typography semantics');

const restricted = readerSettingsSectionVisibility({
  layout: 'reflowable',
  writingMode: 'horizontal-tb',
  capabilities: capabilities(false, true),
});
assert(!restricted.typographyEnabled, 'unsupported font sizing must disable its typography controls');
assert(restricted.lineHeightEnabled, 'line height must remain independently enabled when supported');

console.log('Reader settings model unit test: PASS');
