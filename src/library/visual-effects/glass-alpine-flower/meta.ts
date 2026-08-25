import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'glass-alpine-flower',
  title: 'Glass Alpine Flower',
  category: 'visual-effects',
  kind: 'experiment',
  status: 'experimental',
  summary: 'A neutral glass flower relit in real time by two draggable WebGL2 light sources.',
  style: 'refractive lighting',
  tags: ['WebGL2', 'fragment shader', 'interactive lighting'],
} satisfies CatalogEntryMeta
