export type RenderMode = 'final' | 'normal' | 'diffuse' | 'specular'

export type GeometryType = 'sphere' | 'cube' | 'torus'

export type LightPosition = {
  x: number
  y: number
}

export type LightSource = {
  id: number
  color: string
  position: LightPosition
  intensity: number
  radius: number
}

export type GeometryLightControls = {
  size: number
  rotationX: number
  rotationY: number
  rotationZ: number
  roughness: number
  metallic: number
  ambient: number
  exposure: number
}

export type ShaderSettings = {
  scale: number
  orientation: readonly [number, number, number, number]
  roughness: number
  metallic: number
  ambient: number
  exposure: number
  geometry: 0 | 1 | 2
  renderMode: 0 | 1 | 2 | 3
}

export const MAX_LIGHTS = 5

export const DEFAULT_CONTROLS: Readonly<GeometryLightControls> = {
  size: 68,
  rotationX: -18,
  rotationY: 32,
  rotationZ: 0,
  roughness: 28,
  metallic: 18,
  ambient: 10,
  exposure: 112,
}

export const DEFAULT_LIGHTS: readonly LightSource[] = [
  { id: 1, color: '#ff6b4a', position: { x: 0.26, y: 0.3 }, intensity: 125, radius: 78 },
  { id: 2, color: '#4c8dff', position: { x: 0.76, y: 0.34 }, intensity: 145, radius: 82 },
]

export const CONTROL_DEFINITIONS = [
  { key: 'size', group: 'object', label: 'Size', min: 40, max: 110, suffix: '%' },
  { key: 'rotationX', group: 'object', label: 'Rotate X', min: -180, max: 180, suffix: '°' },
  { key: 'rotationY', group: 'object', label: 'Rotate Y', min: -180, max: 180, suffix: '°' },
  { key: 'rotationZ', group: 'object', label: 'Rotate Z', min: -180, max: 180, suffix: '°' },
  { key: 'roughness', group: 'material', label: 'Roughness', min: 4, max: 92, suffix: '%' },
  { key: 'metallic', group: 'material', label: 'Metalness', min: 0, max: 100, suffix: '%' },
  { key: 'ambient', group: 'material', label: 'Ambient', min: 0, max: 40, suffix: '%' },
  { key: 'exposure', group: 'material', label: 'Exposure', min: 60, max: 180, suffix: '%' },
] as const

const GEOMETRY_IDS: Record<GeometryType, ShaderSettings['geometry']> = {
  sphere: 0,
  cube: 1,
  torus: 2,
}

const RENDER_MODE_IDS: Record<RenderMode, ShaderSettings['renderMode']> = {
  final: 0,
  normal: 1,
  diffuse: 2,
  specular: 3,
}

export function toShaderSettings(
  controls: GeometryLightControls,
  geometry: GeometryType,
  renderMode: RenderMode,
  orientation: ShaderSettings['orientation'],
): ShaderSettings {
  return {
    scale: controls.size / 100,
    orientation,
    roughness: controls.roughness / 100,
    metallic: controls.metallic / 100,
    ambient: controls.ambient / 100,
    exposure: controls.exposure / 100,
    geometry: GEOMETRY_IDS[geometry],
    renderMode: RENDER_MODE_IDS[renderMode],
  }
}

export function cloneDefaultLights(): LightSource[] {
  return DEFAULT_LIGHTS.map((light) => ({
    ...light,
    position: { ...light.position },
  }))
}

export function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized, 16)
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ]
}
