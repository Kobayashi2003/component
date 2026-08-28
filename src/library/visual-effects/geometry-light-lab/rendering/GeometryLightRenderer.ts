import { MAX_LIGHTS, hexToRgb, type LightSource, type ShaderSettings } from '../model'
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders'

type UniformMap = Record<string, WebGLUniformLocation | null>

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Unable to create WebGL shader.')

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Shader compilation failed.'
    gl.deleteShader(shader)
    throw new Error(message)
  }

  return shader
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()

  if (!program) throw new Error('Unable to create WebGL program.')

  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Program link failed.'
    gl.deleteProgram(program)
    throw new Error(message)
  }

  return program
}

function getUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): UniformMap {
  return {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    geometry: gl.getUniformLocation(program, 'u_geometry'),
    renderMode: gl.getUniformLocation(program, 'u_renderMode'),
    lightCount: gl.getUniformLocation(program, 'u_lightCount'),
    scale: gl.getUniformLocation(program, 'u_scale'),
    orientation: gl.getUniformLocation(program, 'u_orientation'),
    lightPositions: gl.getUniformLocation(program, 'u_lightPositions[0]'),
    lightColors: gl.getUniformLocation(program, 'u_lightColors[0]'),
    lightIntensities: gl.getUniformLocation(program, 'u_lightIntensities[0]'),
    lightRadii: gl.getUniformLocation(program, 'u_lightRadii[0]'),
    roughness: gl.getUniformLocation(program, 'u_roughness'),
    metallic: gl.getUniformLocation(program, 'u_metallic'),
    ambient: gl.getUniformLocation(program, 'u_ambient'),
    exposure: gl.getUniformLocation(program, 'u_exposure'),
  }
}

export class GeometryLightRenderer {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly uniforms: UniformMap
  private readonly vertexBuffer: WebGLBuffer
  private readonly vertexArray: WebGLVertexArrayObject
  private readonly resizeObserver: ResizeObserver
  private settings: ShaderSettings
  private lights: LightSource[] = []
  private disposed = false
  private frameRequest = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    initialSettings: ShaderSettings,
    initialLights: LightSource[],
  ) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    })
    if (!gl) throw new Error('WebGL2 is not available in this browser.')

    const vertexBuffer = gl.createBuffer()
    const vertexArray = gl.createVertexArray()
    if (!vertexBuffer || !vertexArray) throw new Error('Unable to allocate WebGL geometry.')

    this.gl = gl
    this.program = createProgram(gl)
    this.uniforms = getUniforms(gl, this.program)
    this.settings = { ...initialSettings }
    this.lights = initialLights.map((light) => ({ ...light, position: { ...light.position } }))
    this.vertexBuffer = vertexBuffer
    this.vertexArray = vertexArray

    gl.bindVertexArray(vertexArray)
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    )

    const positionLocation = gl.getAttribLocation(this.program, 'a_position')
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    this.resizeObserver = new ResizeObserver(() => {
      this.resize()
      this.requestRender()
    })
    this.resizeObserver.observe(canvas)
    this.resize()
    this.requestRender()
  }

  setLights(lights: LightSource[]) {
    this.lights = lights.slice(0, MAX_LIGHTS).map((light) => ({
      ...light,
      position: { ...light.position },
    }))
    this.requestRender()
  }

  setSettings(settings: ShaderSettings) {
    this.settings = { ...settings }
    this.requestRender()
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.round(rect.width * dpr))
    const height = Math.max(1, Math.round(rect.height * dpr))

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
    }

    this.gl.viewport(0, 0, width, height)
  }

  private requestRender() {
    if (this.disposed || this.frameRequest) return
    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = 0
      this.render()
    })
  }

  private render() {
    if (this.disposed) return

    const gl = this.gl
    const uniforms = this.uniforms
    const activeLights = this.lights.slice(0, MAX_LIGHTS)
    const positions = new Float32Array(MAX_LIGHTS * 2)
    const colors = new Float32Array(MAX_LIGHTS * 3)
    const intensities = new Float32Array(MAX_LIGHTS)
    const radii = new Float32Array(MAX_LIGHTS)

    activeLights.forEach((light, index) => {
      positions[index * 2] = light.position.x
      positions[index * 2 + 1] = 1 - light.position.y
      colors.set(hexToRgb(light.color), index * 3)
      intensities[index] = light.intensity / 100
      radii[index] = light.radius / 100
    })

    gl.useProgram(this.program)
    gl.bindVertexArray(this.vertexArray)
    gl.uniform2f(uniforms.resolution, this.canvas.width, this.canvas.height)
    gl.uniform1i(uniforms.geometry, this.settings.geometry)
    gl.uniform1i(uniforms.renderMode, this.settings.renderMode)
    gl.uniform1i(uniforms.lightCount, activeLights.length)
    gl.uniform1f(uniforms.scale, this.settings.scale)
    gl.uniform4f(uniforms.orientation, ...this.settings.orientation)
    gl.uniform2fv(uniforms.lightPositions, positions)
    gl.uniform3fv(uniforms.lightColors, colors)
    gl.uniform1fv(uniforms.lightIntensities, intensities)
    gl.uniform1fv(uniforms.lightRadii, radii)
    gl.uniform1f(uniforms.roughness, this.settings.roughness)
    gl.uniform1f(uniforms.metallic, this.settings.metallic)
    gl.uniform1f(uniforms.ambient, this.settings.ambient)
    gl.uniform1f(uniforms.exposure, this.settings.exposure)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  destroy() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.frameRequest)
    this.resizeObserver.disconnect()
    this.gl.deleteBuffer(this.vertexBuffer)
    this.gl.deleteVertexArray(this.vertexArray)
    this.gl.deleteProgram(this.program)
  }
}
