import { feedbackForIntent } from '../../react/chrome/feedback-model';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Reader feedback model test failed: ${message}`);
}

assert(feedbackForIntent({ type: 'bookmark-added' })?.tone === 'success', 'bookmark creation should produce success feedback');
assert(feedbackForIntent({ type: 'navigation-boundary', edge: 'start' })?.message === 'Beginning of book', 'start boundary should be described');
assert(feedbackForIntent({ type: 'navigation-boundary', edge: 'end' })?.message === 'End of book', 'end boundary should be described');
assert(feedbackForIntent({ type: 'open-search' }) === null, 'panel intents should not create transient feedback');

console.log('Reader feedback model unit test: PASS');
