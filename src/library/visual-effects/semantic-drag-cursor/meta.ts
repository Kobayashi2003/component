import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'semantic-drag-cursor',
  title: 'Semantic Drag Cursor',
  category: 'visual-effects',
  kind: 'effect',
  status: 'experimental',
  summary:
    'A context-aware cursor that morphs into clear action labels and a stable directional drag affordance.',
  style: 'semantic interaction feedback',
  tags: [
    { label: 'Pointer hover', group: 'input' },
    { label: 'Pointer drag', group: 'input' },
    { label: 'Semantic states', group: 'feature' },
    { label: 'Stable follow', group: 'feature' },
    { label: 'CSS variables', group: 'technology' },
    { label: 'Reduced motion', group: 'support' },
    { label: 'Touch limited', group: 'support' },
  ],
  compatibility: {
    touch: 'limited',
    message:
      'The custom cursor requires hover and precise pointer tracking; touch devices keep native controls and direct dragging.',
  },
} satisfies CatalogEntryMeta
