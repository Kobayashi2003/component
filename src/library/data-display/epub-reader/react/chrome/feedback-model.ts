import type { ReaderEvent } from '../../core';

export type ReaderFeedbackTone = 'success' | 'boundary';

export interface ReaderFeedbackSpec {
  readonly message: string;
  readonly tone: ReaderFeedbackTone;
  readonly edge?: 'start' | 'end';
}

export function feedbackForReaderEvent(event: ReaderEvent): ReaderFeedbackSpec | null {
  if (event.type === 'bookmark-added') return { message: 'Bookmark saved', tone: 'success' };
  if (event.type === 'navigation-boundary') {
    return {
      message: event.edge === 'start' ? 'Beginning of book' : 'End of book',
      tone: 'boundary',
      edge: event.edge,
    };
  }
  return null;
}
