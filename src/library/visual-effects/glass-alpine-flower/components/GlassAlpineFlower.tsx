import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { GlassFlowerControls } from './GlassFlowerControls'
import {
  DEFAULT_CONTROLS,
  DEFAULT_LIGHTS,
  toShaderSettings,
  type GlassFlowerControls as ControlValues,
  type LightName,
  type LightPosition,
  type RenderMode,
} from '../model'
import { useGlassFlowerRenderer } from '../hooks/useGlassFlowerRenderer'

export function GlassAlpineFlower() {
  const renderAreaRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<LightName | null>(null)
  const [controls, setControls] = useState<ControlValues>(() => ({ ...DEFAULT_CONTROLS }))
  const [renderMode, setRenderMode] = useState<RenderMode>('final')
  const [blueLight, setBlueLight] = useState<LightPosition>(() => ({ ...DEFAULT_LIGHTS.blue }))
  const [purpleLight, setPurpleLight] = useState<LightPosition>(() => ({ ...DEFAULT_LIGHTS.purple }))
  const settings = useMemo(() => toShaderSettings(controls, renderMode), [controls, renderMode])
  const { canvasRef, error } = useGlassFlowerRenderer(settings, blueLight, purpleLight)

  const updateDraggedLight = (clientX: number, clientY: number) => {
    const area = renderAreaRef.current
    const dragging = draggingRef.current
    if (!area || !dragging) return

    const rect = area.getBoundingClientRect()
    const position = {
      x: clamp((clientX - rect.left) / rect.width, 0.02, 0.98),
      y: clamp((clientY - rect.top) / rect.height, 0.02, 0.98),
    }

    if (dragging === 'blue') setBlueLight(position)
    else setPurpleLight(position)
  }

  const startDragging = (light: LightName, event: ReactPointerEvent<HTMLButtonElement>) => {
    draggingRef.current = light
    event.currentTarget.setPointerCapture(event.pointerId)
    updateDraggedLight(event.clientX, event.clientY)
  }

  const stopDragging = (event: ReactPointerEvent<HTMLButtonElement>) => {
    draggingRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const reset = () => {
    setControls({ ...DEFAULT_CONTROLS })
    setRenderMode('final')
    setBlueLight({ ...DEFAULT_LIGHTS.blue })
    setPurpleLight({ ...DEFAULT_LIGHTS.purple })
  }

  return (
    <section className="glass-flower-stage" aria-label="Interactive WebGL glass flower relighting demo">
      <div ref={renderAreaRef} className="glass-flower-render-area">
        <canvas ref={canvasRef} className="glass-flower-canvas" aria-label="WebGL relit glass flower" />
        <LightGizmo
          name="blue"
          position={blueLight}
          onPointerDown={startDragging}
          onPointerMove={updateDraggedLight}
          onPointerEnd={stopDragging}
        />
        <LightGizmo
          name="purple"
          position={purpleLight}
          onPointerDown={startDragging}
          onPointerMove={updateDraggedLight}
          onPointerEnd={stopDragging}
        />
      </div>

      <GlassFlowerControls
        controls={controls}
        setControls={setControls}
        renderMode={renderMode}
        setRenderMode={setRenderMode}
        blueLight={blueLight}
        purpleLight={purpleLight}
        error={error}
        onReset={reset}
      />
    </section>
  )
}

type LightGizmoProps = {
  name: LightName
  position: LightPosition
  onPointerDown: (name: LightName, event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (clientX: number, clientY: number) => void
  onPointerEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void
}

function LightGizmo({
  name,
  position,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: LightGizmoProps) {
  const label = name === 'blue' ? 'Blue' : 'Purple'

  return (
    <button
      type="button"
      className={`light-gizmo light-gizmo--${name}`}
      style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
      aria-label={`Move ${name} light`}
      onPointerDown={(event) => onPointerDown(name, event)}
      onPointerMove={(event) => onPointerMove(event.clientX, event.clientY)}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <span aria-hidden="true" />
      <em aria-hidden="true">{label}</em>
    </button>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
