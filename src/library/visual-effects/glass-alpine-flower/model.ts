export type RenderMode = 'final' | 'base' | 'normal' | 'lighting'

export type LightName = 'blue' | 'purple'

export type LightPosition = {
  x: number
  y: number
}

export type GlassFlowerControls = {
  blueIntensity: number
  blueRadius: number
  purpleIntensity: number
  purpleRadius: number
  normalStrength: number
  specular: number
  fresnel: number
  shininess: number
  transmission: number
  exposure: number
}

export type ShaderSettings = {
  blueIntensity: number
  blueRadius: number
  purpleIntensity: number
  purpleRadius: number
  normalStrength: number
  specular: number
  fresnel: number
  shininess: number
  transmission: number
  exposure: number
  renderMode: 0 | 1 | 2 | 3
}

export type ControlDefinition = {
  key: keyof GlassFlowerControls
  group: 'lights' | 'material'
  label: string
  min: number
  max: number
  suffix: string
}

export const DEFAULT_CONTROLS: Readonly<GlassFlowerControls> = {
  blueIntensity: 168,
  blueRadius: 86,
  purpleIntensity: 158,
  purpleRadius: 84,
  normalStrength: 52,
  specular: 90,
  fresnel: 82,
  shininess: 72,
  transmission: 90,
  exposure: 138,
}

export const DEFAULT_LIGHTS: Readonly<Record<LightName, LightPosition>> = {
  blue: { x: 0.26, y: 0.3 },
  purple: { x: 0.77, y: 0.28 },
}

export const CONTROL_DEFINITIONS: readonly ControlDefinition[] = [
  { key: 'blueIntensity', group: 'lights', label: 'Blue energy', min: 0, max: 220, suffix: '%' },
  { key: 'blueRadius', group: 'lights', label: 'Blue spread', min: 25, max: 120, suffix: '%' },
  { key: 'purpleIntensity', group: 'lights', label: 'Violet energy', min: 0, max: 220, suffix: '%' },
  { key: 'purpleRadius', group: 'lights', label: 'Violet spread', min: 25, max: 120, suffix: '%' },
  { key: 'normalStrength', group: 'material', label: 'Surface relief', min: 0, max: 100, suffix: '%' },
  { key: 'specular', group: 'material', label: 'Reflection', min: 0, max: 100, suffix: '%' },
  { key: 'fresnel', group: 'material', label: 'Edge glow', min: 0, max: 100, suffix: '%' },
  { key: 'shininess', group: 'material', label: 'Highlight focus', min: 8, max: 96, suffix: '' },
  { key: 'transmission', group: 'material', label: 'Light passage', min: 0, max: 100, suffix: '%' },
  { key: 'exposure', group: 'material', label: 'Final exposure', min: 60, max: 220, suffix: '%' },
]

const RENDER_MODE_IDS: Record<RenderMode, ShaderSettings['renderMode']> = {
  final: 0,
  base: 1,
  normal: 2,
  lighting: 3,
}

export function toShaderSettings(
  controls: GlassFlowerControls,
  renderMode: RenderMode,
): ShaderSettings {
  return {
    blueIntensity: controls.blueIntensity / 100,
    blueRadius: controls.blueRadius / 100,
    purpleIntensity: controls.purpleIntensity / 100,
    purpleRadius: controls.purpleRadius / 100,
    normalStrength: controls.normalStrength / 100,
    specular: controls.specular / 100,
    fresnel: controls.fresnel / 100,
    shininess: controls.shininess,
    transmission: controls.transmission / 100,
    exposure: controls.exposure / 100,
    renderMode: RENDER_MODE_IDS[renderMode],
  }
}
