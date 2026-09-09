import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'semantic-drag-cursor',
  title: 'Semantic Drag Cursor',
  category: 'visual-effects',
  kind: 'effect',
  status: 'experimental',
  summary:
    'A context-aware cursor that morphs into clear action labels and a stable directional drag affordance.',
  usage: 'reusable',
  capabilities: { reducedMotion: true, touch: 'limited' },
  tags: ['pointer-hover', 'pointer-drag', 'semantic-states', 'css-variables'],
  compatibility: {
    message:
      'The custom cursor requires hover and precise pointer tracking; touch devices keep native controls and direct dragging.',
  },
} satisfies CatalogEntryMeta
