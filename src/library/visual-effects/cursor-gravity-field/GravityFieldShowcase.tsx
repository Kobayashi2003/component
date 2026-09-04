import { useState } from 'react'
import { CursorGravityField } from './CursorGravityField'

const labels = [
  'Alpha',
  'Layout',
  'Motion',
  'Type',
  'System',
  'Input',
  'Canvas',
  'React',
]

export default function GravityFieldShowcase() {
  const [radius, setRadius] = useState(210)
  const [strength, setStrength] = useState(0.32)
  const [maxDisplacement, setMaxDisplacement] = useState(46)
  const [smoothing, setSmoothing] = useState(0.16)

  return (
    <CursorGravityField
      className="gravity-demo"
      radius={radius}
      strength={strength}
      maxDisplacement={maxDisplacement}
      smoothing={smoothing}
    >
      <div className="gravity-demo__surface">
        <span className="gravity-demo__hint">Move through the interface</span>
        <div className="gravity-elements">
          <div className="gravity-elements__row">
            {labels.slice(0, 4).map((label) => (
              <button data-cursor-gravity type="button" key={label}>
                {label}
              </button>
            ))}
          </div>
          <div className="gravity-elements__cards">
            <article data-cursor-gravity>
              <span>01</span>
              <strong>Signal</strong>
              <i />
            </article>
            <article data-cursor-gravity>
              <span>02</span>
              <strong>Vector</strong>
              <i />
            </article>
            <article data-cursor-gravity>
              <span>03</span>
              <strong>Field</strong>
              <i />
            </article>
          </div>
          <div className="gravity-elements__row gravity-elements__row--offset">
            {labels.slice(4).map((label) => (
              <button data-cursor-gravity type="button" key={label}>
                {label}
              </button>
            ))}
          </div>
          <div className="gravity-elements__metrics">
            <span data-cursor-gravity>24 px</span>
            <span data-cursor-gravity>0.32 G</span>
            <span data-cursor-gravity>60 fps</span>
          </div>
        </div>
        <aside
          className="gravity-controls"
          aria-label="Gravity field parameters"
        >
          <label>
            Radius <output>{radius}</output>
            <input
              type="range"
              min="100"
              max="320"
              value={radius}
              onChange={(event) => setRadius(Number(event.target.value))}
            />
          </label>
          <label>
            Attraction <output>{strength.toFixed(2)}</output>
            <input
              type="range"
              min="-0.5"
              max="0.75"
              step="0.01"
              value={strength}
              onChange={(event) => setStrength(Number(event.target.value))}
            />
          </label>
          <label>
            Travel <output>{maxDisplacement}</output>
            <input
              type="range"
              min="12"
              max="80"
              value={maxDisplacement}
              onChange={(event) =>
                setMaxDisplacement(Number(event.target.value))
              }
            />
          </label>
          <label>
            Follow <output>{Math.round(smoothing * 100)}</output>
            <input
              type="range"
              min="0.05"
              max="0.4"
              step="0.01"
              value={smoothing}
              onChange={(event) => setSmoothing(Number(event.target.value))}
            />
          </label>
        </aside>
      </div>
    </CursorGravityField>
  )
}
