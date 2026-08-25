import { useId, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  CONTROL_DEFINITIONS,
  type GlassFlowerControls as ControlValues,
  type LightPosition,
  type RenderMode,
} from './model'

type GlassFlowerControlsProps = {
  controls: ControlValues
  setControls: Dispatch<SetStateAction<ControlValues>>
  renderMode: RenderMode
  setRenderMode: (mode: RenderMode) => void
  blueLight: LightPosition
  purpleLight: LightPosition
  error: string | null
  onReset: () => void
}

export function GlassFlowerControls({
  controls,
  setControls,
  renderMode,
  setRenderMode,
  blueLight,
  purpleLight,
  error,
  onReset,
}: GlassFlowerControlsProps) {
  const [expanded, setExpanded] = useState(true)
  const contentId = useId()

  return (
    <aside
      className={`glass-flower-controls${expanded ? '' : ' glass-flower-controls--collapsed'}`}
      aria-label="Relighting controls"
    >
      <div className="glass-flower-controls__header">
        <div className="glass-flower-controls__identity">
          <span className="glass-flower-controls__eyebrow">Material study · 02 lights</span>
          <strong>Alpine Glass Studio</strong>
          {expanded ? (
            <p>
              Shape the light around a clear, sculpted flower. Drag either beacon directly on the canvas.
            </p>
          ) : null}
        </div>
        <div className="glass-flower-controls__actions">
          {expanded ? (
            <button type="button" onClick={onReset} className="glass-flower-controls__reset">
              Reset scene
            </button>
          ) : null}
          <button
            type="button"
            className="glass-flower-controls__toggle"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((current) => !current)}
          >
            <span className="glass-flower-controls__toggle-label">
              {expanded ? 'Hide controls' : 'Show controls'}
            </span>
            <span aria-hidden="true">{expanded ? '−' : '+'}</span>
          </button>
        </div>
      </div>

      {expanded ? (
        <div id={contentId}>
          {error ? <p className="glass-flower-error" role="alert">{error}</p> : null}

          <div className="glass-flower-controls__readout" aria-live="polite">
            <div className="glass-flower-light-readout glass-flower-light-readout--blue">
              <span aria-hidden="true" />
              <div><strong>Azure light</strong><em>{formatPosition(blueLight)}</em></div>
            </div>
            <div className="glass-flower-light-readout glass-flower-light-readout--purple">
              <span aria-hidden="true" />
              <div><strong>Violet light</strong><em>{formatPosition(purpleLight)}</em></div>
            </div>
          </div>

          <section className="glass-flower-controls__section">
            <div className="glass-flower-controls__section-title">
              <span>Render view</span><em>Preview channel</em>
            </div>
            <label className="glass-flower-control glass-flower-control--mode">
              <span className="glass-flower-visually-hidden">Render view</span>
              <select
                value={renderMode}
                onChange={(event) => setRenderMode(event.target.value as RenderMode)}
              >
                <option value="final">Composited glass</option>
                <option value="base">Neutral base texture</option>
                <option value="normal">Surface normal map</option>
                <option value="lighting">Light contribution only</option>
              </select>
            </label>
          </section>

          {(['lights', 'material'] as const).map((group) => (
            <section key={group} className="glass-flower-controls__section">
              <div className="glass-flower-controls__section-title">
                <span>{group === 'lights' ? 'Light field' : 'Glass material'}</span>
                <em>{group === 'lights' ? 'Position & falloff' : 'Surface response'}</em>
              </div>
              <div className="glass-flower-controls__grid">
                {CONTROL_DEFINITIONS.filter((item) => item.group === group).map((item) => (
                  <label key={item.key} className="glass-flower-control">
                    <span>{item.label}<em>{controls[item.key]}{item.suffix}</em></span>
                    <input
                      type="range"
                      min={item.min}
                      max={item.max}
                      value={controls[item.key]}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        setControls((current) => ({ ...current, [item.key]: value }))
                      }}
                    />
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </aside>
  )
}

function formatPosition(position: LightPosition) {
  return `${Math.round(position.x * 100)}%, ${Math.round(position.y * 100)}%`
}
