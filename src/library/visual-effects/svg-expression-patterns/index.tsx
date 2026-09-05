import { useId, useRef, useState, type KeyboardEvent } from 'react'
import './styles.css'
import {
  createStaticRigFrame,
  type BlushMode,
  type FeatureBounds,
  type Point,
  type RigFrame,
} from './rig'

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

function segmentPath(points: readonly Point[], start: number, end: number) {
  const selected = points.slice(start, end + 1)
  if (selected.length < 2) return ''

  return selected.reduce(
    (path, point, index) =>
      index === 0
        ? `M ${point[0].toFixed(2)} ${point[1].toFixed(2)}`
        : `${path} L ${point[0].toFixed(2)} ${point[1].toFixed(2)}`,
    '',
  )
}

function lowerSegmentPath(points: readonly Point[]) {
  const selected = [points[18], ...points.slice(19), points[0]]

  return selected.reduce(
    (path, point, index) =>
      index === 0
        ? `M ${point[0].toFixed(2)} ${point[1].toFixed(2)}`
        : `${path} L ${point[0].toFixed(2)} ${point[1].toFixed(2)}`,
    '',
  )
}

function eyeBaselinePath(bounds: FeatureBounds, extend: number, tilt: number) {
  const x1 = bounds.x - extend
  const x2 = bounds.x + bounds.width + extend
  const y = bounds.y + bounds.height + 1.5
  const delta = (x2 - x1) * tilt

  return `M ${x1.toFixed(2)} ${(y - delta / 2).toFixed(2)} Q ${bounds.cx.toFixed(2)} ${y.toFixed(2)} ${x2.toFixed(2)} ${(y + delta / 2).toFixed(2)}`
}

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return value - Math.floor(value)
}

function textureStrokes(
  bounds: FeatureBounds,
  count: number,
  seed: number,
  tilt = 0,
  lengthScale = 1,
) {
  return Array.from({ length: count }, (_, index) => {
    const yRatio = (index + 1) / (count + 1)
    const noiseA = seededUnit(seed * 31 + index * 7 + 1)
    const noiseB = seededUnit(seed * 47 + index * 11 + 3)
    const noiseC = seededUnit(seed * 59 + index * 13 + 5)
    const available = bounds.width * (0.42 + noiseA * 0.36) * lengthScale
    const centerOffset = (noiseB - 0.5) * bounds.width * 0.2
    const centerX = bounds.cx + centerOffset
    const x1 = Math.max(bounds.x + 4, centerX - available / 2)
    const x2 = Math.min(bounds.x + bounds.width - 4, centerX + available / 2)
    const y = bounds.y + bounds.height * yRatio + (noiseC - 0.5) * 3.4
    const bend = (noiseA - 0.5) * 4.2
    const vertical = tilt * (x2 - x1) + (noiseB - 0.5) * 1.8

    return `M ${x1.toFixed(2)} ${y.toFixed(2)} q ${(
      (x2 - x1) * (0.28 + noiseC * 0.22)
    ).toFixed(2)} ${bend.toFixed(2)} ${(x2 - x1).toFixed(2)} ${vertical.toFixed(2)}`
  })
}
function browAccentPath(bounds: FeatureBounds) {
  const left = bounds.x + Math.max(3, bounds.width * 0.04)
  const right = bounds.x + bounds.width - Math.max(3, bounds.width * 0.04)
  const y = bounds.y + Math.max(1.5, bounds.height * 0.12)
  const lift = Math.min(3.2, bounds.height * 0.1)

  return `M ${left.toFixed(2)} ${y.toFixed(2)} Q ${bounds.cx.toFixed(2)} ${(y - lift).toFixed(2)} ${right.toFixed(2)} ${(y + lift * 0.24).toFixed(2)}`
}

