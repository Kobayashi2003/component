import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'analog-video-distortion',
  title: 'Analog Video Distortion',
  category: 'visual-effects',
  kind: 'component',
  status: 'experimental',
  summary:
    'Randomized tape tracking damage, horizontal smear, and live CRT noise for arbitrary React content.',
  usage: 'reusable',
  capabilities: {},
  tags: ['signal-damage', 'canvas-2d'],
} satisfies CatalogEntryMeta
