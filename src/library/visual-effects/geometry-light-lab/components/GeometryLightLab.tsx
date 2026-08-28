import { useMemo, useRef, useState } from 'react'
import { GeometryLightControls } from './GeometryLightControls'
import { LightGizmo } from './LightGizmo'
import {
  DEFAULT_CONTROLS,
  MAX_LIGHTS,
  cloneDefaultLights,
  toShaderSettings,
  type GeometryLightControls as ControlValues,
  type GeometryType,
  type LightPosition,
  type LightSource,
  type RenderMode,
} from '../model'
import { useGeometryLightRenderer } from '../hooks/useGeometryLightRenderer'
import { useObjectRotation } from '../hooks/useObjectRotation'
import {
  orientationFromControls,
  rotateInViewSpace,
  type Quaternion,
} from '../rotation'

const NEW_LIGHT_COLORS = ['#71e6a4', '#f3c969', '#c889ff', '#4dd7e8', '#ff7d9c']

export function GeometryLightLab() {
  const renderAreaRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<number | null>(null)
  const nextLightId = useRef(3)
  const [controls, setControls] = useState<ControlValues>(() => ({ ...DEFAULT_CONTROLS }))
  const [orientation, setOrientation] = useState<Quaternion>(() => (
    orientationFromControls(DEFAULT_CONTROLS)
  ))
  const [geometry, setGeometry] = useState<GeometryType>('cube')
  const [renderMode, setRenderMode] = useState<RenderMode>('final')
  const [lights, setLights] = useState<LightSource[]>(cloneDefaultLights)
  const settings = useMemo(
    () => toShaderSettings(controls, geometry, renderMode, orientation),
    [controls, geometry, renderMode, orientation],
  )
  const { canvasRef, error } = useGeometryLightRenderer(settings, lights)
  const { isDragging, rotationHandlers } = useObjectRotation(setControls, setOrientation)

  const updateControl = (key: keyof ControlValues, value: number) => {
    const delta = value - controls[key]
    if (key === 'rotationX') {
      setOrientation((current) => rotateInViewSpace(current, delta, 0))
    } else if (key === 'rotationY') {
      setOrientation((current) => rotateInViewSpace(current, 0, delta))
    } else if (key === 'rotationZ') {
      setOrientation((current) => rotateInViewSpace(current, 0, 0, delta))
    }
    setControls((current) => ({ ...current, [key]: value }))
  }

  const updateLight = (id: number, patch: Partial<Omit<LightSource, 'id'>>) => {
    setLights((current) => current.map((light) => light.id === id ? { ...light, ...patch } : light))
  }

  const updateDraggedLight = (clientX: number, clientY: number) => {
    const area = renderAreaRef.current
    const id = draggingRef.current
    if (!area || id === null) return

    const rect = area.getBoundingClientRect()
    const position: LightPosition = {
      x: clamp((clientX - rect.left) / rect.width, 0.025, 0.975),
      y: clamp((clientY - rect.top) / rect.height, 0.025, 0.975),
    }
    updateLight(id, { position })
  }

  const addLight = () => {
    setLights((current) => {
      if (current.length >= MAX_LIGHTS) return current
      const id = nextLightId.current++
      const index = current.length
      return [...current, {
        id,
        color: NEW_LIGHT_COLORS[index % NEW_LIGHT_COLORS.length],
        position: { x: 0.38 + (index % 3) * 0.14, y: 0.2 + (index % 2) * 0.16 },
        intensity: 120,
        radius: 75,
      }]
    })
  }

  const removeLight = (id: number) => {
    setLights((current) => current.length > 1 ? current.filter((light) => light.id !== id) : current)
  }

  const reset = () => {
    setControls({ ...DEFAULT_CONTROLS })
    setOrientation(orientationFromControls(DEFAULT_CONTROLS))
    setGeometry('cube')
    setRenderMode('final')
    setLights(cloneDefaultLights())
    nextLightId.current = 3
  }

  return (
    <section className="geometry-lab" aria-label="Interactive 3D geometry lighting lab">
      <div className="geometry-lab__canvas-label" aria-hidden="true">
        <span>Canvas / WebGL2</span>
        <span>{lights.length} {lights.length === 1 ? 'light' : 'lights'}</span>
      </div>

      <div
        ref={renderAreaRef}
        className={`geometry-lab__render-area${isDragging ? ' is-rotating' : ''}`}
        role="group"
        tabIndex={0}
        aria-label="Drag horizontally and vertically to rotate the object on X and Y."
        {...rotationHandlers}
      >
        <canvas ref={canvasRef} className="geometry-lab__canvas" aria-label="Programmatically rendered 3D geometry" />
        {lights.map((light, index) => (
          <LightGizmo
            key={light.id}
            light={light}
            index={index}
            onPointerDown={(event) => {
              event.stopPropagation()
              draggingRef.current = light.id
              event.currentTarget.setPointerCapture(event.pointerId)
              updateDraggedLight(event.clientX, event.clientY)
            }}
            onPointerMove={(event) => updateDraggedLight(event.clientX, event.clientY)}
            onPointerEnd={(event) => {
              draggingRef.current = null
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            }}
          />
        ))}
      </div>

      <GeometryLightControls
        controls={controls}
        onControlChange={updateControl}
        geometry={geometry}
        setGeometry={setGeometry}
        renderMode={renderMode}
        setRenderMode={setRenderMode}
        lights={lights}
        onUpdateLight={updateLight}
        onAddLight={addLight}
        onRemoveLight={removeLight}
        onReset={reset}
        error={error}
      />
    </section>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
