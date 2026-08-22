import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

const BAND_COUNT = 13
const EMPTY_LEVELS = Array.from({ length: BAND_COUNT }, () => 0.12)

export function useVinylDeckMeter(
  analyserRef: RefObject<AnalyserNode | null>,
  playing: boolean,
  hasSource: boolean,
) {
  const [levels, setLevels] = useState(EMPTY_LEVELS)

  useEffect(() => {
    let frame = 0
    let previousUpdate = 0
    let frequencyData: Uint8Array<ArrayBuffer> | undefined

    const update = (time: number) => {
      if (time - previousUpdate >= 50) {
        previousUpdate = time
        const analyser = analyserRef.current
        if (playing && hasSource && analyser) {
          frequencyData ??= new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
          analyser.getByteFrequencyData(frequencyData)
          const next = Array.from({ length: BAND_COUNT }, (_, band) => {
            const start = Math.floor(((band / BAND_COUNT) ** 1.7) * frequencyData!.length * 0.62)
            const end = Math.max(start + 1, Math.floor((((band + 1) / BAND_COUNT) ** 1.7) * frequencyData!.length * 0.62))
            let peak = 0
            for (let index = start; index < end; index += 1) peak = Math.max(peak, frequencyData![index])
            return Math.max(0.08, peak / 255)
          })
          setLevels(next)
        } else if (playing) {
          setLevels(Array.from({ length: BAND_COUNT }, (_, band) => {
            const pulse = Math.sin(time * 0.004 + band * 1.37) * 0.18
            const carrier = Math.sin(time * 0.0017 + band * 0.63) * 0.12
            return Math.max(0.12, Math.min(0.72, 0.34 + pulse + carrier))
          }))
        } else {
          setLevels(EMPTY_LEVELS)
        }
      }
      frame = window.requestAnimationFrame(update)
    }

    frame = window.requestAnimationFrame(update)
    return () => window.cancelAnimationFrame(frame)
  }, [analyserRef, hasSource, playing])

  return levels
}
