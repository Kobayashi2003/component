import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'adaptive-cursor-outline',
  title: 'Adaptive Cursor Outline',
  category: 'visual-effects',
  kind: 'effect',
  status: 'experimental',
  summary:
    'A custom cursor that expands naturally into reusable outlines for regular and irregular interactive shapes.',
  style: 'adaptive cursor outline',
  tags: [
    { label: 'Pointer hover', group: 'input' },
    { label: 'Custom cursor', group: 'feature' },
    { label: 'Shape path', group: 'feature' },
    { label: 'Reduced motion', group: 'support' },
    { label: 'Touch limited', group: 'support' },
  ],
  compatibility: {
    touch: 'limited',
    message: 'This effect depends on hover and precise pointer tracking, so its primary interaction is not available on touch-only devices.',
  },
} satisfies CatalogEntryMeta
