import { useRef, useState } from 'react'
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from 'react'
import type { GeometryLightControls } from '../model'
import { rotateInViewSpace, type Quaternion } from '../rotation'

type DragState = {
  pointerId: number
  x: number
  y: number
}

export function useObjectRotation(
  setControls: Dispatch<SetStateAction<GeometryLightControls>>,
  setOrientation: Dispatch<SetStateAction<Quaternion>>,
) {
  const dragRef = useRef<DragState | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDragging(true)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    const deltaX = event.clientX - drag.x
    const deltaY = event.clientY - drag.y
    drag.x = event.clientX
    drag.y = event.clientY

    const xRotation = deltaY * 0.45
    const yRotation = deltaX * 0.45
    setOrientation((current) => rotateInViewSpace(current, xRotation, yRotation))

    setControls((current) => ({
      ...current,
      rotationX: wrapDegrees(current.rotationX + xRotation),
      rotationY: wrapDegrees(current.rotationY + yRotation),
    }))
  }

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const step = 5
    const xRotation = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    const yRotation = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    setOrientation((orientation) => rotateInViewSpace(orientation, xRotation, yRotation))
    setControls((current) => ({
      ...current,
      rotationX: wrapDegrees(current.rotationX + xRotation),
      rotationY: wrapDegrees(current.rotationY + yRotation),
    }))
  }

  return {
    isDragging,
    rotationHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onKeyDown,
    },
  }
}

function wrapDegrees(value: number) {
  if (value > 180) return value - 360
  if (value < -180) return value + 360
  return Math.round(value)
}
