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
export type TagGroup = 'input' | 'feature' | 'technology' | 'support' | 'style'

export interface CatalogTag {
  label: string
  group: TagGroup
}

export interface CompatibilityNotice {
  touch?: 'limited' | 'unsupported'
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
  style?: string
  hideDocumentation?: boolean
  tags: CatalogTag[]
  compatibility?: CompatibilityNotice
}

export interface CatalogEntry extends CatalogEntryMeta {
  key: string
  Demo: LazyExoticComponent<ComponentType>
  loadReadme: () => Promise<string>
}
