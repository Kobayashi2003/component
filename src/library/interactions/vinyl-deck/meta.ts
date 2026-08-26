import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'vinyl-deck',
  title: 'Vinyl Deck',
  category: 'interactions',
  kind: 'component',
  status: 'experimental',
  summary: 'A mechanical media selector with a draggable platter, stepped navigation, and focused playback controls.',
  tags: [
    { label: 'Pointer drag', group: 'input' },
    { label: 'Keyboard', group: 'input' },
    { label: 'Audio playback', group: 'feature' },
    { label: 'State transition', group: 'feature' },
  ],
} satisfies CatalogEntryMeta
