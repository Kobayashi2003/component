import { MAX_LIGHTS, type LightSource } from '../model'
import { RangeControl } from './RangeControl'

type LightControlsProps = {
  lights: LightSource[]
  onUpdate: (id: number, patch: Partial<Omit<LightSource, 'id'>>) => void
  onAdd: () => void
  onRemove: (id: number) => void
}

export function LightControls({ lights, onUpdate, onAdd, onRemove }: LightControlsProps) {
  return (
    <section className="geometry-panel__section">
      <div className="geometry-panel__section-heading">
        <span>Lights</span><em>{lights.length} / {MAX_LIGHTS}</em>
      </div>
      <div className="geometry-light-list">
        {lights.map((light, index) => (
          <article key={light.id} className="geometry-light-card">
            <div className="geometry-light-card__header">
              <strong>Light {index + 1}</strong>
              <span>{Math.round(light.position.x * 100)}, {Math.round(light.position.y * 100)}</span>
              <button
                type="button"
                aria-label={`Remove light ${index + 1}`}
                disabled={lights.length === 1}
                onClick={() => onRemove(light.id)}
              >
                Remove
              </button>
            </div>
            <div className="geometry-light-card__controls">
              <label className="geometry-color-control">
                <span>Color<em>{light.color.toUpperCase()}</em></span>
                <input
                  type="color"
                  value={light.color}
                  aria-label={`Light ${index + 1} color`}
                  onChange={(event) => onUpdate(light.id, { color: event.target.value })}
                />
              </label>
              <RangeControl
                label="Intensity"
                value={light.intensity}
                min={0}
                max={220}
                suffix="%"
                onChange={(value) => onUpdate(light.id, { intensity: value })}
              />
              <RangeControl
                label="Reach"
                value={light.radius}
                min={30}
                max={120}
                suffix="%"
                onChange={(value) => onUpdate(light.id, { radius: value })}
              />
            </div>
          </article>
        ))}
      </div>
      <button
        type="button"
        className="geometry-panel__add"
        disabled={lights.length >= MAX_LIGHTS}
        onClick={onAdd}
      >
        + Add light
      </button>
    </section>
  )
}
