import { memo, useId } from 'react'
import { letterforms } from './letterforms'

const title = [
  { spine: 'T', front: 'HE', width: 222 },
  { spine: 'B', front: 'OOK', width: 405 },
  { spine: 'O', front: 'F', width: 95 },
  { spine: 'N', front: 'EW', width: 280 },
  { spine: 'W', front: 'ORLDS', width: 565 },
]

const bottomRules = Array.from({ length: 9 }, (_, i) => `M19 ${12 + i * 11}H603`).join(' ')

function Lettering({ text, width, height = 108 }: { text: string; width: number; height?: number }) {
  const glyphs = Array.from(text, (letter) => letterforms[letter])
  let total = 0
  const positioned = glyphs.map((glyph) => {
    const x = total
    total += glyph.width + 9
    return { ...glyph, x }
  })
  total -= 9
  return <g transform={`translate(0 ${-height}) scale(${width / total} ${height / 200})`}>
    {positioned.map(({ path, x }) => <path key={x} d={path} fillRule="evenodd" transform={`translate(${x} 0)`} />)}
  </g>
}

export const BookArtwork = memo(function BookArtwork({ face }: { face: 'front' | 'spine' | 'bottom' }) {
  const id = useId().replace(/:/g, '')
  if (face === 'bottom') return (
    <svg viewBox="0 0 640 115" aria-hidden="true" className="type-book__art">
      <path d={bottomRules} fill="none" stroke="#d7eded" strokeWidth="2.5" />
    </svg>
  )
  const width = face === 'spine' ? 115 : 640
  return (
    <svg viewBox={`0 0 ${width} 920`} aria-hidden="true" className="type-book__art">
      <defs>
        <pattern id={`${id}-rule`} width="8" height="9" patternUnits="userSpaceOnUse"><path d="M0 2H8" stroke="#d7eded" strokeWidth="2.5" /></pattern>
        <mask id={`${id}-ribbon`} maskUnits="userSpaceOnUse" x="19" y="799" width="584" height="75">
          <path d="M19 799H603V874H19Z" fill="white" />
          <path d="M298 819H592V850H298Z" fill="black" />
        </mask>
      </defs>
      <g fill="#d7eded">
        {title.map((row, index) => (
          <g key={row.spine} transform={`translate(${face === 'spine' ? 11 : 19} ${260 + index * 126})`}>
            <Lettering text={face === 'spine' ? row.spine : row.front} width={face === 'spine' ? 93 : row.width} />
          </g>
        ))}
        {face === 'front' && <>
          <path d="M20 22H249V131H20Z" />
          <text className="type-book__sans type-book__cutout" x="35" y="48" fontSize="20" fontWeight="700"><tspan x="35">A gathering of stories,</tspan><tspan x="35" dy="26">ideas, and unexpected</tspan><tspan x="35" dy="26">new perspectives.</tspan></text>
          <text className="type-book__sans" x="477" y="205" fontSize="20" textAnchor="middle"><tspan x="477">An invitation</tspan><tspan x="477" dy="25">to see beyond</tspan><tspan x="477" dy="25">the cover.</tspan></text>
          <text className="type-book__sans" x="494" y="477" fontSize="33" textAnchor="middle" letterSpacing="2"><tspan x="494">VOL.</tspan><tspan x="494" dy="43">— 01</tspan><tspan x="494" dy="43">OPEN</tspan><tspan x="494" dy="43">2026</tspan></text>
          <path d="M19 799H603V874H19Z" fill={`url(#${id}-rule)`} mask={`url(#${id}-ribbon)`} />
          <text className="type-book__sans type-book__ribbon-copy" x="313" y="840" fontSize="13" fontWeight="700" textLength="264" lengthAdjust="spacingAndGlyphs">A DIFFERENT POINT OF VIEW</text>
        </>}
        {face === 'spine' && <>
          <text className="type-book__sans" x="57.5" y="72" fontSize="13" textAnchor="middle" letterSpacing="3">OPEN</text>
          <path d="M20 811H95M20 821H95M20 831H95" stroke="currentColor" strokeWidth="2" />
          <text className="type-book__sans" x="57.5" y="878" fontSize="16" textAnchor="middle">01</text>
        </>}
      </g>
    </svg>
  )
})
