import { useCallback, useState } from 'react'
import { CursorDistortion } from './CursorDistortion'
import type { CursorDistortionSource } from './CursorDistortion'

export default function CursorDistortionShowcase() {
  const [radius, setRadius] = useState(125)
  const [magnification, setMagnification] = useState(0.2)
  const [distortion, setDistortion] = useState(0.016)
  const [aberration, setAberration] = useState(0.007)

  const drawSource = useCallback(
    ({ context, width, height }: CursorDistortionSource) => {
      context.clearRect(0, 0, width, height)
      context.fillStyle = '#eeeDE8'
      context.fillRect(0, 0, width, height)
      context.strokeStyle = '#d2d1cc'
      context.lineWidth = 1
      for (let x = 28; x < width; x += 44) {
        context.beginPath()
        context.moveTo(x, 0)
        context.lineTo(x, height)
        context.stroke()
      }
      for (let y = 28; y < height; y += 44) {
        context.beginPath()
        context.moveTo(0, y)
        context.lineTo(width, y)
        context.stroke()
      }
      context.fillStyle = '#11110f'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.font = `800 ${Math.min(150, width * 0.16)}px Arial`
      context.fillText('DESIGN', width * 0.43, height * 0.46)
      context.font = '11px monospace'
      context.letterSpacing = '2px'
      context.fillText(
        'OPTICAL INTERFACE / MOVE THE LENS',
        width * 0.43,
        height * 0.61,
      )
      context.fillStyle = '#ff4f3d'
      context.fillRect(width * 0.18, height * 0.68, width * 0.5, 6)
      context.fillStyle = '#161614'
      context.fillRect(width * 0.12, height * 0.18, 52, 52)
      context.fillStyle = '#eeeDE8'
      context.font = '12px monospace'
      context.fillText('09', width * 0.12 + 26, height * 0.18 + 27)
    },
    [],
  )

  return (
    <CursorDistortion
      drawSource={drawSource}
      className="distortion-demo"
      radius={radius}
      magnification={magnification}
      distortion={distortion}
      chromaticAberration={aberration}
    >
      <span className="distortion-hint">
        WebGL unavailable — static preview
      </span>
      <aside
        className="distortion-controls"
        aria-label="Cursor distortion parameters"
      >
        <label>
          Radius <output>{radius}</output>
          <input
            type="range"
            min="70"
            max="210"
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
          />
        </label>
        <label>
          Magnify <output>{magnification.toFixed(2)}</output>
          <input
            type="range"
            min="0"
            max="0.4"
            step="0.01"
            value={magnification}
            onChange={(event) => setMagnification(Number(event.target.value))}
          />
        </label>
        <label>
          Warp <output>{distortion.toFixed(3)}</output>
          <input
            type="range"
            min="0"
            max="0.04"
            step="0.001"
            value={distortion}
            onChange={(event) => setDistortion(Number(event.target.value))}
          />
        </label>
        <label>
          RGB split <output>{aberration.toFixed(3)}</output>
          <input
            type="range"
            min="0"
            max="0.02"
            step="0.001"
            value={aberration}
            onChange={(event) => setAberration(Number(event.target.value))}
          />
        </label>
      </aside>
    </CursorDistortion>
  )
}
