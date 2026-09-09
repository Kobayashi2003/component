import type { TagId } from './tags'
import type { ComponentType, LazyExoticComponent } from 'react'

export type CategoryId =
  | 'visual-effects'
  | 'interactions'
  | 'layout-navigation'
  | 'data-display'
  | 'forms-input'
  | 'feedback-status'

export type EntryKind = 'component' | 'effect' | 'experiment'
export type EntryStatus = 'stable' | 'experimental' | 'draft'
export type TagGroup = 'input' | 'feature' | 'technology' | 'style'

export interface CatalogTag {
  id: string
  label: string
  group: TagGroup
}

export interface CompatibilityNotice {
  message: string
}

export interface CategoryDefinition {
  id: CategoryId
  title: string
  eyebrow: string
  description: string
}

export interface CatalogEntryMeta {
  slug: string
  title: string
  category: CategoryId
  kind: EntryKind
  status: EntryStatus
  summary: string
  usage: 'reusable' | 'showcase'
  capabilities?: {
    touch?: 'supported' | 'limited' | 'unsupported'
    keyboard?: boolean
    reducedMotion?: boolean
  }
  hideDocumentation?: boolean
  tags: TagId[]
  compatibility?: CompatibilityNotice
}

export interface CatalogEntry extends Omit<CatalogEntryMeta, 'tags'> {
  tags: CatalogTag[]
  key: string
  Demo: LazyExoticComponent<ComponentType>
  loadReadme: () => Promise<string>
}
