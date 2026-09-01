import type { ReaderPanelId } from './reader-surfaces';

export const READER_PANELS = [
  { id: 'contents', label: 'Contents', shortLabel: 'Contents', description: 'Navigate the publication' },
  { id: 'search', label: 'Search', shortLabel: 'Search', description: 'Find text in this book' },
  { id: 'marks', label: 'Bookmarks and annotations', shortLabel: 'Marks', description: 'Saved places and selections' },
  { id: 'settings', label: 'Reader settings', shortLabel: 'Settings', description: 'Display, layout and controls' },
  { id: 'compatibility', label: 'Book information', shortLabel: 'Book info', description: 'Compatibility and repairs' },
  { id: 'help', label: 'Keyboard shortcuts', shortLabel: 'Help', description: 'Reader keyboard commands' },
] as const satisfies readonly { id: ReaderPanelId; label: string; shortLabel: string; description: string }[];
