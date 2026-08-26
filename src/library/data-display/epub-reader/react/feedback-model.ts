import type { ReaderUiIntent } from '../core';

export type ReaderFeedbackTone = 'success' | 'boundary';

export interface ReaderFeedbackSpec {
  readonly message: string;
  readonly tone: ReaderFeedbackTone;
  readonly edge?: 'start' | 'end';
}

export function feedbackForIntent(intent: ReaderUiIntent): ReaderFeedbackSpec | null {
  if (intent.type === 'bookmark-added') return { message: 'Bookmark saved', tone: 'success' };
  if (intent.type === 'navigation-boundary') {
    return {
      message: intent.edge === 'start' ? 'Beginning of book' : 'End of book',
      tone: 'boundary',
      edge: intent.edge,
    };
  }
  return null;
}
