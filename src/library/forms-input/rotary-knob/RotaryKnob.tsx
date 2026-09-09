import { useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import './styles.css'

export interface RotaryKnobProps {
  label: string
  value?: number
  defaultValue?: number
  onChange?: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** Drag resistance, 0–1. Higher values require more travel. */
  damping?: number
  /** Distance between detents in value units; 0 disables them. */
  detentStep?: number
  /** Attraction to the nearest detent, 0–1. */
  detentStrength?: number
  disabled?: boolean
  appearance?: 'graphite' | 'ivory' | 'signal'
  unit?: string
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function RotaryKnob({
  label,
  value,
  defaultValue = 50,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  damping = 0.35,
  detentStep = 10,
  detentStrength = 0.6,
  disabled = false,
  appearance = 'graphite',
  unit = '%',
}: RotaryKnobProps) {
  const [internal, setInternal] = useState(defaultValue)
  const [dragging, setDragging] = useState(false)
  const gesture = useRef<{ id: number; angle: number; raw: number } | null>(null)
  const labelId = useId()
  const upper = Math.max(min, max)
  const range = upper - min
  const increment = step > 0 ? step : 1
  const current = clamp(value ?? internal, min, upper)
  const inactive = disabled || range === 0
  const resistance = clamp(damping, 0, 1)
  const strength = clamp(detentStrength, 0, 1)
  const progress = range ? (current - min) / range : 0
  const commit = (next: number) => {
    const rounded = next >= upper ? upper : min + Math.round((next - min) / increment) * increment
    const result = Number(clamp(rounded, min, upper).toFixed(8))
    if (value === undefined) setInternal(result)
    if (result !== current) onChange?.(result)
  }
  const angleAt = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - box.left - box.width / 2
    const y = event.clientY - box.top - box.height / 2
    return Math.hypot(x, y) < 12 ? null : (Math.atan2(y, x) * 180) / Math.PI
  }
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.id !== event.pointerId) return
    gesture.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (inactive) return
    const amount = detentStep > 0 && strength === 1 ? Math.max(increment, detentStep) : increment
    const values: Record<string, number> = {
      ArrowUp: current + amount,
      ArrowRight: current + amount,
      ArrowDown: current - amount,
      ArrowLeft: current - amount,
      PageUp: current + amount * 10,
      PageDown: current - amount * 10,
      Home: min,
      End: upper,
    }
    if (!(event.key in values)) return
    event.preventDefault()
    commit(values[event.key])
  }
  const style = {
    '--knob-angle': `${-135 + progress * 270}deg`,
    '--knob-progress': `${progress * 270}deg`,
    '--knob-settle': `${40 + resistance * 160}ms`,
  } as CSSProperties
  return (
    <div className={`rotary-knob rotary-knob--${appearance}`} style={style}>
      <span id={labelId} className="rotary-knob__label">
        {label}
      </span>
      <div
        className={`rotary-knob__control${dragging ? ' is-dragging' : ''}`}
        role="slider"
        tabIndex={inactive ? -1 : 0}
        aria-labelledby={labelId}
        aria-valuemin={min}
        aria-valuemax={upper}
        aria-valuenow={current}
        aria-valuetext={`${current}${unit}`}
        aria-disabled={inactive}
        onKeyDown={keyboard}
        onPointerDown={(event) => {
          if (inactive || !event.isPrimary || event.button !== 0 || gesture.current) return
          const angle = angleAt(event)
          if (angle === null) return
          event.preventDefault()
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture(event.pointerId)
          gesture.current = { id: event.pointerId, angle, raw: current }
          setDragging(true)
        }}
        onPointerMove={(event) => {
          const drag = gesture.current
          if (!drag || drag.id !== event.pointerId) return
          if (inactive) {
            finish(event)
            return
          }
          const angle = angleAt(event)
          if (angle === null) return
          const delta = ((angle - drag.angle + 540) % 360) - 180
          drag.angle = angle
          drag.raw = clamp(drag.raw + ((delta / 270) * range) / (1 + resistance * 3), min, upper)
          const nearest =
            detentStep > 0
              ? clamp(min + Math.round((drag.raw - min) / detentStep) * detentStep, min, upper)
              : drag.raw
          commit(drag.raw + (nearest - drag.raw) * strength)
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
      >
        <div className="rotary-knob__ticks" aria-hidden="true">
          {Array.from({ length: 31 }, (_, i) => (
            <i
              key={i}
              className={i / 30 <= progress ? 'is-lit' : ''}
              style={{ transform: `rotate(${-135 + i * 9}deg)` }}
            />
          ))}
        </div>
        <div className="rotary-knob__ring" aria-hidden="true" />
        <div className="rotary-knob__cap" aria-hidden="true">
          <i />
        </div>
      </div>
      <output className="rotary-knob__value">
        {current}
        <small>{unit}</small>
      </output>
      <span className="rotary-knob__limits">
        {min}
        <span>{upper}</span>
      </span>
    </div>
  )
}
