import { useEffect, useRef } from 'react'
import type { PointerEvent, ReactNode } from 'react'
import './styles.css'

export interface CursorDistortionSource {
  context: CanvasRenderingContext2D
  width: number
  height: number
  pixelRatio: number
}

export interface CursorDistortionProps {
  drawSource: (source: CursorDistortionSource) => void
  children?: ReactNode
  className?: string
  radius?: number
  magnification?: number
  distortion?: number
  chromaticAberration?: number
  smoothing?: number
}

const vertexShader = `
  attribute vec2 aPosition;
  attribute vec2 aUv;
  varying vec2 vUv;
  void main() {
    vUv = aUv;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`

const fragmentShader = `
  precision highp float;
  uniform sampler2D uTexture;
  uniform vec2 uPointer;
  uniform float uAspect;
  uniform float uRadius;
  uniform float uMagnification;
  uniform float uDistortion;
  uniform float uAberration;
  uniform float uActive;
  varying vec2 vUv;

  void main() {
    vec2 delta = vUv - uPointer;
    vec2 metric = vec2(delta.x * uAspect, delta.y);
    float distanceToPointer = length(metric);
    float lens = smoothstep(uRadius, uRadius * 0.66, distanceToPointer) * uActive;
    float normalizedDistance = clamp(distanceToPointer / max(uRadius, 0.0001), 0.0, 1.0);
    vec2 direction = normalize(metric + vec2(0.00001));
    direction.x /= uAspect;

    vec2 magnifiedUv = vUv - delta * uMagnification * lens * (1.0 - normalizedDistance * 0.42);
    float ripple = sin((metric.x + metric.y) * 82.0 + normalizedDistance * 13.0);
    vec2 warpedUv = magnifiedUv + direction * ripple * uDistortion * lens * (1.0 - normalizedDistance);
    vec2 split = direction * uAberration * lens * (0.35 + normalizedDistance);

    float red = texture2D(uTexture, clamp(warpedUv + split, 0.0, 1.0)).r;
    float green = texture2D(uTexture, clamp(warpedUv, 0.0, 1.0)).g;
    float blue = texture2D(uTexture, clamp(warpedUv - split, 0.0, 1.0)).b;
    float alpha = texture2D(uTexture, clamp(warpedUv, 0.0, 1.0)).a;
    vec4 refracted = vec4(red, green, blue, alpha);
    vec4 original = texture2D(uTexture, vUv);
    float rim = smoothstep(0.035, 0.0, abs(distanceToPointer - uRadius)) * uActive;
    gl_FragColor = mix(original, refracted, lens) + vec4(vec3(rim * 0.12), 0.0);
  }
`

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexShader)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader)
  if (!vertex || !fragment) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

