import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'glass-alpine-flower',
  title: 'Glass Alpine Flower',
  category: 'visual-effects',
  kind: 'experiment',
  status: 'experimental',
  summary: 'A neutral glass flower relit in real time by two draggable WebGL2 light sources.',
  style: 'refractive lighting',
  tags: [
    { label: 'Pointer drag', group: 'input' },
    { label: 'Interactive lighting', group: 'feature' },
    { label: 'WebGL2', group: 'technology' },
    { label: 'Fragment shader', group: 'technology' },
  ],
} satisfies CatalogEntryMeta