function blushPaths(
  cx: number,
  cy: number,
  mode: BlushMode,
  direction: -1 | 1,
  waveScale = 1,
) {
  if (mode === 'none') return []

  if (mode === 'lines') {
    return [-14, 0, 14].map(
      (offset) =>
        `M ${(cx + offset).toFixed(2)} ${(cy - 12).toFixed(2)} q ${
          2 * direction
        } 10 ${direction} 24`,
    )
  }

  if (mode === 'wave') {
    const sx = direction * waveScale
    return [
      `M ${(cx - 34 * sx).toFixed(2)} ${(cy - 10 * waveScale).toFixed(2)} ` +
        `Q ${(cx - 29 * sx).toFixed(2)} ${(cy + 24 * waveScale).toFixed(2)} ${(cx - 21 * sx).toFixed(2)} ${(cy + 9 * waveScale).toFixed(2)} ` +
        `Q ${(cx - 14 * sx).toFixed(2)} ${(cy - 20 * waveScale).toFixed(2)} ${(cx - 6 * sx).toFixed(2)} ${(cy + 10 * waveScale).toFixed(2)} ` +
        `Q ${(cx + 2 * sx).toFixed(2)} ${(cy + 28 * waveScale).toFixed(2)} ${(cx + 10 * sx).toFixed(2)} ${(cy + 7 * waveScale).toFixed(2)} ` +
        `Q ${(cx + 18 * sx).toFixed(2)} ${(cy - 18 * waveScale).toFixed(2)} ${(cx + 26 * sx).toFixed(2)} ${(cy + 10 * waveScale).toFixed(2)} ` +
        `Q ${(cx + 34 * sx).toFixed(2)} ${(cy + 24 * waveScale).toFixed(2)} ${(cx + 39 * sx).toFixed(2)} ${(cy + 5 * waveScale).toFixed(2)}`,
    ]
  }

  return [
    `M ${(cx - 27 * direction).toFixed(2)} ${(cy + 8).toFixed(2)} q ${
      10 * direction
    } -29 ${20 * direction} 0 t ${20 * direction} 0 t ${20 * direction} 0`,
  ]
}

type ExpressionRigProps = {
  frame: RigFrame
  label: string
}

function expandedRect(
  bounds: FeatureBounds,
  padX: number,
  padTop: number,
  padBottom = padTop,
) {
  return {
    x: bounds.x - padX,
    y: bounds.y - padTop,
    width: bounds.width + padX * 2,
    height: bounds.height + padTop + padBottom,
  }
}

function ExactDetailPatch({
  src,
  opacity,
  clipId,
}: {
  src?: string
  opacity: number
  clipId: string
}) {
  if (!src || opacity <= 0.001) return null

  return (
    <image
      className="expression-patterns__exact-detail"
      href={src}
      x="0"
      y="0"
      width="590"
      height="415"
      clipPath={`url(#${clipId})`}
      opacity={opacity}
      preserveAspectRatio="none"
      aria-hidden="true"
    />
  )
}

function DetailPatches({
  layers,
  clipId,
  opacityScale = 1,
}: {
  layers: RigFrame['detailLayers']
  clipId: string
  opacityScale?: number
}) {
  return (
    <>
      {layers.map((layer) => (
        <ExactDetailPatch
          key={`${clipId}-${layer.index}`}
          src={patterns[layer.index]?.src}
          opacity={layer.opacity * opacityScale}
          clipId={clipId}
        />
      ))}
    </>
  )
}

