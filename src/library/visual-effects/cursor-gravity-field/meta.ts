import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'cursor-gravity-field',
  title: 'Cursor Gravity Field',
  category: 'visual-effects',
  kind: 'effect',
  status: 'experimental',
  summary:
    'A proximity field that pulls groups of interface elements toward the pointer, with distance-weighted motion and a soft return.',
  usage: 'reusable',
  capabilities: { reducedMotion: true, touch: 'limited' },
  tags: ['pointer-hover', 'element-field', 'proximity-motion', 'dom-transforms'],
  compatibility: {
    message:
      'The field follows continuous pointer movement; touch-only devices keep elements in their resting positions.',
  },
} satisfies CatalogEntryMeta
