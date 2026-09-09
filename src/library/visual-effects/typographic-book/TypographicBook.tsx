import { useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import { BookArtwork } from './BookArtwork'
import { BookBookmark } from './BookBookmark'
import { initialView, orbit, viewMatrix, views } from './camera'
import './styles.css'

export interface TypographicBookProps {
  className?: string
  backgroundColor?: string
}

const keyRotations: Record<string, [number, number, number]> = {
  arrowup: [6, 0, 0],
  arrowdown: [-6, 0, 0],
  arrowleft: [0, -6, 0],
  arrowright: [0, 6, 0],
  q: [0, 0, -6],
  e: [0, 0, 6],
}

export function TypographicBook({
  className = '',
  backgroundColor = '#f01808',
}: TypographicBookProps) {
  const [orientation, setOrientation] = useState(initialView)
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)
  const hintId = useId()
  const changeZoom = (delta: number) =>
    setZoom((current) => Math.max(0.65, Math.min(1.4, current + delta)))
  const reset = () => {
    setOrientation(initialView)
    setZoom(1)
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || drag.current) return
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    setDragging(true)
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = drag.current
    if (!previous || previous.id !== event.pointerId) return
    const dx = event.clientX - previous.x
    const dy = event.clientY - previous.y
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    // Camera right/up remain screen right/up even after a roll or an upside-down view.
    setOrientation((current) =>
      event.shiftKey ? orbit(current, 0, 0, dx * 0.4) : orbit(current, -dy * 0.4, dx * 0.4),
    )
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const key = event.key.toLowerCase()
    if (keyRotations[key]) {
      event.preventDefault()
      setOrientation((current) => orbit(current, ...keyRotations[key]))
      return
    }
    if (['+', '=', '-', '0', 'home'].includes(key)) {
      event.preventDefault()
      if (key === '0' || key === 'home') reset()
      else changeZoom(key === '-' ? -0.1 : 0.1)
    }
  }

  return (
    <section
      className={`type-book ${className}`}
      style={{ '--book-background': backgroundColor } as CSSProperties}
      aria-label="Typographic Book"
    >
      <header className="type-book__header">
        <span>OPEN / EDITIONS</span>
        <span>THE BOOK OF NEW WORLDS — 01</span>
      </header>
      <div
        className={`type-book__viewport${dragging ? ' is-dragging' : ''}`}
        tabIndex={0}
        role="group"
        aria-label="Book camera. Drag to orbit the book."
        aria-describedby={hintId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
      >
        <div className="type-book__camera" style={{ '--book-zoom': zoom } as CSSProperties}>
          <div
            className="type-book__object"
            style={{ transform: viewMatrix(orientation) }}
            role="img"
            aria-label="Pale lettering outlines a transparent book. THE BOOK OF NEW WORLDS wraps from the left spine to the front, with a striped ribbon underneath and a notched edition bookmark."
          >
            <div className="type-book__face type-book__front">
              <BookArtwork face="front" />
            </div>
            <div className="type-book__face type-book__spine">
              <BookArtwork face="spine" />
            </div>
            <div className="type-book__face type-book__bottom">
              <BookArtwork face="bottom" />
            </div>
            <BookBookmark />
          </div>
        </div>
        <span className="type-book__orbit-hint" aria-hidden="true">
          ↔ DRAG TO EXPLORE
        </span>
      </div>
      <div className="type-book__toolbar" aria-label="Camera controls">
        <div className="type-book__presets" aria-label="Views">
          <button type="button" onClick={reset}>
            Composition
          </button>
          {(['front', 'spine', 'bottom'] as const).map((view) => (
            <button type="button" key={view} onClick={() => setOrientation(views[view])}>
              {view}
            </button>
          ))}
        </div>
        <div className="type-book__camera-controls">
          <button
            type="button"
            aria-label="Roll camera counterclockwise"
            onClick={() => setOrientation((current) => orbit(current, 0, 0, -10))}
          >
            ↶
          </button>
          <button
            type="button"
            aria-label="Roll camera clockwise"
            onClick={() => setOrientation((current) => orbit(current, 0, 0, 10))}
          >
            ↷
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            disabled={zoom <= 0.65}
            onClick={() => changeZoom(-0.1)}
          >
            −
          </button>
          <output aria-label="Camera zoom">{Math.round(zoom * 100)}%</output>
          <button
            type="button"
            aria-label="Zoom in"
            disabled={zoom >= 1.4}
            onClick={() => changeZoom(0.1)}
          >
            +
          </button>
        </div>
      </div>
      <p className="type-book__help" id={hintId}>
        Front / left / below only · Drag or arrow keys to orbit · Shift + drag or Q / E to roll · +
        / − to zoom · 0 to reset
      </p>
    </section>
  )
}
