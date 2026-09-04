import { useState } from 'react'
import './styles.css'

import pattern01Url from './assets/pattern-01.svg'
import pattern02Url from './assets/pattern-02.svg'
import pattern03Url from './assets/pattern-03.svg'
import pattern04Url from './assets/pattern-04.svg'
import pattern05Url from './assets/pattern-05.svg'
import pattern06Url from './assets/pattern-06.svg'

const patterns = [
  { id: 'pattern-01', label: 'Pattern 01', src: pattern01Url, paths: 28 },
  { id: 'pattern-02', label: 'Pattern 02', src: pattern02Url, paths: 28 },
  { id: 'pattern-03', label: 'Pattern 03', src: pattern03Url, paths: 13 },
  { id: 'pattern-04', label: 'Pattern 04', src: pattern04Url, paths: 22 },
  { id: 'pattern-05', label: 'Pattern 05', src: pattern05Url, paths: 28 },
  { id: 'pattern-06', label: 'Pattern 06', src: pattern06Url, paths: 20 },
] as const

export function SvgExpressionPatterns() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selectedPattern = patterns[selectedIndex]

  const selectRelativePattern = (offset: number) => {
    setSelectedIndex((current) => (current + offset + patterns.length) % patterns.length)
  }

  return (
    <section className="expression-patterns" aria-labelledby="expression-patterns-title">
      <header className="expression-patterns__header">
        <div>
          <p className="expression-patterns__eyebrow">SVG path study</p>
          <h1 id="expression-patterns-title">SVG Expression Patterns</h1>
          <p className="expression-patterns__intro">
            Six hand-drawn expression studies, reconstructed as local SVG assets and arranged for
            quick visual comparison.
          </p>
        </div>

        <div className="expression-patterns__status" aria-live="polite" aria-atomic="true">
          <span>{selectedPattern.label}</span>
          <span>{selectedPattern.paths} paths</span>
        </div>
      </header>

      <div className="expression-patterns__workspace">
        <div className="expression-patterns__preview">
          <div className="expression-patterns__artwork">
            {patterns.map((pattern, index) => (
              <img
                key={pattern.id}
                className="expression-patterns__artwork-layer"
                data-active={index === selectedIndex || undefined}
                src={pattern.src}
                alt={index === selectedIndex ? `${pattern.label} expression preview` : ''}
                aria-hidden={index !== selectedIndex}
                draggable="false"
              />
            ))}
          </div>
        </div>

        <div
          className="expression-patterns__selector"
          aria-label="Expression patterns"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
            event.preventDefault()
            selectRelativePattern(event.key === 'ArrowDown' ? 1 : -1)
          }}
        >
          {patterns.map((pattern, index) => {
            const selected = index === selectedIndex

            return (
              <button
                key={pattern.id}
                type="button"
                className="expression-patterns__pattern"
                aria-pressed={selected}
                onClick={() => setSelectedIndex(index)}
              >
                <span className="expression-patterns__thumbnail" aria-hidden="true">
                  <img src={pattern.src} alt="" loading={index > 1 ? 'lazy' : 'eager'} draggable="false" />
                </span>
                <span className="expression-patterns__pattern-meta">
                  <strong>{pattern.label}</strong>
                  <small>{pattern.paths} paths</small>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default SvgExpressionPatterns
