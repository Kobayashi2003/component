import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'vinyl-deck',
  title: 'Vinyl Deck',
  category: 'interactions',
  kind: 'component',
  status: 'experimental',
  summary:
    'A mechanical media selector with a draggable platter, stepped navigation, and focused playback controls.',
  usage: 'reusable',
  capabilities: { keyboard: true },
  tags: ['pointer-drag', 'audio-playback'],
} satisfies CatalogEntryMeta
