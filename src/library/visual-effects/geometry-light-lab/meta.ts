import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'geometry-light-lab',
  title: 'Geometry Light Lab',
  category: 'visual-effects',
  kind: 'experiment',
  status: 'experimental',
  summary: 'Simple 3D solids rendered in WebGL2 with draggable, color-adjustable light sources.',
  style: 'real-time lighting',
  tags: [
    { label: 'Pointer drag', group: 'input' },
    { label: 'Variable lights', group: 'feature' },
    { label: 'WebGL2', group: 'technology' },
    { label: 'Ray marching', group: 'technology' },
  ],
} satisfies CatalogEntryMeta
