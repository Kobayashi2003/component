import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'cursor-distortion',
  title: 'Cursor Distortion Lens',
  category: 'visual-effects',
  kind: 'effect',
  status: 'experimental',
  summary:
    'A WebGL cursor lens with local magnification, UV refraction, surface distortion, and chromatic aberration.',
  style: 'optical distortion',
  tags: [
    { label: 'Pointer hover', group: 'input' },
    { label: 'Refraction lens', group: 'feature' },
    { label: 'Chromatic aberration', group: 'feature' },
    { label: 'WebGL shader', group: 'technology' },
    { label: 'Reduced motion', group: 'support' },
    { label: 'Touch limited', group: 'support' },
  ],
  compatibility: {
    touch: 'limited',
    message:
      'The lens requires continuous pointer position and WebGL; touch-only devices receive the static source artwork.',
  },
} satisfies CatalogEntryMeta
