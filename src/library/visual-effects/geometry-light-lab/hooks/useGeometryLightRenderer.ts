import { useEffect, useRef, useState } from 'react'
import type { LightSource, ShaderSettings } from '../model'
import { GeometryLightRenderer } from '../rendering/GeometryLightRenderer'

export function useGeometryLightRenderer(settings: ShaderSettings, lights: LightSource[]) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<GeometryLightRenderer | null>(null)
  const initialState = useRef({ settings, lights })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let active = true
    try {
      const initial = initialState.current
      const renderer = new GeometryLightRenderer(canvas, initial.settings, initial.lights)
      rendererRef.current = renderer
    } catch (reason) {
      queueMicrotask(() => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason))
      })
    }

    return () => {
      active = false
      rendererRef.current?.destroy()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    rendererRef.current?.setSettings(settings)
  }, [settings])

  useEffect(() => {
    rendererRef.current?.setLights(lights)
  }, [lights])

  return { canvasRef, error }
}
