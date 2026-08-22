import type {
  CatalogEntry,
  CatalogEntryMeta,
  CategoryDefinition,
} from './types'
import type { ComponentType } from 'react'
import { lazy } from 'react'

export const categories: CategoryDefinition[] = [
  {
    id: 'visual-effects',
    title: 'Visual Effects',
    eyebrow: 'Atmosphere & surface',
    description: 'Shader-like treatments, light, texture, distortion, and decorative motion.',
  },
  {
    id: 'interactions',
    title: 'Interactions',
    eyebrow: 'Input & response',
    description: 'Pointer, keyboard, gesture, drag, selection, and other direct-manipulation ideas.',
  },
  {
    id: 'layout-navigation',
    title: 'Layout & Navigation',
    eyebrow: 'Structure & movement',
    description: 'Composition systems, menus, page transitions, and spatial navigation patterns.',
  },
  {
    id: 'data-display',
    title: 'Data Display',
    eyebrow: 'Information & comparison',
    description: 'Tables, charts, metrics, timelines, and expressive ways to present information.',
  },
  {
    id: 'forms-input',
    title: 'Forms & Input',
    eyebrow: 'Capture & editing',
    description: 'Controls and flows for entering, editing, validating, and submitting data.',
  },
  {
    id: 'feedback-status',
    title: 'Feedback & Status',
    eyebrow: 'System communication',
    description: 'Loading, progress, notifications, empty states, errors, and confirmations.',
  },
]

const metadataModules = import.meta.glob('../library/*/*/meta.ts', {
  eager: true,
  import: 'default',
}) as Record<string, CatalogEntryMeta>

const demoModules = import.meta.glob('../library/*/*/index.tsx') as Record<
  string,
  () => Promise<{ default: ComponentType }>
>

const entryReadmes = import.meta.glob('../library/*/*/README.md', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

const pathPattern = /^\.\.\/library\/([^/]+)\/([^/]+)\/meta\.ts$/

export const entries: CatalogEntry[] = Object.entries(metadataModules)
  .map(([metadataPath, metadata]) => {
    const match = metadataPath.match(pathPattern)
    if (!match) throw new Error(`Unexpected catalog metadata path: ${metadataPath}`)

    const [, category, slug] = match
    if (metadata.category !== category || metadata.slug !== slug) {
      throw new Error(`Catalog metadata must match its directory: ${metadataPath}`)
    }

    const demoPath = `../library/${category}/${slug}/index.tsx`
    const readmePath = `../library/${category}/${slug}/README.md`
    const loadDemo = demoModules[demoPath]
    const loadReadme = entryReadmes[readmePath]

    if (!loadDemo || !loadReadme) {
      throw new Error(`Catalog entry is incomplete: ${category}/${slug}`)
    }

    return {
      ...metadata,
      key: `${category}/${slug}`,
      Demo: lazy(loadDemo),
      loadReadme,
    }
  })
  .sort((a, b) => a.title.localeCompare(b.title))

export function getCategory(id: string) {
  return categories.find((category) => category.id === id)
}

export function getCategoryEntries(id: string) {
  return entries.filter((entry) => entry.category === id)
}

export function getEntry(category: string, slug: string) {
  return entries.find((entry) => entry.category === category && entry.slug === slug)
}
