import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'cursor-distortion',
  title: 'Cursor Distortion',
  category: 'visual-effects',
  kind: 'effect',
  status: 'experimental',
  summary:
    'A WebGL cursor lens with local magnification, UV refraction, surface distortion, and chromatic aberration.',
  usage: 'reusable',
  capabilities: { reducedMotion: true, touch: 'limited' },
  tags: ['pointer-hover', 'refraction-lens', 'chromatic-aberration', 'webgl'],
  compatibility: {
    message:
      'The lens requires continuous pointer position and WebGL; touch-only devices receive the static source artwork.',
  },
} satisfies CatalogEntryMeta
