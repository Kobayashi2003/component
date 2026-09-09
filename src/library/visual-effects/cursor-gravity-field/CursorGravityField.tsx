import { useCallback, useEffect, useRef } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import './styles.css'

export interface CursorGravityFieldProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  disabled?: boolean
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
  hadClass: boolean
}

const DEFAULT_SELECTOR = '[data-cursor-gravity]'

function restoreItem(item: GravityItem) {
  if (!item.hadClass) item.element.classList.remove('cursor-gravity-field__target')
  item.element.style.removeProperty('--gravity-shift-x')
  item.element.style.removeProperty('--gravity-shift-y')
}

function clampTravel(value: number, limit: number) {
  return Math.max(-limit, Math.min(limit, value))
}

export function CursorGravityField({
  children,
  className = '',
  style: rootStyle,
  disabled = false,
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
  const follow = Math.max(0.01, Math.min(1, smoothing))

  const collect = useCallback(() => {
    const node = root.current
    if (!node) return
    const previous = new Map(items.current.map((item) => [item.element, item]))
    const elements = Array.from(node.querySelectorAll<HTMLElement>(selector))
    for (const item of items.current) if (!elements.includes(item.element)) restoreItem(item)
    items.current = elements.map((element) => {
      const item = previous.get(element) ?? {
        element,
        x: 0,
        y: 0,
        hadClass: element.classList.contains('cursor-gravity-field__target'),
      }
      element.classList.add('cursor-gravity-field__target')
      return item
    })
  }, [selector])

  const paint = useCallback(() => {
    const node = root.current
    if (!node) return
    const attracting = pointer.current.active && !disabled && !reducedMotion.current
    let moving = false

    // Read every layout box before writing any style. Interleaving the two
    // forces a synchronous style flush for each element on every frame.
    const rootBounds = node.getBoundingClientRect()
    const boxes = items.current.map((item) =>
      attracting && item.element.isConnected ? item.element.getBoundingClientRect() : null,
    )

    items.current.forEach((item, index) => {
      const bounds = boxes[index]
      let targetX = 0
      let targetY = 0

      if (bounds) {
        // Subtract the current offset to recover the element's rest position.
        const centerX = bounds.left - rootBounds.left + bounds.width / 2 - item.x
        const centerY = bounds.top - rootBounds.top + bounds.height / 2 - item.y
        const deltaX = pointer.current.x - centerX
        const deltaY = pointer.current.y - centerY
        const distance = Math.hypot(deltaX, deltaY)

        if (distance < safeRadius) {
          const falloff = 1 - distance / safeRadius
          const pull = falloff * falloff * safeStrength
          targetX = clampTravel(deltaX * pull, safeDisplacement)
          targetY = clampTravel(deltaY * pull, safeDisplacement)
        }
      }

      const speed = reducedMotion.current ? 1 : follow
      item.x += (targetX - item.x) * speed
      item.y += (targetY - item.y) * speed
      item.element.style.setProperty('--gravity-shift-x', `${item.x}px`)
      item.element.style.setProperty('--gravity-shift-y', `${item.y}px`)
      if (Math.abs(targetX - item.x) > 0.08 || Math.abs(targetY - item.y) > 0.08) moving = true
    })

    frame.current = attracting || moving ? requestAnimationFrame(() => paintRef.current()) : null
  }, [disabled, follow, safeDisplacement, safeRadius, safeStrength])

  useEffect(() => {
    paintRef.current = paint
    if (frame.current === null) frame.current = requestAnimationFrame(paint)
  }, [paint])

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const syncMotion = () => {
      reducedMotion.current = motionQuery.matches
    }
    const observer = new MutationObserver((records) => {
      if (
        records.some((record) => {
          if (record.type === 'childList') return true
          if (record.attributeName === 'style') return false
          if (record.attributeName !== 'class') return true
          const clean = (value: string | null) =>
            (value ?? '')
              .split(/\s+/)
              .filter((name) => name && name !== 'cursor-gravity-field__target')
              .sort()
              .join(' ')
          return clean(record.oldValue) !== clean((record.target as Element).getAttribute('class'))
        })
      )
        collect()
    })

    syncMotion()
    motionQuery.addEventListener('change', syncMotion)
    collect()
    if (frame.current === null) frame.current = requestAnimationFrame(() => paintRef.current())
    if (root.current)
      observer.observe(root.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true,
      })

    return () => {
      motionQuery.removeEventListener('change', syncMotion)
      observer.disconnect()
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      for (const item of items.current) restoreItem(item)
      items.current = []
      frame.current = null
    }
  }, [collect])

  const schedule = () => {
    if (frame.current === null) frame.current = requestAnimationFrame(() => paintRef.current())
  }

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.pointerType === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointer.current = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      active: true,
    }
    event.currentTarget.style.setProperty('--gravity-x', `${pointer.current.x}px`)
    event.currentTarget.style.setProperty('--gravity-y', `${pointer.current.y}px`)
    event.currentTarget.classList.add('is-active')
    schedule()
  }

  return (
    <div
      ref={root}
      style={rootStyle}
      data-disabled={disabled || undefined}
      className={`cursor-gravity-field ${className}`.trim()}
      onPointerEnter={move}
      onPointerMove={move}
      onPointerLeave={() => {
        pointer.current.active = false
        root.current?.classList.remove('is-active')
        schedule()
      }}
    >
      {children}
      <div className="cursor-gravity-field__cursor" aria-hidden="true" />
    </div>
  )
}
