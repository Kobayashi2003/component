import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'typographic-book',
  title: 'Typographic Book',
  category: 'visual-effects',
  kind: 'experiment',
  status: 'experimental',
  summary:
    'Pale lettering outlines a transparent book against a replaceable red background, with a constrained front-left-bottom camera orbit.',
  usage: 'showcase',
  capabilities: { keyboard: true, touch: 'supported', reducedMotion: true },
  tags: ['pointer-drag', 'typography', '3d-book', 'camera-orbit', 'css-3d'],
} satisfies CatalogEntryMeta
