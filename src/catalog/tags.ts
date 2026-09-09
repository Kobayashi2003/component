import type { CatalogTag } from './types'

export const tagRegistry = {
  'pointer-drag': {
    id: 'pointer-drag',
    label: 'Pointer drag',
    group: 'input',
  },
  'adjustable-detents': {
    id: 'adjustable-detents',
    label: 'Adjustable detents',
    group: 'feature',
  },
  tactile: {
    id: 'tactile',
    label: 'Tactile',
    group: 'style',
  },
  'file-input': {
    id: 'file-input',
    label: 'File input',
    group: 'input',
  },
  'crt-display': {
    id: 'crt-display',
    label: 'CRT display',
    group: 'feature',
  },
  'web-audio': {
    id: 'web-audio',
    label: 'Web Audio',
    group: 'technology',
  },
  svg: {
    id: 'svg',
    label: 'SVG',
    group: 'technology',
  },
  'audio-playback': {
    id: 'audio-playback',
    label: 'Audio playback',
    group: 'feature',
  },
  'responsive-layout': {
    id: 'responsive-layout',
    label: 'Responsive layout',
    group: 'feature',
  },
  'status-feedback': {
    id: 'status-feedback',
    label: 'Status feedback',
    group: 'feature',
  },
  neubrutalism: {
    id: 'neubrutalism',
    label: 'Neubrutalism',
    group: 'style',
  },
  'pointer-hover': {
    id: 'pointer-hover',
    label: 'Pointer hover',
    group: 'input',
  },
  'custom-cursor': {
    id: 'custom-cursor',
    label: 'Custom cursor',
    group: 'feature',
  },
  'shape-path': {
    id: 'shape-path',
    label: 'Shape path',
    group: 'feature',
  },
  'signal-damage': {
    id: 'signal-damage',
    label: 'Signal damage',
    group: 'feature',
  },
  'canvas-2d': {
    id: 'canvas-2d',
    label: 'Canvas 2D',
    group: 'technology',
  },
  'refraction-lens': {
    id: 'refraction-lens',
    label: 'Refraction lens',
    group: 'feature',
  },
  'chromatic-aberration': {
    id: 'chromatic-aberration',
    label: 'Chromatic aberration',
    group: 'feature',
  },
  webgl: {
    id: 'webgl',
    label: 'WebGL',
    group: 'technology',
  },
  'element-field': {
    id: 'element-field',
    label: 'Element field',
    group: 'feature',
  },
  'proximity-motion': {
    id: 'proximity-motion',
    label: 'Proximity motion',
    group: 'feature',
  },
  'dom-transforms': {
    id: 'dom-transforms',
    label: 'DOM transforms',
    group: 'technology',
  },
  spotlight: {
    id: 'spotlight',
    label: 'Spotlight',
    group: 'feature',
  },
  'css-variables': {
    id: 'css-variables',
    label: 'CSS variables',
    group: 'technology',
  },
  'variable-lights': {
    id: 'variable-lights',
    label: 'Variable lights',
    group: 'feature',
  },
  webgl2: {
    id: 'webgl2',
    label: 'WebGL2',
    group: 'technology',
  },
  'ray-marching': {
    id: 'ray-marching',
    label: 'Ray marching',
    group: 'technology',
  },
  'semantic-states': {
    id: 'semantic-states',
    label: 'Semantic states',
    group: 'feature',
  },
  typography: {
    id: 'typography',
    label: 'Typography',
    group: 'feature',
  },
  '3d-book': {
    id: '3d-book',
    label: '3D book',
    group: 'feature',
  },
  'camera-orbit': {
    id: 'camera-orbit',
    label: 'Camera orbit',
    group: 'feature',
  },
  'css-3d': {
    id: 'css-3d',
    label: 'CSS 3D',
    group: 'technology',
  },
  epub: {
    id: 'epub',
    label: 'EPUB',
    group: 'feature',
  },
  pagination: {
    id: 'pagination',
    label: 'Pagination',
    group: 'feature',
  },
  'fixed-layout': {
    id: 'fixed-layout',
    label: 'Fixed layout',
    group: 'feature',
  },
  accessibility: {
    id: 'accessibility',
    label: 'Accessibility',
    group: 'feature',
  },
} satisfies Record<string, CatalogTag>
export type TagId = keyof typeof tagRegistry
export function resolveTags(tags: readonly TagId[]): CatalogTag[] {
  return tags.map((id) => {
    const tag = tagRegistry[id]
    if (!Object.hasOwn(tagRegistry, id)) throw new Error(`Unknown catalog tag: ${id}`)
    return tag
  })
}
