import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'analog-video-distortion',
  title: 'Analog Video Distortion',
  category: 'visual-effects',
  kind: 'component',
  status: 'experimental',
  summary: 'Randomized tape tracking damage, horizontal smear, and live CRT noise for arbitrary React content.',
  tags: [
    { label: 'Signal damage', group: 'feature' },
    { label: 'Canvas 2D', group: 'technology' },
    { label: 'React', group: 'technology' },
  ],
} satisfies CatalogEntryMeta
