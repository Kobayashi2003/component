import { useEffect, useLayoutEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'

export interface AnalogVideoEffectProps {
  children: ReactNode
  className?: string
  noise?: number
  tearing?: number
  smear?: number
  scanlines?: number
  colorShift?: number
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const randomBetween = (minimum: number, maximum: number) => minimum + Math.random() * (maximum - minimum)

export function AnalogVideoEffect({
  children,
  className = '',
  noise = 0.15,
  tearing = 0.7,
  smear = 0.6,
  scanlines = 0.25,
  colorShift = 0.4,
}: AnalogVideoEffectProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trackingRef = useRef<HTMLDivElement>(null)
  const tearRefs = useRef<Array<HTMLDivElement | null>>([])
  const ghostRefs = useRef<Array<HTMLDivElement | null>>([])
  const artifactRefs = useRef<Array<HTMLSpanElement | null>>([])
  const faultIntensityRef = useRef(0)

  const safeNoise = clamp(noise)
  const safeTearing = clamp(tearing)
  const safeSmear = clamp(smear)
  const safeScanlines = clamp(scanlines)
  const safeColorShift = clamp(colorShift)

  useLayoutEffect(() => {
    const source = contentRef.current
    if (!source) return
    const layers = [...tearRefs.current, ...ghostRefs.current].filter(
      (layer): layer is HTMLDivElement => Boolean(layer),
    )

    const synchronizeLayers = () => {
      layers.forEach((layer) => {
        layer.inert = true
        layer.replaceChildren(...Array.from(source.childNodes, (node) => node.cloneNode(true)))
      })
    }

    synchronizeLayers()
    const observer = new MutationObserver(synchronizeLayers)
    observer.observe(source, { childList: true, subtree: true, characterData: true, attributes: true })
    return () => observer.disconnect()
  }, [children])

  useEffect(() => {
    const root = rootRef.current
    const tracking = trackingRef.current
    if (!root || !tracking) return

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = motionQuery.matches
    let animationFrame = 0
    let faultStartedAt = 0
    let activeUntil = 0
    let nextSliceChange = 0
    let nextFault = performance.now() + randomBetween(600, 1800)
    let faultLevel = 0
    let trackingOrigin = 0

    const hideFaultLayers = () => {
      faultIntensityRef.current = 0
      root.dataset.fault = 'stable'
      tearRefs.current.forEach((layer) => {
        if (layer) layer.style.opacity = '0'
      })
      ghostRefs.current.forEach((layer) => {
        if (layer) layer.style.opacity = '0'
      })
      artifactRefs.current.forEach((artifact) => {
        if (artifact) artifact.style.opacity = '0'
      })
      tracking.style.opacity = '0'
    }

    const configureSlices = () => {
      const displacement = safeTearing * (faultLevel < 0.6 ? 18 : 62)
      tearRefs.current.forEach((layer, index) => {
        if (!layer) return
        const height = randomBetween(0.6, faultLevel > 0.6 ? 7 : 3.2)
        const top = randomBetween(2, 98 - height)
        const direction = Math.random() > 0.5 ? 1 : -1
        const offset = direction * randomBetween(3, Math.max(4, displacement))
        layer.style.clipPath = `inset(${top}% 0 ${100 - top - height}% 0)`
        layer.style.transform = `translate3d(${offset}px, 0, 0) scaleX(${1 + faultLevel * 0.012})`
        layer.style.filter = index === 0 && faultLevel > 0.65 ? 'brightness(1.35) contrast(1.1)' : 'none'
        layer.style.opacity = `${0.55 + faultLevel * 0.35}`
      })

      const ghostOffset = safeColorShift * randomBetween(2, faultLevel > 0.6 ? 10 : 5)
      ghostRefs.current.forEach((layer, index) => {
        if (!layer) return
        const top = randomBetween(4, 90)
        const height = randomBetween(1, faultLevel > 0.6 ? 12 : 5)
        layer.style.clipPath = `inset(${top}% 0 ${Math.max(0, 100 - top - height)}% 0)`
        layer.style.transform = `translate3d(${index === 0 ? -ghostOffset : ghostOffset}px, 0, 0)`
        layer.style.opacity = `${safeColorShift * faultLevel * 0.42}`
      })

      artifactRefs.current.forEach((artifact, index) => {
        if (!artifact) return
        const visible = faultLevel > 0.55 && Math.random() > 0.35 + index * 0.12
        artifact.style.left = `${randomBetween(4, 92)}%`
        artifact.style.top = `${randomBetween(5, 92)}%`
        artifact.style.width = `${randomBetween(6, 22)}px`
        artifact.style.transform = `translateX(${randomBetween(-18, 18)}px)`
        artifact.style.opacity = visible ? `${randomBetween(0.25, 0.7)}` : '0'
      })
    }

    const beginFault = (now: number) => {
      const roll = Math.random()
      faultLevel = reducedMotion ? 0.25 : roll < 0.58 ? 0.32 : roll < 0.86 ? 0.68 : 1
      const duration = reducedMotion
        ? randomBetween(70, 120)
        : faultLevel < 0.5
          ? randomBetween(75, 190)
          : faultLevel < 0.9
            ? randomBetween(230, 520)
            : randomBetween(150, 380)
      activeUntil = now + duration
      faultStartedAt = now
      nextSliceChange = 0
      trackingOrigin = randomBetween(5, 84)
      faultIntensityRef.current = faultLevel * safeTearing
      root.dataset.fault = faultLevel > 0.85 ? 'severe' : faultLevel > 0.5 ? 'tracking' : 'tear'
    }

    const tick = (now: number) => {
      if (document.hidden) {
        hideFaultLayers()
        nextFault = now + 1000
        animationFrame = requestAnimationFrame(tick)
        return
      }

      if (now >= nextFault && now >= activeUntil && safeTearing > 0) beginFault(now)

      if (now < activeUntil) {
        const progress = (now - faultStartedAt) / Math.max(1, activeUntil - faultStartedAt)
        faultIntensityRef.current = faultLevel * safeTearing
        if (now >= nextSliceChange) {
          configureSlices()
          nextSliceChange = now + randomBetween(28, faultLevel > 0.65 ? 68 : 105)
        }

        if (faultLevel > 0.5) {
          tracking.style.top = `${Math.min(93, trackingOrigin + Math.max(0, progress) * 12)}%`
          tracking.style.height = `${randomBetween(3, faultLevel > 0.85 ? 12 : 7)}%`
          tracking.style.transform = `translate3d(${randomBetween(-26, 26) * safeTearing}px, 0, 0) scaleX(${1 + safeSmear * 0.035})`
          tracking.style.opacity = `${0.12 + faultLevel * 0.22}`
        }
      } else if (faultIntensityRef.current > 0) {
        hideFaultLayers()
        const quietTime = reducedMotion
          ? randomBetween(5500, 9000)
          : randomBetween(650, 2800) / Math.max(0.35, safeTearing)
        nextFault = now + quietTime
      }

      animationFrame = requestAnimationFrame(tick)
    }

    const handleMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches
      hideFaultLayers()
      nextFault = performance.now() + (reducedMotion ? 6000 : 1000)
    }

    motionQuery.addEventListener('change', handleMotionChange)
    animationFrame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(animationFrame)
      motionQuery.removeEventListener('change', handleMotionChange)
      hideFaultLayers()
    }
  }, [safeColorShift, safeSmear, safeTearing])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) return

    const noiseCanvas = document.createElement('canvas')
    const noiseContext = noiseCanvas.getContext('2d', { alpha: true })
    const smearCanvas = document.createElement('canvas')
    const smearContext = smearCanvas.getContext('2d', { alpha: true })
    if (!noiseContext || !smearContext) return

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = motionQuery.matches
    let width = 1
    let height = 1
    let pixelRatio = 1
    let noiseImage = noiseContext.createImageData(1, 1)
    let animationFrame = 0
    let lastFrame = 0

    const resize = () => {
      const bounds = root.getBoundingClientRect()
      width = Math.max(1, Math.round(bounds.width))
      height = Math.max(1, Math.round(bounds.height))
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(width * pixelRatio)
      canvas.height = Math.round(height * pixelRatio)
      smearCanvas.width = canvas.width
      smearCanvas.height = canvas.height
      const noiseScale = 0.28 + safeNoise * 0.16
      noiseCanvas.width = Math.max(1, Math.round(width * noiseScale))
      noiseCanvas.height = Math.max(1, Math.round(height * noiseScale))
      noiseImage = noiseContext.createImageData(noiseCanvas.width, noiseCanvas.height)
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      smearContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    }

    const drawNoise = () => {
      const data = noiseImage.data
      for (let offset = 0; offset < data.length; offset += 4) {
        const grain = Math.random() * 255
        data[offset] = grain * 0.16
        data[offset + 1] = grain * 0.46 + 8
        data[offset + 2] = grain * 0.38 + 5
        data[offset + 3] = 25 + Math.random() * 42
      }
      noiseContext.putImageData(noiseImage, 0, 0)
      context.globalAlpha = safeNoise * 0.62
      context.imageSmoothingEnabled = false
      context.drawImage(noiseCanvas, 0, 0, width, height)
      context.globalAlpha = 1
    }

    const drawSignalLines = (intensity: number) => {
      const lineCount = 5 + Math.floor(safeNoise * 12)
      for (let index = 0; index < lineCount; index += 1) {
        const y = Math.random() * height
        const alpha = randomBetween(0.015, 0.055) + intensity * 0.025
        context.fillStyle = `rgba(163, 255, 196, ${alpha})`
        context.fillRect(0, y, width, Math.random() > 0.9 ? 1.2 : 0.45)
      }
      if (intensity > 0.55 && Math.random() < 0.38) {
        context.fillStyle = `rgba(232, 255, 50, ${0.12 + intensity * 0.16})`
        context.fillRect(randomBetween(0, width * 0.18), randomBetween(0, height), randomBetween(width * 0.45, width), randomBetween(0.6, 1.8))
      }
    }

    const drawSmear = (intensity: number) => {
      if (intensity < 0.12 || safeSmear === 0) return
      smearContext.clearRect(0, 0, width, height)
      const slices = 1 + Math.floor(intensity * 4)

      for (let index = 0; index < slices; index += 1) {
        const y = randomBetween(4, height - 6)
        const sliceHeight = randomBetween(1, intensity > 0.7 ? 8 : 4)
        const origin = randomBetween(0, width * 0.72)
        const lemon = Math.random() > 0.38
        smearContext.fillStyle = lemon
          ? `rgba(232, 255, 50, ${0.3 + intensity * 0.35})`
          : `rgba(74, 226, 205, ${0.2 + intensity * 0.28})`
        smearContext.fillRect(origin, y, randomBetween(8, 58), sliceHeight)

        const direction = Math.random() > 0.28 ? 1 : -1
        const repeats = 4 + Math.floor(safeSmear * 6)
        for (let copy = 0; copy < repeats; copy += 1) {
          const distance = direction * copy * randomBetween(7, 17) * (0.5 + intensity)
          context.globalAlpha = (1 - copy / repeats) * safeSmear * 0.5
          context.drawImage(
            smearCanvas,
            0,
            y * pixelRatio,
            smearCanvas.width,
            sliceHeight * pixelRatio,
            distance,
            y,
            width,
            sliceHeight,
          )
        }
      }
      context.globalAlpha = 1
    }

    const render = (now: number) => {
      const frameInterval = reducedMotion ? 125 : 1000 / 30
      if (!document.hidden && now - lastFrame >= frameInterval) {
        lastFrame = now
        context.clearRect(0, 0, width, height)
        drawNoise()
        const intensity = faultIntensityRef.current
        drawSignalLines(intensity)
        drawSmear(intensity)
      }
      animationFrame = requestAnimationFrame(render)
    }

    const handleMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches
    }
    const observer = new ResizeObserver(resize)
    observer.observe(root)
    motionQuery.addEventListener('change', handleMotionChange)
    resize()
    animationFrame = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(animationFrame)
      observer.disconnect()
      motionQuery.removeEventListener('change', handleMotionChange)
    }
  }, [safeNoise, safeSmear])

  const rootStyle = {
    '--vhs-scanline-opacity': safeScanlines * 0.32,
  } as CSSProperties

  return (
    <div ref={rootRef} className={`vhs-effect ${className}`.trim()} style={rootStyle} data-fault="stable">
      <div ref={contentRef} className="vhs-effect__content">{children}</div>
      {[0, 1, 2].map((index) => (
        <div
          key={`tear-${index}`}
          ref={(node) => { tearRefs.current[index] = node }}
          className="vhs-effect__clone vhs-effect__tear"
          aria-hidden="true"
        />
      ))}
      {[0, 1].map((index) => (
        <div
          key={`ghost-${index}`}
          ref={(node) => { ghostRefs.current[index] = node }}
          className={`vhs-effect__clone vhs-effect__ghost vhs-effect__ghost--${index === 0 ? 'cyan' : 'lemon'}`}
          aria-hidden="true"
        />
      ))}
      <canvas ref={canvasRef} className="vhs-effect__canvas" aria-hidden="true" />
      <div ref={trackingRef} className="vhs-effect__tracking" aria-hidden="true" />
      <div className="vhs-effect__artifacts" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <span key={index} ref={(node) => { artifactRefs.current[index] = node }} />
        ))}
      </div>
      <div className="vhs-effect__scanlines" aria-hidden="true" />
      <div className="vhs-effect__vignette" aria-hidden="true" />
    </div>
  )
}
