import './styles.css'
import { TypographicBook } from '..'
import { useState } from 'react'

export default function TypographicBookShowcase() {
  const [background, setBackground] = useState('#f01808')
  return (
    <div className="type-book-showcase">
      <TypographicBook backgroundColor={background} />
      <label className="type-book-showcase__color">
        Background{' '}
        <input
          type="color"
          value={background}
          onChange={(event) => setBackground(event.target.value)}
        />
        <output>{background}</output>
      </label>
    </div>
  )
}
