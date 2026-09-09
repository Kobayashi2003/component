import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'adaptive-cursor-outline',
  title: 'Adaptive Cursor Outline',
  category: 'visual-effects',
  kind: 'effect',
  status: 'experimental',
  summary:
    'A custom cursor that expands naturally into reusable outlines for regular and irregular interactive shapes.',
  usage: 'reusable',
  capabilities: { reducedMotion: true, touch: 'limited' },
  tags: ['pointer-hover', 'custom-cursor', 'shape-path'],
  compatibility: {
    message:
      'This effect depends on hover and precise pointer tracking, so its primary interaction is not available on touch-only devices.',
  },
} satisfies CatalogEntryMeta
