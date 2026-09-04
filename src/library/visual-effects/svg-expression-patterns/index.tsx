import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import './styles.css'
import { createHiddenMorphFrame, createMorphFrame, type MorphFrame } from './morph'

import pattern01Url from './assets/pattern-01.svg'
import pattern02Url from './assets/pattern-02.svg'
import pattern03Url from './assets/pattern-03.svg'
import pattern04Url from './assets/pattern-04.svg'
import pattern05Url from './assets/pattern-05.svg'
import pattern06Url from './assets/pattern-06.svg'

const patterns = [
  {
    id: 'pattern-01',
    label: 'Pattern 01',
    src: pattern01Url,
    paths: 28,
    motion: 'press',
    duration: 520,
  },
  {
    id: 'pattern-02',
    label: 'Pattern 02',
    src: pattern02Url,
    paths: 28,
    motion: 'pop',
    duration: 620,
  },
  {
    id: 'pattern-03',
    label: 'Pattern 03',
    src: pattern03Url,
    paths: 13,
    motion: 'snap',
    duration: 340,
  },
  {
    id: 'pattern-04',
    label: 'Pattern 04',
    src: pattern04Url,
    paths: 22,
    motion: 'glance',
    duration: 520,
  },
  {
    id: 'pattern-05',
    label: 'Pattern 05',
    src: pattern05Url,
    paths: 28,
    motion: 'bounce',
    duration: 680,
  },
  {
    id: 'pattern-06',
    label: 'Pattern 06',
    src: pattern06Url,
    paths: 20,
    motion: 'smirk',
    duration: 720,
  },
] as const

type MorphLayerProps = {
  fromIndex: number
  toIndex: number
  duration: number
  motion: (typeof patterns)[number]['motion']
  transitionId: number
}

function MorphLayer({ fromIndex, toIndex, duration, motion, transitionId }: MorphLayerProps) {
  const [frame, setFrame] = useState<MorphFrame>(() => createHiddenMorphFrame(toIndex))

  useEffect(() => {
    if (transitionId === 0 || fromIndex === toIndex) {
      setFrame(createHiddenMorphFrame(toIndex))
      return
    }

    const media = window.matchMedia('(prefers-reduced-motion: reduce)')

    if (media.matches) {
      setFrame(createHiddenMorphFrame(toIndex))
      return
    }

    let animationFrame = 0
    const startedAt = performance.now()

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      setFrame(createMorphFrame(fromIndex, toIndex, progress, motion))

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(tick)
      }
    }

    animationFrame = window.requestAnimationFrame(tick)

    return () => window.cancelAnimationFrame(animationFrame)
  }, [duration, fromIndex, motion, toIndex, transitionId])

  return (
    <svg
      className="expression-patterns__morph-layer"
      viewBox="0 0 590 415"
      aria-hidden="true"
      style={{ opacity: frame.opacity }}
    >
      <g transform={frame.transform}>
        <path className="expression-patterns__morph-arch" d={frame.paths.leftArch} />
        <path className="expression-patterns__morph-arch" d={frame.paths.rightArch} />
        <path className="expression-patterns__morph-eye" d={frame.paths.leftEye} />
        <path className="expression-patterns__morph-eye" d={frame.paths.rightEye} />
        <path className="expression-patterns__morph-mouth" d={frame.paths.mouth} />
      </g>
    </svg>
  )
}

export function SvgExpressionPatterns() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [outgoingIndex, setOutgoingIndex] = useState<number | null>(null)
  const [transitionCount, setTransitionCount] = useState(0)
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selectedPattern = patterns[selectedIndex]
  const hasTransitioned = transitionCount > 0

  useEffect(() => {
    if (outgoingIndex === null) return

    const timer = window.setTimeout(() => {
      setOutgoingIndex(null)
    }, selectedPattern.duration + 80)

    return () => window.clearTimeout(timer)
  }, [outgoingIndex, selectedPattern.duration, transitionCount])

  const selectPattern = (nextIndex: number, focus = false) => {
    if (nextIndex === selectedIndex) return

    setOutgoingIndex(selectedIndex)
    setSelectedIndex(nextIndex)
    setTransitionCount((current) => current + 1)

    if (focus) {
      window.requestAnimationFrame(() => buttonRefs.current[nextIndex]?.focus())
    }
  }

  const selectRelativePattern = (offset: number, focus = false) => {
    const nextIndex = (selectedIndex + offset + patterns.length) % patterns.length
    selectPattern(nextIndex, focus)
  }

  const artworkStyle = {
    '--expression-motion-duration': `${selectedPattern.duration}ms`,
  } as CSSProperties

  return (
    <section className="expression-patterns" aria-labelledby="expression-patterns-title">
      <header className="expression-patterns__header">
        <div>
          <p className="expression-patterns__eyebrow">SVG path study</p>
          <h1 id="expression-patterns-title">SVG Expression Patterns</h1>
          <p className="expression-patterns__intro">
            Six hand-drawn expression studies with path-based feature morphing and distinct
            transition personalities.
          </p>
        </div>

        <div className="expression-patterns__status" aria-live="polite" aria-atomic="true">
          <span>{selectedPattern.label}</span>
          <span>{selectedPattern.paths} paths</span>
        </div>
      </header>

      <div className="expression-patterns__workspace">
        <div className="expression-patterns__preview">
          <div
            className="expression-patterns__artwork"
            data-motion={selectedPattern.motion}
            data-animate={hasTransitioned || undefined}
            style={artworkStyle}
          >
            {patterns.map((pattern, index) => {
              const state =
                index === selectedIndex ? 'active' : index === outgoingIndex ? 'outgoing' : 'idle'

              return (
                <img
                  key={pattern.id}
                  className="expression-patterns__artwork-layer"
                  data-state={state}
                  src={pattern.src}
                  alt={index === selectedIndex ? `${pattern.label} expression preview` : ''}
                  aria-hidden={index !== selectedIndex}
                  draggable="false"
                />
              )
            })}

            <MorphLayer
              fromIndex={outgoingIndex ?? selectedIndex}
              toIndex={selectedIndex}
              duration={selectedPattern.duration}
              motion={selectedPattern.motion}
              transitionId={transitionCount}
            />
          </div>
        </div>

        <div
          className="expression-patterns__selector"
          aria-label="Expression patterns"
          onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
              event.preventDefault()
              selectRelativePattern(1, true)
              return
            }

            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
              event.preventDefault()
              selectRelativePattern(-1, true)
              return
            }

            if (event.key === 'Home') {
              event.preventDefault()
              selectPattern(0, true)
              return
            }

            if (event.key === 'End') {
              event.preventDefault()
              selectPattern(patterns.length - 1, true)
            }
          }}
        >
          {patterns.map((pattern, index) => {
            const selected = index === selectedIndex

            return (
              <button
                key={pattern.id}
                ref={(node: HTMLButtonElement | null) => {
                  buttonRefs.current[index] = node
                }}
                type="button"
                className="expression-patterns__pattern"
                aria-pressed={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectPattern(index)}
              >
                <span className="expression-patterns__thumbnail" aria-hidden="true">
                  <img
                    src={pattern.src}
                    alt=""
                    loading={index > 1 ? 'lazy' : 'eager'}
                    draggable="false"
                  />
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
