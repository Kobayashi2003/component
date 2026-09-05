import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import './styles.css'

export type SemanticCursorState = 'default' | 'link' | 'drag' | 'view' | 'play'

export interface SemanticDragCursorProps {
  children: ReactNode
  className?: string
  color?: string
  smoothing?: number
  selector?: string
}

type CursorStyle = CSSProperties & Record<`--semantic-cursor-${string}`, string>

const DEFAULT_SELECTOR = '[data-cursor]'
const defaultLabels: Record<SemanticCursorState, string> = {
  default: '',
  link: '↗',
  drag: '←  DRAG  →',
  view: 'VIEW',
  play: 'PLAY',
}

function isCursorState(
  value: string | undefined,
): value is SemanticCursorState {
  return (
    value === 'default' ||
    value === 'link' ||
    value === 'drag' ||
    value === 'view' ||
    value === 'play'
  )
}

export function SemanticDragCursor({
  children,
  className = '',
  color = '#dfff42',
  smoothing = 0.24,
  selector = DEFAULT_SELECTOR,
}: SemanticDragCursorProps) {
  const root = useRef<HTMLDivElement>(null)
  const cursor = useRef<HTMLDivElement>(null)
  const frame = useRef<number | null>(null)
  const paintRef = useRef<() => void>(() => undefined)
  const current = useRef({ x: 0, y: 0 })
  const target = useRef({ x: 0, y: 0 })
  const reducedMotion = useRef(false)
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<SemanticCursorState>('default')
  const [label, setLabel] = useState('')
  const [grabbing, setGrabbing] = useState(false)
  const follow = Math.max(0.03, Math.min(1, smoothing))

  const paint = useCallback(() => {
    const speed = reducedMotion.current ? 1 : follow
    current.current.x += (target.current.x - current.current.x) * speed
    current.current.y += (target.current.y - current.current.y) * speed

    const deltaX = target.current.x - current.current.x
    const deltaY = target.current.y - current.current.y
    if (Math.abs(deltaX) + Math.abs(deltaY) < 0.12) {
      current.current = { ...target.current }
    }
    cursor.current?.style.setProperty(
      '--semantic-cursor-x',
      `${current.current.x}px`,
    )
    cursor.current?.style.setProperty(
      '--semantic-cursor-y',
      `${current.current.y}px`,
    )

    const unsettled =
      Math.abs(target.current.x - current.current.x) +
        Math.abs(target.current.y - current.current.y) >
      0.12
    frame.current = unsettled
      ? requestAnimationFrame(() => paintRef.current())
      : null
  }, [follow])

  useEffect(() => {
    paintRef.current = paint
  }, [paint])

  useEffect(() => {
    reducedMotion.current = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const release = () => setGrabbing(false)
    const hide = () => setVisible(false)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', hide)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', hide)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [])

  const resolveTarget = (eventTarget: EventTarget | null) => {
    const element =
      eventTarget instanceof Element
        ? eventTarget.closest<HTMLElement>(selector)
        : null
    if (!element || !root.current?.contains(element)) return null
    return element
  }

  const move = (event: PointerEvent<HTMLDivElement>, immediate = false) => {
    if (event.pointerType === 'touch') {
      setVisible(false)
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top
    target.current = { x, y }
    if (immediate || reducedMotion.current)
      current.current = { ...target.current }

    const semanticTarget = resolveTarget(event.target)
    const nextState = semanticTarget?.dataset.cursor
    const resolvedState = isCursorState(nextState) ? nextState : 'default'
    setState(resolvedState)
    setLabel(
      semanticTarget?.dataset.cursorLabel ?? defaultLabels[resolvedState],
    )
    setVisible(true)
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => paintRef.current())
  }

  const style = {
    '--semantic-cursor-color': color,
  } as CursorStyle

  return (
    <div
      ref={root}
      className={`semantic-cursor-root ${className}`.trim()}
      style={style}
      onPointerEnter={(event) => move(event, true)}
      onPointerMove={move}
      onPointerLeave={() => {
        setVisible(false)
        setGrabbing(false)
      }}
      onPointerDown={(event) => {
        const semanticTarget = resolveTarget(event.target)
        if (semanticTarget?.dataset.cursor === 'drag') setGrabbing(true)
      }}
    >
      {children}
      <div
        ref={cursor}
        className={`semantic-cursor semantic-cursor--${state}${visible ? ' is-visible' : ''}${grabbing && state === 'drag' ? ' is-grabbing' : ''}`}
        aria-hidden="true"
      >
        <span className="semantic-cursor__content">
          {state === 'drag' ? (
            <>
              <b className="semantic-cursor__arrow">←</b>
              <span>{grabbing ? 'HOLD' : 'DRAG'}</span>
              <b className="semantic-cursor__arrow">→</b>
            </>
          ) : (
            label
          )}
        </span>
      </div>
    </div>
  )
}
