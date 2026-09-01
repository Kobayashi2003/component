import { INITIAL_READER_CHROME_STATE, reduceReaderChrome, shouldLockReaderChrome } from '../../react/chrome/reader-chrome-model';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Reader chrome model test failed: ${message}`);
}

const hidden = reduceReaderChrome(INITIAL_READER_CHROME_STATE, { type: 'hide' });
assert(hidden.visibility === 'hidden', 'automatic chrome should be hideable');
assert(reduceReaderChrome(hidden, { type: 'show' }).visibility === 'shown', 'hidden chrome should be revealable');
assert(reduceReaderChrome(hidden, { type: 'toggle' }).visibility === 'shown', 'toggle should invert visibility');

const pinned = reduceReaderChrome(hidden, { type: 'set-pinned', pinned: true });
assert(pinned.mode === 'pinned' && pinned.visibility === 'shown', 'pinning should reveal and hold chrome');
assert(reduceReaderChrome(pinned, { type: 'hide' }) === pinned, 'pinned chrome should ignore hide requests');

const unpinned = reduceReaderChrome(pinned, { type: 'set-pinned', pinned: false });
assert(unpinned.mode === 'auto' && unpinned.visibility === 'shown', 'unpinning should restart visible auto mode');

assert(shouldLockReaderChrome({
  hasPublicationSnapshot: false,
  surfaceOpen: false,
  pointerOverChrome: false,
  focusInChrome: false,
}), 'the initial publication opening must keep controls available');
assert(!shouldLockReaderChrome({
  hasPublicationSnapshot: true,
  surfaceOpen: false,
  pointerOverChrome: false,
  focusInChrome: false,
}), 'an existing publication snapshot must allow controls to stay hidden across navigation transactions');
assert(shouldLockReaderChrome({
  hasPublicationSnapshot: true,
  surfaceOpen: true,
  pointerOverChrome: false,
  focusInChrome: false,
}), 'an open reader surface must keep its controls available');

console.log('Reader chrome model unit test: PASS');
