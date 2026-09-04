import { useRef } from 'react'
import type { PointerEvent } from 'react'
import { SemanticDragCursor } from './SemanticDragCursor'

const projects = [
  { number: '01', title: 'Monument', tone: '#df664f' },
  { number: '02', title: 'Assembly', tone: '#748fda' },
  { number: '03', title: 'Afterimage', tone: '#d1b85f' },
  { number: '04', title: 'Strata', tone: '#82a87a' },
  { number: '05', title: 'Continuum', tone: '#b98ac4' },
]

export default function SemanticDragCursorShowcase() {
  const rail = useRef<HTMLDivElement>(null)
  const drag = useRef({ active: false, startX: 0, startScroll: 0 })

  const beginDrag = (event: PointerEvent<HTMLDivElement>) => {
    const node = rail.current
    if (!node) return
    drag.current = {
      active: true,
      startX: event.clientX,
      startScroll: node.scrollLeft,
    }
    node.setPointerCapture(event.pointerId)
  }

  const updateDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current.active || !rail.current) return
    rail.current.scrollLeft =
      drag.current.startScroll - (event.clientX - drag.current.startX)
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    drag.current.active = false
    if (rail.current?.hasPointerCapture(event.pointerId))
      rail.current.releasePointerCapture(event.pointerId)
  }

  return (
    <SemanticDragCursor className="semantic-cursor-demo">
      <div className="semantic-demo__topline">
        <span>CURSOR STATES / 05—06</span>
        <a
          href="#semantic-docs"
          data-cursor="link"
          aria-label="Open documentation"
        >
          Documentation
        </a>
      </div>

      <div className="semantic-demo__intro">
        <span>Context becomes feedback.</span>
        <button type="button" data-cursor="play" data-cursor-label="PLAY">
          Show reel
        </button>
      </div>

      <div
        ref={rail}
        className="semantic-project-rail"
        data-cursor="drag"
        data-cursor-label="←  DRAG  →"
        onPointerDown={beginDrag}
        onPointerMove={updateDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="semantic-project-track">
          {projects.map((project) => (
            <article
              className="semantic-project"
              key={project.number}
              style={{ '--project-tone': project.tone } as React.CSSProperties}
            >
              <span>{project.number}</span>
              <div
                className="semantic-project__visual"
                data-cursor="view"
                data-cursor-label="VIEW"
              >
                <i />
                <i />
                <i />
              </div>
              <h2>{project.title}</h2>
            </article>
          ))}
        </div>
      </div>

      <div className="semantic-demo__legend">
        <span data-cursor="default">Default</span>
        <a href="#open" data-cursor="link" data-cursor-label="OPEN">
          Open project
        </a>
        <button type="button" data-cursor="view">
          View image
        </button>
        <button type="button" data-cursor="play">
          Play film
        </button>
      </div>
    </SemanticDragCursor>
  )
}
