import { useId, useState } from 'react'
import {
  CONTROL_DEFINITIONS,
  type GeometryLightControls as ControlValues,
  type GeometryType,
  type LightSource,
  type RenderMode,
} from '../model'
import { LightControls } from './LightControls'
import { RangeControl } from './RangeControl'

type GeometryLightControlsProps = {
  controls: ControlValues
  onControlChange: (key: keyof ControlValues, value: number) => void
  geometry: GeometryType
  setGeometry: (geometry: GeometryType) => void
  renderMode: RenderMode
  setRenderMode: (mode: RenderMode) => void
  lights: LightSource[]
  onUpdateLight: (id: number, patch: Partial<Omit<LightSource, 'id'>>) => void
  onAddLight: () => void
  onRemoveLight: (id: number) => void
  onReset: () => void
  error: string | null
}

export function GeometryLightControls({
  controls,
  onControlChange,
  geometry,
  setGeometry,
  renderMode,
  setRenderMode,
  lights,
  onUpdateLight,
  onAddLight,
  onRemoveLight,
  onReset,
  error,
}: GeometryLightControlsProps) {
  const [expanded, setExpanded] = useState(true)
  const contentId = useId()

  return (
    <aside className={`geometry-panel${expanded ? '' : ' geometry-panel--collapsed'}`} aria-label="Geometry lighting controls">
      <header className="geometry-panel__header">
        <div>
          <span className="geometry-panel__eyebrow">Interactive rendering study</span>
          <strong>Geometry Light Lab</strong>
          {expanded ? <p>Drag the canvas to rotate X/Y. Use the Z slider for precise roll. Drag light markers to relight.</p> : null}
        </div>
        <div className="geometry-panel__actions">
          {expanded ? <button type="button" onClick={onReset}>Reset</button> : null}
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? 'Hide' : 'Controls'} <span aria-hidden="true">{expanded ? '−' : '+'}</span>
          </button>
        </div>
      </header>

      {expanded ? (
        <div id={contentId} className="geometry-panel__content">
          {error ? <p className="geometry-panel__error" role="alert">{error}</p> : null}

          <section className="geometry-panel__section">
            <div className="geometry-panel__section-heading"><span>Geometry</span><em>Ray-marched SDF</em></div>
            <div className="geometry-segmented" role="group" aria-label="Geometry">
              {(['sphere', 'cube', 'torus'] as const).map((shape) => (
                <button
                  key={shape}
                  type="button"
                  className={geometry === shape ? 'is-active' : ''}
                  aria-pressed={geometry === shape}
                  onClick={() => setGeometry(shape)}
                >
                  {shape}
                </button>
              ))}
            </div>
          </section>

          <section className="geometry-panel__section">
            <div className="geometry-panel__section-heading"><span>Object transform</span><em>Size &amp; XYZ</em></div>
            <div className="geometry-panel__grid">
              {CONTROL_DEFINITIONS.filter((item) => item.group === 'object').map((item) => (
                <RangeControl
                  key={item.key}
                  label={item.label}
                  value={controls[item.key]}
                  min={item.min}
                  max={item.max}
                  suffix={item.suffix}
                  onChange={(value) => onControlChange(item.key, value)}
                />
              ))}
            </div>
          </section>

          <LightControls
            lights={lights}
            onUpdate={onUpdateLight}
            onAdd={onAddLight}
            onRemove={onRemoveLight}
          />

          <section className="geometry-panel__section">
            <div className="geometry-panel__section-heading"><span>Surface response</span><em>Material</em></div>
            <div className="geometry-panel__grid">
              {CONTROL_DEFINITIONS.filter((item) => item.group === 'material').map((item) => (
                <RangeControl
                  key={item.key}
                  label={item.label}
                  value={controls[item.key]}
                  min={item.min}
                  max={item.max}
                  suffix={item.suffix}
                  onChange={(value) => onControlChange(item.key, value)}
                />
              ))}
            </div>
          </section>

          <section className="geometry-panel__section geometry-panel__channel">
            <div className="geometry-panel__section-heading">
              <span>Render channel</span><em>Debug view</em>
            </div>
            <div className="geometry-channel-options" role="radiogroup" aria-label="Render channel">
              {([
                ['final', 'Final'],
                ['normal', 'Normals'],
                ['diffuse', 'Diffuse'],
                ['specular', 'Specular'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={renderMode === mode}
                  className={renderMode === mode ? 'is-active' : ''}
                  onClick={() => setRenderMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  )
}