function ExpressionRig({ frame, label }: ExpressionRigProps) {
  const instanceId = useId().replace(/:/g, '')
  const leftEyeClip = `${instanceId}-left-eye`
  const rightEyeClip = `${instanceId}-right-eye`
  const leftBrowClip = `${instanceId}-left-brow`
  const rightBrowClip = `${instanceId}-right-brow`
  const mouthClip = `${instanceId}-mouth`
  const leftEyeDetailClip = `${instanceId}-left-eye-detail`
  const rightEyeDetailClip = `${instanceId}-right-eye-detail`
  const leftBrowDetailClip = `${instanceId}-left-brow-detail`
  const rightBrowDetailClip = `${instanceId}-right-brow-detail`
  const mouthDetailClip = `${instanceId}-mouth-detail`


  const leftEyeDetailRect = expandedRect(frame.bounds.leftEye, 10, 8, 4)
  const rightEyeDetailRect = expandedRect(frame.bounds.rightEye, 10, 8, 4)
  const leftBrowDetailRect = expandedRect(frame.bounds.leftBrow, 7, 5, 5)
  const rightBrowDetailRect = expandedRect(frame.bounds.rightBrow, 7, 5, 5)
  const mouthDetailRect = expandedRect(frame.bounds.mouth, 10, 8, 8)

  const leftEyeWarm = textureStrokes(
    frame.bounds.leftEye,
    10,
    13,
    -frame.style.eyeTextureTilt,
    frame.style.eyeTextureLength,
  )
  const rightEyeWarm = textureStrokes(
    frame.bounds.rightEye,
    10,
    19,
    frame.style.eyeTextureTilt,
    frame.style.eyeTextureLength,
  )
  const leftEyeLight = textureStrokes(
    frame.bounds.leftEye,
    18,
    29,
    -frame.style.eyeTextureTilt * 1.35,
    frame.style.eyeTextureLength * 0.78,
  )
  const rightEyeLight = textureStrokes(
    frame.bounds.rightEye,
    18,
    37,
    frame.style.eyeTextureTilt * 1.35,
    frame.style.eyeTextureLength * 0.78,
  )
  const leftBrowWarm = textureStrokes(frame.bounds.leftBrow, 4, 43, -0.01, 0.82)
  const rightBrowWarm = textureStrokes(frame.bounds.rightBrow, 4, 47, 0.01, 0.82)
  const leftBrowLight = textureStrokes(frame.bounds.leftBrow, 3, 53, -0.015, 0.56)
  const rightBrowLight = textureStrokes(frame.bounds.rightBrow, 3, 59, 0.015, 0.56)

  const leftBlush = blushPaths(
    frame.cheekLeft[0],
    frame.cheekLeft[1],
    frame.blushMode,
    1,
    frame.style.blushWaveScale,
  )
  const rightBlush = blushPaths(
    frame.cheekRight[0],
    frame.cheekRight[1],
    frame.blushMode,
    -1,
    frame.style.blushWaveScale,
  )

  return (
    <svg
      className="expression-patterns__rig"
      viewBox="0 0 590 415"
      role="img"
      aria-label={`${label} expression preview`}
    >
      <defs>
        <clipPath id={leftEyeClip}>
          <path d={frame.paths.leftEye} />
        </clipPath>
        <clipPath id={rightEyeClip}>
          <path d={frame.paths.rightEye} />
        </clipPath>
        <clipPath id={leftBrowClip}>
          <path d={frame.paths.leftBrow} />
        </clipPath>
        <clipPath id={rightBrowClip}>
          <path d={frame.paths.rightBrow} />
        </clipPath>
        <clipPath id={mouthClip}>
          <path d={frame.paths.mouth} />
        </clipPath>
        <clipPath id={leftEyeDetailClip}>
          <rect {...leftEyeDetailRect} />
        </clipPath>
        <clipPath id={rightEyeDetailClip}>
          <rect {...rightEyeDetailRect} />
        </clipPath>
        <clipPath id={leftBrowDetailClip}>
          <rect {...leftBrowDetailRect} />
        </clipPath>
        <clipPath id={rightBrowDetailClip}>
          <rect {...rightBrowDetailRect} />
        </clipPath>
        <clipPath id={mouthDetailClip}>
          <rect {...mouthDetailRect} />
        </clipPath>
      </defs>

      <g className="expression-patterns__cheeks">
        <ellipse
          cx={frame.cheekLeft[0]}
          cy={frame.cheekLeft[1]}
          rx={frame.style.cheekRx}
          ry={frame.style.cheekRy}
          fill={frame.style.cheekFill}
          opacity={frame.blushOpacity * frame.style.cheekFillFactor}
        />
        <ellipse
          cx={frame.cheekRight[0]}
          cy={frame.cheekRight[1]}
          rx={frame.style.cheekRx}
          ry={frame.style.cheekRy}
          fill={frame.style.cheekFill}
          opacity={frame.blushOpacity * frame.style.cheekFillFactor}
        />

        <g
          className="expression-patterns__blush-lines"
          stroke={frame.style.cheekStroke}
          opacity={frame.blushOpacity * frame.style.blushLineFactor}
        >
          {leftBlush.map((path, index) => (
            <path key={`left-${index}`} d={path} />
          ))}
          {rightBlush.map((path, index) => (
            <path key={`right-${index}`} d={path} />
          ))}
        </g>
      </g>

      <g>
        <path
          className="expression-patterns__head-line"
          d={frame.paths.leftHead}
          fill={frame.style.headFill}
        />
      </g>

      <g>
        <path
          className="expression-patterns__head-line"
          d={frame.paths.rightHead}
          fill={frame.style.headFill}
        />
      </g>

      <g>
        <path
          className="expression-patterns__rig-brow"
          d={frame.paths.leftBrow}
          fill={frame.style.browFill}
          stroke={frame.style.browStroke}
        />
        <path
          className="expression-patterns__brow-accent"
          d={browAccentPath(frame.bounds.leftBrow)}
          clipPath={`url(#${leftBrowClip})`}
          stroke={frame.style.browStroke}
          fill="none"
          strokeWidth={frame.style.browAccentStrokeWidth}
          opacity={frame.style.browAccentOpacity}
        />
        <g clipPath={`url(#${leftBrowClip})`}>
          <g
            className="expression-patterns__brow-texture"
            stroke={frame.style.browWarmStroke}
            opacity={frame.style.browTextureOpacity * 0.78}
          >
            {leftBrowWarm.map((path, index) => (
              <path key={`warm-${index}`} d={path} />
            ))}
          </g>
          <g
            className="expression-patterns__brow-texture"
            stroke={frame.style.browLightStroke}
            opacity={frame.style.browTextureOpacity * 0.46}
          >
            {leftBrowLight.map((path, index) => (
              <path key={`light-${index}`} d={path} />
            ))}
          </g>
        </g>
        <DetailPatches layers={frame.detailLayers} clipId={leftBrowDetailClip} />
      </g>

      <g>
        <path
          className="expression-patterns__rig-brow"
          d={frame.paths.rightBrow}
          fill={frame.style.browFill}
          stroke={frame.style.browStroke}
        />
        <path
          className="expression-patterns__brow-accent"
          d={browAccentPath(frame.bounds.rightBrow)}
          clipPath={`url(#${rightBrowClip})`}
          stroke={frame.style.browStroke}
          fill="none"
          strokeWidth={frame.style.browAccentStrokeWidth}
          opacity={frame.style.browAccentOpacity}
        />
        <g clipPath={`url(#${rightBrowClip})`}>
          <g
            className="expression-patterns__brow-texture"
            stroke={frame.style.browWarmStroke}
            opacity={frame.style.browTextureOpacity * 0.78}
          >
            {rightBrowWarm.map((path, index) => (
              <path key={`warm-${index}`} d={path} />
            ))}
          </g>
          <g
            className="expression-patterns__brow-texture"
            stroke={frame.style.browLightStroke}
            opacity={frame.style.browTextureOpacity * 0.46}
          >
            {rightBrowLight.map((path, index) => (
              <path key={`light-${index}`} d={path} />
            ))}
          </g>
        </g>
        <DetailPatches layers={frame.detailLayers} clipId={rightBrowDetailClip} />
      </g>

      <g>
        <path
          className="expression-patterns__rig-eye"
          d={frame.paths.leftEye}
          fill={frame.style.eyeFill}
          stroke={frame.style.eyeStroke}
        />
        <path
          className="expression-patterns__upper-lid"
          d={segmentPath(frame.points.leftEye, 0, 18)}
          stroke={frame.style.upperLidStroke}
          strokeWidth={frame.style.upperLidStrokeWidth}
          opacity={frame.style.upperLidOpacity}
        />
        <path
          className="expression-patterns__lower-lid"
          d={lowerSegmentPath(frame.points.leftEye)}
          stroke={frame.style.lowerLidStroke}
          strokeWidth={frame.style.lowerLidStrokeWidth}
          opacity={frame.style.lowerLidOpacity}
        />
        <path
          className="expression-patterns__eye-baseline"
          d={eyeBaselinePath(
            frame.bounds.leftEye,
            frame.style.eyeBaselineExtend,
            frame.style.eyeBaselineTilt,
          )}
          stroke={frame.style.lowerLidStroke}
          strokeWidth={frame.style.lowerLidStrokeWidth}
          opacity={frame.style.eyeBaselineOpacity}
        />
        <g clipPath={`url(#${leftEyeClip})`}>
          <g
            className="expression-patterns__eye-hatch"
            stroke={frame.style.eyeWarmStroke}
            opacity={frame.style.eyeHatchOpacity * 0.5}
          >
            {leftEyeWarm.map((path, index) => (
              <path key={`warm-${index}`} d={path} />
            ))}
          </g>
          <g
            className="expression-patterns__eye-hatch"
            stroke={frame.style.eyeLightStroke}
            opacity={frame.style.eyeHatchOpacity}
          >
            {leftEyeLight.map((path, index) => (
              <path key={`light-${index}`} d={path} />
            ))}
          </g>
        </g>
        <circle
          className="expression-patterns__pupil"
          cx={frame.pupilLeft[0]}
          cy={frame.pupilLeft[1]}
          r={frame.style.pupilRadius}
          fill={frame.style.pupilFill}
          opacity={frame.style.pupilOpacity}
        />
        <ellipse
          className="expression-patterns__highlight"
          cx={frame.highlightLeft[0]}
          cy={frame.highlightLeft[1]}
          rx={frame.style.highlightLeftRx}
          ry={frame.style.highlightLeftRy}
          fill={frame.style.highlightFill}
          stroke={frame.style.highlightStroke}
          opacity={frame.style.highlightOpacity}
          transform={`rotate(${frame.style.highlightLeftRotate} ${frame.highlightLeft[0]} ${frame.highlightLeft[1]})`}
        />
        <DetailPatches layers={frame.detailLayers} clipId={leftEyeDetailClip} />
      </g>

      <g>
        <path
          className="expression-patterns__rig-eye"
          d={frame.paths.rightEye}
          fill={frame.style.eyeFill}
          stroke={frame.style.eyeStroke}
        />
        <path
          className="expression-patterns__upper-lid"
          d={segmentPath(frame.points.rightEye, 0, 18)}
          stroke={frame.style.upperLidStroke}
          strokeWidth={frame.style.upperLidStrokeWidth}
          opacity={frame.style.upperLidOpacity}
        />
        <path
          className="expression-patterns__lower-lid"
          d={lowerSegmentPath(frame.points.rightEye)}
          stroke={frame.style.lowerLidStroke}
          strokeWidth={frame.style.lowerLidStrokeWidth}
          opacity={frame.style.lowerLidOpacity}
        />
        <path
          className="expression-patterns__eye-baseline"
          d={eyeBaselinePath(
            frame.bounds.rightEye,
            frame.style.eyeBaselineExtend,
            frame.style.eyeBaselineTilt,
          )}
          stroke={frame.style.lowerLidStroke}
          strokeWidth={frame.style.lowerLidStrokeWidth}
          opacity={frame.style.eyeBaselineOpacity}
        />
        <g clipPath={`url(#${rightEyeClip})`}>
          <g
            className="expression-patterns__eye-hatch"
            stroke={frame.style.eyeWarmStroke}
            opacity={frame.style.eyeHatchOpacity * 0.5}
          >
            {rightEyeWarm.map((path, index) => (
              <path key={`warm-${index}`} d={path} />
            ))}
          </g>
          <g
            className="expression-patterns__eye-hatch"
            stroke={frame.style.eyeLightStroke}
            opacity={frame.style.eyeHatchOpacity}
          >
            {rightEyeLight.map((path, index) => (
              <path key={`light-${index}`} d={path} />
            ))}
          </g>
        </g>
        <circle
          className="expression-patterns__pupil"
          cx={frame.pupilRight[0]}
          cy={frame.pupilRight[1]}
          r={frame.style.pupilRadius}
          fill={frame.style.pupilFill}
          opacity={frame.style.pupilOpacity}
        />
        <ellipse
          className="expression-patterns__highlight"
          cx={frame.highlightRight[0]}
          cy={frame.highlightRight[1]}
          rx={frame.style.highlightRightRx}
          ry={frame.style.highlightRightRy}
          fill={frame.style.highlightFill}
          stroke={frame.style.highlightStroke}
          opacity={frame.style.highlightOpacity}
          transform={`rotate(${frame.style.highlightRightRotate} ${frame.highlightRight[0]} ${frame.highlightRight[1]})`}
        />
        <DetailPatches layers={frame.detailLayers} clipId={rightEyeDetailClip} />
      </g>

      <g>
        <ellipse
          className="expression-patterns__mouth-cap"
          cx={frame.mouthCap.cx}
          cy={frame.mouthCap.cy}
          rx={frame.mouthCap.rx}
          ry={frame.mouthCap.ry}
          fill={frame.style.mouthCapFill}
          opacity={frame.style.mouthCapOpacity}
        />
        <path
          className="expression-patterns__rig-mouth"
          d={frame.paths.mouth}
          fill={frame.style.mouthFill}
          stroke={frame.style.mouthStroke}
        />
        <ellipse
          className="expression-patterns__tongue"
          cx={frame.tongue.cx}
          cy={frame.tongue.cy}
          rx={frame.tongue.rx}
          ry={frame.tongue.ry}
          clipPath={`url(#${mouthClip})`}
          fill={frame.style.tongueFill}
          opacity={frame.style.tongueOpacity}
        />
        <DetailPatches layers={frame.detailLayers} clipId={mouthDetailClip} />
      </g>
    </svg>
  )
}