export function CursorDistortion({
  drawSource,
  children,
  className = '',
  radius = 125,
  magnification = 0.2,
  distortion = 0.016,
  chromaticAberration = 0.007,
  smoothing = 0.2,
}: CursorDistortionProps) {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const pointer = useRef({
    x: 0.5,
    y: 0.5,
    targetX: 0.5,
    targetY: 0.5,
    active: 0,
    targetActive: 0,
  })
  const renderFrame = useRef<(() => void) | null>(null)
  const animationFrame = useRef<number | null>(null)

  useEffect(() => {
    const surface = canvas.current
    const container = root.current
    if (!surface || !container) return
    const gl = surface.getContext('webgl', { alpha: true, antialias: true })
    const program = gl && createProgram(gl)
    if (!gl || !program) {
      container.dataset.webgl = 'unsupported'
      return
    }

    container.dataset.webgl = 'ready'
    const sourceCanvas = document.createElement('canvas')
    const sourceContext = sourceCanvas.getContext('2d')
    const texture = gl.createTexture()
    const buffer = gl.createBuffer()
    if (!sourceContext || !texture || !buffer) return

    const vertices = new Float32Array([
      -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, -1, 1, 0, 1, 1, -1, 1, 0, 1, 1, 1,
      1,
    ])
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'aPosition')
    const uv = gl.getAttribLocation(program, 'aUv')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(uv)
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.uniform1i(gl.getUniformLocation(program, 'uTexture'), 0)

    let width = 1
    let height = 1
    let reducedMotion = false
    const render = () => {
      const value = pointer.current
      const follow = reducedMotion ? 1 : Math.max(0.02, Math.min(1, smoothing))
      value.x += (value.targetX - value.x) * follow
      value.y += (value.targetY - value.y) * follow
      value.active +=
        (value.targetActive - value.active) * (reducedMotion ? 1 : 0.16)
      gl.viewport(0, 0, surface.width, surface.height)
      gl.uniform2f(gl.getUniformLocation(program, 'uPointer'), value.x, value.y)
      gl.uniform1f(gl.getUniformLocation(program, 'uAspect'), width / height)
      gl.uniform1f(
        gl.getUniformLocation(program, 'uRadius'),
        Math.max(48, radius) / height,
      )
      gl.uniform1f(
        gl.getUniformLocation(program, 'uMagnification'),
        Math.max(0, Math.min(0.45, magnification)),
      )
      gl.uniform1f(
        gl.getUniformLocation(program, 'uDistortion'),
        Math.max(0, Math.min(0.05, distortion)),
      )
      gl.uniform1f(
        gl.getUniformLocation(program, 'uAberration'),
        Math.max(0, Math.min(0.025, chromaticAberration)),
      )
      gl.uniform1f(gl.getUniformLocation(program, 'uActive'), value.active)
      gl.drawArrays(gl.TRIANGLES, 0, 6)

      const moving =
        Math.abs(value.x - value.targetX) +
          Math.abs(value.y - value.targetY) +
          Math.abs(value.active - value.targetActive) >
        0.001
      animationFrame.current = moving ? requestAnimationFrame(render) : null
    }
    renderFrame.current = render

    const resize = () => {
      const bounds = container.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      width = Math.max(1, bounds.width)
      height = Math.max(1, bounds.height)
      surface.width = Math.round(width * pixelRatio)
      surface.height = Math.round(height * pixelRatio)
      sourceCanvas.width = surface.width
      sourceCanvas.height = surface.height
      sourceContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
      drawSource({ context: sourceContext, width, height, pixelRatio })
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        sourceCanvas,
      )
      render()
    }

    reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const observer = new ResizeObserver(resize)
    observer.observe(container)
    resize()
    return () => {
      observer.disconnect()
      if (animationFrame.current !== null)
        cancelAnimationFrame(animationFrame.current)
      renderFrame.current = null
      gl.deleteTexture(texture)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }, [
    chromaticAberration,
    distortion,
    drawSource,
    magnification,
    radius,
    smoothing,
  ])

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    pointer.current.targetX = (event.clientX - bounds.left) / bounds.width
    pointer.current.targetY = 1 - (event.clientY - bounds.top) / bounds.height
    pointer.current.targetActive = 1
    event.currentTarget.classList.add('is-active')
    if (animationFrame.current === null && renderFrame.current)
      animationFrame.current = requestAnimationFrame(renderFrame.current)
  }

  return (
    <div
      ref={root}
      className={`cursor-distortion ${className}`.trim()}
      onPointerEnter={move}
      onPointerMove={move}
      onPointerLeave={() => {
        pointer.current.targetActive = 0
        root.current?.classList.remove('is-active')
        if (animationFrame.current === null && renderFrame.current)
          animationFrame.current = requestAnimationFrame(renderFrame.current)
      }}
    >
      <canvas
        ref={canvas}
        className="cursor-distortion__canvas"
        aria-hidden="true"
      />
      <div className="cursor-distortion__fallback">{children}</div>
      <div className="cursor-distortion__overlay">{children}</div>
    </div>
  )
}
