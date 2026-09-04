import { useCallback, useEffect, useRef } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import './styles.css'

export interface CursorGravityFieldProps {
  children: ReactNode
  className?: string
  selector?: string
  radius?: number
  strength?: number
  maxDisplacement?: number
  smoothing?: number
}

interface GravityItem {
  element: HTMLElement
  x: number
  y: number
  targetX: number
  targetY: number
}

type GravityStyle = CSSProperties & Record<`--gravity-${string}`, string>
const DEFAULT_SELECTOR = '[data-cursor-gravity]'

export function CursorGravityField({
  children,
  className = '',
  selector = DEFAULT_SELECTOR,
  radius = 210,
  strength = 0.32,
  maxDisplacement = 46,
  smoothing = 0.16,
}: CursorGravityFieldProps) {
  const root = useRef<HTMLDivElement>(null)
  const frame = useRef<number | null>(null)
  const paintRef = useRef<() => void>(() => undefined)
  const items = useRef<GravityItem[]>([])
  const pointer = useRef({ x: 0, y: 0, active: false })
  const reducedMotion = useRef(false)
  const safeRadius = Math.max(40, radius)
  const safeStrength = Math.max(-1, Math.min(1, strength))
  const safeDisplacement = Math.max(0, maxDisplacement)
  const follow = Math.max(0.02, Math.min(1, smoothing))

  const collect = useCallback(() => {
    const node = root.current
    if (!node) return
    const previous = new Map(items.current.map((item) => [item.element, item]))
    items.current = Array.from(
      node.querySelectorAll<HTMLElement>(selector),
    ).map(
      (element) =>
        previous.get(element) ?? {
          element,
          x: 0,
          y: 0,
          targetX: 0,
          targetY: 0,
        },
    )
  }, [selector])

  const paint = useCallback(() => {
    const node = root.current
    if (!node) return
    const rootBounds = node.getBoundingClientRect()
    let moving = false

    items.current = items.current.map((item) => {
      if (!item.element.isConnected) return item
      let targetX = 0
      let targetY = 0
      if (pointer.current.active && !reducedMotion.current) {
        const bounds = item.element.getBoundingClientRect()
        const centerX =
          bounds.left - rootBounds.left + bounds.width / 2 - item.x
        const centerY = bounds.top - rootBounds.top + bounds.height / 2 - item.y
        const deltaX = pointer.current.x - centerX
        const deltaY = pointer.current.y - centerY
        const distance = Math.hypot(deltaX, deltaY)

        if (distance < safeRadius) {
          const falloff = 1 - distance / safeRadius
          const pull = falloff * falloff * safeStrength
          targetX = Math.max(
            -safeDisplacement,
            Math.min(safeDisplacement, deltaX * pull),
          )
          targetY = Math.max(
            -safeDisplacement,
            Math.min(safeDisplacement, deltaY * pull),
          )
        }
      }

      const speed = reducedMotion.current ? 1 : follow
      const x = item.x + (targetX - item.x) * speed
      const y = item.y + (targetY - item.y) * speed
      item.element.style.setProperty('--gravity-shift-x', `${x}px`)
      item.element.style.setProperty('--gravity-shift-y', `${y}px`)
      if (Math.abs(targetX - x) > 0.08 || Math.abs(targetY - y) > 0.08)
        moving = true
      return { ...item, x, y, targetX, targetY }
    })

    frame.current =
      pointer.current.active || moving
        ? requestAnimationFrame(() => paintRef.current())
        : null
  }, [follow, safeDisplacement, safeRadius, safeStrength])

  useEffect(() => {
    paintRef.current = paint
  }, [paint])

  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    collect()
    const observer = new MutationObserver(collect)
    if (root.current)
      observer.observe(root.current, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      for (const item of items.current) {
        item.element.style.removeProperty('--gravity-shift-x')
        item.element.style.removeProperty('--gravity-shift-y')
      }
    }
  }, [collect])

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointer.current = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      active: true,
    }
    event.currentTarget.style.setProperty(
      '--gravity-x',
      `${pointer.current.x}px`,
    )
    event.currentTarget.style.setProperty(
      '--gravity-y',
      `${pointer.current.y}px`,
    )
    event.currentTarget.classList.add('is-active')
    if (frame.current === null) frame.current = requestAnimationFrame(paint)
  }

  return (
    <div
      ref={root}
      className={`cursor-gravity-field ${className}`.trim()}
      style={{ '--gravity-radius': `${safeRadius}px` } as GravityStyle}
      onPointerEnter={move}
      onPointerMove={move}
      onPointerLeave={() => {
        pointer.current.active = false
        root.current?.classList.remove('is-active')
        if (frame.current === null) frame.current = requestAnimationFrame(paint)
      }}
    >
      {children}
      <div className="cursor-gravity-field__cursor" aria-hidden="true" />
    </div>
  )
}
