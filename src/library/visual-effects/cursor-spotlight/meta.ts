import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'cursor-spotlight',
  title: 'Cursor Spotlight',
  category: 'visual-effects',
  kind: 'effect',
  status: 'experimental',
  summary:
    'A reusable diffused cursor light that reveals surface, color, and depth without intercepting interaction.',
  usage: 'reusable',
  capabilities: { reducedMotion: true, touch: 'limited' },
  tags: ['pointer-hover', 'spotlight', 'css-variables'],
  compatibility: {
    message:
      'This effect depends on hover and continuous pointer position, so touch-only devices receive a reduced experience.',
  },
} satisfies CatalogEntryMeta
