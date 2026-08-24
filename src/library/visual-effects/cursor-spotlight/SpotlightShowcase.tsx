import { useState } from "react";
import { CursorSpotlight } from "./CursorSpotlight";

const lightColors = ["#dbeeff", "#ffd9ad", "#d9c7ff"];

export default function SpotlightShowcase() {
  const [radius, setRadius] = useState(320);
  const [intensity, setIntensity] = useState(28);
  const [softness, setSoftness] = useState(72);
  const [smoothing, setSmoothing] = useState(0.14);
  const [shadowDistance, setShadowDistance] = useState(52);
  const [color, setColor] = useState("#dbeeff");

  return (
    <CursorSpotlight
      className="spotlight-demo"
      color={color}
      radius={radius}
      intensity={intensity}
      softness={softness}
      smoothing={smoothing}
      shadowDistance={shadowDistance}
    >
      <div className="spotlight-surface">
        <span className="spotlight-hint">Move across the surface</span>
        <div className="material-slab">
          <span>DIFFUSED / 01</span>
        </div>

        <aside className="spotlight-controls" aria-label="Spotlight parameters">
          <label>
            Radius <output>{radius}</output>
            <input
              type="range"
              min="180"
              max="480"
              value={radius}
              onChange={(event) => setRadius(Number(event.target.value))}
            />
          </label>

          <label>
            Intensity <output>{intensity}%</output>
            <input
              type="range"
              min="10"
              max="55"
              value={intensity}
              onChange={(event) => setIntensity(Number(event.target.value))}
            />
          </label>

          <label>
            Softness <output>{softness}%</output>
            <input
              type="range"
              min="35"
              max="90"
              value={softness}
              onChange={(event) => setSoftness(Number(event.target.value))}
            />
          </label>

          <label>
            Shadow <output>{shadowDistance}</output>
            <input
              type="range"
              min="18"
              max="90"
              value={shadowDistance}
              onChange={(event) =>
                setShadowDistance(Number(event.target.value))
              }
            />
          </label>

          <label>
            Follow <output>{Math.round(smoothing * 100)}</output>
            <input
              type="range"
              min="6"
              max="35"
              value={smoothing * 100}
              onChange={(event) =>
                setSmoothing(Number(event.target.value) / 100)
              }
            />
          </label>

          <div className="spotlight-colors">
            {lightColors.map((item) => (
              <button
                key={item}
                type="button"
                aria-label={`Light ${item}`}
                aria-pressed={color === item}
                style={{ background: item }}
                onClick={() => setColor(item)}
              />
            ))}
          </div>
        </aside>
      </div>
    </CursorSpotlight>
  );
}
