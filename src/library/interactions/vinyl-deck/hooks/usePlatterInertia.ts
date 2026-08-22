import { useEffect, useRef } from 'react'

export function usePlatterInertia(playing: boolean) {
  const rotorRef = useRef<SVGGElement>(null)
  const stateRef = useRef({ angle: 0, velocity: 0, previousTime: 0 })

  useEffect(() => {
    const rotor = rotorRef.current
    if (!rotor || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    const animate = (time: number) => {
      const state = stateRef.current
      const delta = Math.min((time - (state.previousTime || time)) / 1000, 0.05)
      state.previousTime = time

      const targetVelocity = playing ? 20 : 0
      const response = playing ? 1 - Math.exp(-delta * 2.8) : 1 - Math.exp(-delta * 1.9)
      state.velocity += (targetVelocity - state.velocity) * response
      state.angle = (state.angle + state.velocity * delta) % 360
      rotor.style.transform = `rotate(${state.angle}deg)`

      if (playing || Math.abs(state.velocity) > 0.025) {
        frame = window.requestAnimationFrame(animate)
      } else {
        state.velocity = 0
        state.previousTime = 0
      }
    }

    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [playing])

  return rotorRef
}
