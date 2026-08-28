import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import type { LightSource } from '../model'

type LightGizmoProps = {
  light: LightSource
  index: number
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void
}

export function LightGizmo({
  light,
  index,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
}: LightGizmoProps) {
  const style = {
    left: `${light.position.x * 100}%`,
    top: `${light.position.y * 100}%`,
    '--light-color': light.color,
    '--light-radius': `${Math.round(22 + light.radius * 0.36)}px`,
  } as CSSProperties

  return (
    <button
      type="button"
      className="geometry-light-gizmo"
      style={style}
      aria-label={`Move light ${index + 1}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <span aria-hidden="true" />
      <em aria-hidden="true">L{index + 1}</em>
    </button>
  )
}
