import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'cursor-gravity-field',
  title: 'Cursor Gravity Field',
  category: 'visual-effects',
  kind: 'effect',
  status: 'experimental',
  summary:
    'A proximity field that pulls groups of interface elements toward the pointer, with distance-weighted motion and a soft return.',
  style: 'magnetic interface motion',
  tags: [
    { label: 'Pointer hover', group: 'input' },
    { label: 'Element field', group: 'feature' },
    { label: 'Proximity motion', group: 'feature' },
    { label: 'DOM transforms', group: 'technology' },
    { label: 'Reduced motion', group: 'support' },
    { label: 'Touch limited', group: 'support' },
  ],
  compatibility: {
    touch: 'limited',
    message:
      'The field follows continuous pointer movement; touch-only devices keep elements in their resting positions.',
  },
} satisfies CatalogEntryMeta
