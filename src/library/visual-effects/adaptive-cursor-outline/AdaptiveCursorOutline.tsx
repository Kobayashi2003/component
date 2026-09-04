import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent, PointerEvent, ReactNode } from 'react'
import './styles.css'

export interface AdaptiveCursorOutlineProps {
  children: ReactNode
  className?: string
  selector?: string
  color?: string
  padding?: number
  duration?: number
  strokeWidth?: number
  cursorSize?: number
}

interface Geometry {
  x: number
  y: number
  width: number
  height: number
  radius: number
  path?: string
}

const DEFAULT_SELECTOR =
  '[data-cursor-focus],button,a[href],input,select,textarea'

export function AdaptiveCursorOutline({
  children,
  className = '',
  selector = DEFAULT_SELECTOR,
  color = '#e6ff69',
  padding = 8,
  duration = 260,
  strokeWidth = 1.5,
  cursorSize = 10,
}: AdaptiveCursorOutlineProps) {
  const root = useRef<HTMLDivElement>(null)
  const activeTarget = useRef<HTMLElement | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const targetedRef = useRef(false)
  const settleTimer = useRef<number | null>(null)
  const introFrame = useRef<number | null>(null)
  const [geometry, setGeometry] = useState<Geometry | null>(null)
  const [visible, setVisible] = useState(false)
  const [targeted, setTargeted] = useState(false)

  const setTargetState = useCallback((next: boolean) => {
    targetedRef.current = next
    setTargeted(next)
  }, [])

  const clearPending = useCallback(() => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    if (introFrame.current !== null)
      window.cancelAnimationFrame(introFrame.current)
    settleTimer.current = null
    introFrame.current = null
  }, [])

  const cursorGeometry = useCallback(
    (): Geometry => ({
      x: pointer.current.x - cursorSize / 2,
      y: pointer.current.y - cursorSize / 2,
      width: cursorSize,
      height: cursorSize,
      radius: cursorSize / 2,
    }),
    [cursorSize],
  )

  const geometryFor = useCallback(
    (target: HTMLElement): Geometry => {
      const rootBounds = root.current?.getBoundingClientRect()
      const targetBounds = target.getBoundingClientRect()
      const radius =
        Number.parseFloat(getComputedStyle(target).borderRadius) || 0
      return {
        x: targetBounds.left - (rootBounds?.left ?? 0) - padding,
        y: targetBounds.top - (rootBounds?.top ?? 0) - padding,
        width: targetBounds.width + padding * 2,
        height: targetBounds.height + padding * 2,
        radius: radius + padding,
        path: target.dataset.cursorPath,
      }
    },
    [padding],
  )

  const select = useCallback(
    (target: HTMLElement | null) => {
      if (target === activeTarget.current) return
      activeTarget.current = target
      clearPending()

      if (target) {
        if (!targetedRef.current) {
          setGeometry(cursorGeometry())
          introFrame.current = window.requestAnimationFrame(() => {
            introFrame.current = null
            if (activeTarget.current !== target || !target.isConnected) return
            setTargetState(true)
            setGeometry(geometryFor(target))
          })
        } else {
          setGeometry(geometryFor(target))
        }
        return
      }

      if (targetedRef.current) {
        setGeometry(cursorGeometry())
        settleTimer.current = window.setTimeout(() => {
          settleTimer.current = null
          if (activeTarget.current) return
          setTargetState(false)
          setGeometry(cursorGeometry())
        }, duration)
      } else {
        setGeometry(cursorGeometry())
      }
    },
    [clearPending, cursorGeometry, duration, geometryFor, setTargetState],
  )

  const find = useCallback(
    (value: EventTarget | null) => {
      const item =
        value instanceof Element ? value.closest<HTMLElement>(selector) : null
      return item && root.current?.contains(item) ? item : null
    },
    [selector],
  )

  const updatePointer = useCallback((clientX: number, clientY: number) => {
    const bounds = root.current?.getBoundingClientRect()
    pointer.current = {
      x: clientX - (bounds?.left ?? 0),
      y: clientY - (bounds?.top ?? 0),
    }
  }, [])

  const move = (event: PointerEvent<HTMLDivElement>) => {
    updatePointer(event.clientX, event.clientY)
    if (event.pointerType === 'touch') {
      setVisible(false)
      return
    }

    setVisible(true)
    const target = find(event.target)
    if (target) {
      select(target)
    } else {
      if (activeTarget.current) select(null)
      // Keep updating the return destination while the pointer moves quickly
      // away from a target; otherwise the frame chases a stale exit point.
      setGeometry(cursorGeometry())
    }
  }

  const leave = (event: PointerEvent<HTMLDivElement>) => {
    updatePointer(event.clientX, event.clientY)
    clearPending()
    activeTarget.current = null
    setTargetState(false)
    setGeometry(cursorGeometry())
    setVisible(false)
  }

  const focus = (event: FocusEvent<HTMLDivElement>) => {
    const target = find(event.target)
    if (!target) return
    const bounds = target.getBoundingClientRect()
    updatePointer(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    )
    setVisible(true)
    activeTarget.current = null
    select(target)
  }

  useEffect(() => {
    const hide = () => {
      clearPending()
      activeTarget.current = null
      targetedRef.current = false
      setTargeted(false)
      setVisible(false)
    }
    window.addEventListener('blur', hide)
    return () => {
      window.removeEventListener('blur', hide)
      clearPending()
    }
  }, [clearPending])

  const vars = {
    '--cursor-color': color,
    '--cursor-duration': `${duration}ms`,
    '--cursor-stroke': strokeWidth,
  } as CSSProperties
  const frameStyle = geometry
    ? ({
        left: geometry.x,
        top: geometry.y,
        width: geometry.width,
        height: geometry.height,
        borderRadius: geometry.radius,
      } as CSSProperties)
    : undefined

  return (
    <div
      ref={root}
      className={`adaptive-cursor ${className}`.trim()}
      style={vars}
      onPointerMove={move}
      onPointerEnter={move}
      onPointerLeave={leave}
      onFocus={focus}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) {
          clearPending()
          activeTarget.current = null
          setTargetState(false)
          setVisible(false)
        }
      }}
    >
      {children}
      <div
        className={`adaptive-cursor__frame ${visible ? 'is-visible' : ''} ${targeted ? 'is-target' : ''} ${geometry?.path ? 'has-path' : ''}`}
        style={frameStyle}
        aria-hidden="true"
      >
        {geometry?.path ? (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d={geometry.path} vectorEffect="non-scaling-stroke" />
          </svg>
        ) : null}
      </div>
    </div>
  )
}
