import type { CatalogEntryMeta } from '../../../catalog/types'

export default {
  slug: 'retro-radio',
  title: 'Retro Radio',
  category: 'interactions',
  kind: 'component',
  status: 'experimental',
  summary:
    'A tactile wooden receiver with local audio playback, analyser-driven CRT feedback, and an adjustable sparking antenna.',
  usage: 'reusable',
  capabilities: { keyboard: true },
  tags: ['pointer-drag', 'file-input', 'crt-display', 'web-audio', 'svg'],
} satisfies CatalogEntryMeta
