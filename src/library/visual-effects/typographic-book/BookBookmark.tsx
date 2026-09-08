import { memo } from 'react'

/** The root sits halfway through the page depth, at the book's bottom edge. */
export const BookBookmark = memo(function BookBookmark() {
  return (
    <div className="type-book__bookmark" aria-hidden="true">
      <svg viewBox="0 0 85 135" className="type-book__art">
        <path d="M0 0H85V135L42.5 109 0 135Z" fill="#d7eded" />
        <g className="type-book__sans type-book__cutout" textAnchor="middle" fontWeight="700">
          <text x="42.5" y="39" fontSize="24">01</text>
          <text x="42.5" y="58" fontSize="11">EDITION</text>
        </g>
      </svg>
    </div>
  )
})