export function SvgExpressionPatterns() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedPattern = patterns[selectedIndex]
  const frame = createStaticRigFrame(selectedIndex)

  const selectPattern = (nextIndex: number, focus = false) => {
    if (nextIndex === selectedIndex) {
      if (focus) buttonRefs.current[nextIndex]?.focus()
      return
    }

    setSelectedIndex(nextIndex)
    if (focus) {
      buttonRefs.current[nextIndex]?.focus()
    }
  }

  const selectRelativePattern = (offset: number, focus = false) => {
    const nextIndex =
      (selectedIndex + offset + patterns.length) % patterns.length
    selectPattern(nextIndex, focus)
  }

  return (
    <section className="expression-patterns" aria-labelledby="expression-patterns-title">
      <header className="expression-patterns__header">
        <div>
          <p className="expression-patterns__eyebrow">SVG path study</p>
          <h1 id="expression-patterns-title">SVG Expression Patterns</h1>
          <p className="expression-patterns__intro">
            Six hand-drawn expression states rendered as static SVG poses for direct, animation-free switching.
          </p>
        </div>

        <div className="expression-patterns__status" aria-live="polite" aria-atomic="true">
          <span>{selectedPattern.label}</span>
          <span>static</span>
        </div>
      </header>

      <div className="expression-patterns__workspace">
        <div className="expression-patterns__preview">
          <div className="expression-patterns__artwork">
            <ExpressionRig frame={frame} label={selectedPattern.label} />
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
                    draggable={false}
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
