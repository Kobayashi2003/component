import { useEffect, useRef, useState } from 'react'
import baseUrl from './assets/glass-base.png'
import normalUrl from './assets/normal-map.png'
import specularUrl from './assets/specular-map.png'
import type { LightPosition, ShaderSettings } from './model'
import { GlassFlowerWebGLRenderer } from './webglRenderer'

const TEXTURES = {
  base: baseUrl,
  normal: normalUrl,
  specular: specularUrl,
}

export function useGlassFlowerRenderer(
  settings: ShaderSettings,
  blueLight: LightPosition,
  purpleLight: LightPosition,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<GlassFlowerWebGLRenderer | null>(null)
  const initialState = useRef({ settings, blueLight, purpleLight })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const initial = initialState.current
    let renderer: GlassFlowerWebGLRenderer
    let active = true

    try {
      renderer = new GlassFlowerWebGLRenderer(canvas, initial.settings)
      renderer.setLights(initial.blueLight, initial.purpleLight)
      rendererRef.current = renderer

      void renderer.loadTextures(TEXTURES).catch((reason: unknown) => {
        if (active) setError(toErrorMessage(reason))
      })
    } catch (reason) {
      const message = toErrorMessage(reason)
      queueMicrotask(() => {
        if (active) setError(message)
      })
      return () => {
        active = false
      }
    }

    return () => {
      active = false
      renderer.destroy()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.setSettings(settings)
  }, [settings])

  useEffect(() => {
    rendererRef.current?.setLights(blueLight, purpleLight)
  }, [blueLight, purpleLight])

  return { canvasRef, error }
}

function toErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason)
}
