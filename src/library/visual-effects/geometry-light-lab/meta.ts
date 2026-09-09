import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'geometry-light-lab',
  title: 'Geometry Light Lab',
  category: 'visual-effects',
  kind: 'experiment',
  status: 'experimental',
  summary: 'Simple 3D solids rendered in WebGL2 with draggable, color-adjustable light sources.',
  usage: 'showcase',
  capabilities: {},
  tags: ['pointer-drag', 'variable-lights', 'webgl2', 'ray-marching'],
} satisfies CatalogEntryMeta
