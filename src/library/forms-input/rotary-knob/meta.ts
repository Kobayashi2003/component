import type { CatalogEntryMeta } from '../../../catalog/types'
export default {
  slug: 'rotary-knob',
  title: 'Rotary Knob',
  category: 'forms-input',
  kind: 'component',
  status: 'experimental',
  summary:
    'A tactile rotary input with adjustable damping, detent spacing, and notch strength in three material finishes.',
  usage: 'reusable',
  capabilities: { keyboard: true, touch: 'supported', reducedMotion: true },
  tags: ['pointer-drag', 'adjustable-detents', 'tactile'],
} satisfies CatalogEntryMeta
