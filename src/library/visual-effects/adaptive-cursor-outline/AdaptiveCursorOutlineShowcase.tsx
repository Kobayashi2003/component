import { useState } from 'react'
import { AdaptiveCursorOutline } from './AdaptiveCursorOutline'

const organicPath =
  'M7 20 C18 3 37 15 48 5 C64 1 69 20 91 14 C98 32 81 43 94 61 C83 83 64 73 49 95 C31 87 35 68 8 75 C2 54 19 40 7 20 Z'
const frameColors = ['#e6ff69', '#70d7ff', '#ff8e73']

export default function AdaptiveCursorOutlineShowcase() {
  const [padding, setPadding] = useState(8)
  const [duration, setDuration] = useState(260)
  const [stroke, setStroke] = useState(1.5)
  const [size, setSize] = useState(10)
  const [color, setColor] = useState('#e6ff69')

  return (
    <AdaptiveCursorOutline
      className="adaptive-outline-demo"
      padding={padding}
      duration={duration}
      strokeWidth={stroke}
      cursorSize={size}
      color={color}
    >
      <div className="shape-field">
        <span className="shape-hint">Move between shapes</span>

        <div className="shape-set">
          <button className="shape-circle" type="button" aria-label="Circle" />
          <button
            className="shape-pill"
            type="button"
            aria-label="Pill shape"
          />
          <button
            className="shape-round"
            type="button"
            aria-label="Rounded square"
          />
          <button
            className="shape-organic"
            type="button"
            aria-label="Organic shape"
            data-cursor-path={organicPath}
          >
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <path d={organicPath} />
            </svg>
          </button>
        </div>

        <aside className="outline-controls" aria-label="Adaptive cursor outline parameters">
          <label>
            Padding <output>{padding}</output>
            <input
              type="range"
              min="2"
              max="18"
              value={padding}
              onChange={(event) => setPadding(Number(event.target.value))}
            />
          </label>

          <label>
            Stroke <output>{stroke}</output>
            <input
              type="range"
              min="1"
              max="4"
              step=".5"
              value={stroke}
              onChange={(event) => setStroke(Number(event.target.value))}
            />
          </label>

          <label>
            Morph <output>{duration}ms</output>
            <input
              type="range"
              min="100"
              max="600"
              step="20"
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
            />
          </label>

          <label>
            Cursor <output>{size}</output>
            <input
              type="range"
              min="6"
              max="18"
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
            />
          </label>

          <div className="outline-colors">
            {frameColors.map((item) => (
              <button
                key={item}
                type="button"
                aria-label={`Frame ${item}`}
                aria-pressed={color === item}
                style={{ background: item }}
                onClick={() => setColor(item)}
              />
            ))}
          </div>
        </aside>
      </div>
    </AdaptiveCursorOutline>
  )
}
