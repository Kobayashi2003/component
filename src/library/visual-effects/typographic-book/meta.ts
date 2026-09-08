import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'typographic-book',
  title: 'Typographic Book',
  category: 'visual-effects',
  kind: 'experiment',
  status: 'experimental',
  summary: 'Pale lettering outlines a transparent book against a replaceable red background, with a constrained front-left-bottom camera orbit.',
  style: 'editorial typography',
  tags: [
    { label: 'Typography', group: 'feature' },
    { label: '3D book', group: 'feature' },
    { label: 'Camera orbit', group: 'input' },
    { label: 'CSS 3D / SVG', group: 'technology' },
    { label: 'Keyboard & touch', group: 'support' },
    { label: 'Reduced motion', group: 'support' },
  ],
} satisfies CatalogEntryMeta
