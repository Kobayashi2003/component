import type { LightPosition, ShaderSettings } from './model'
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders'

export type TextureUrls = {
  base: string
  normal: string
  specular: string
}

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

  if (!program) {
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    throw new Error('Unable to create WebGL program.')
  }

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

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load texture: ${url}`))
    image.src = url
  })
}

function createTexture(gl: WebGL2RenderingContext, image: HTMLImageElement, unit: number) {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Unable to create WebGL texture.')

  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)

  return texture
}

function getUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): UniformMap {
  return {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    bluePos: gl.getUniformLocation(program, 'u_bluePos'),
    purplePos: gl.getUniformLocation(program, 'u_purplePos'),
    blueIntensity: gl.getUniformLocation(program, 'u_blueIntensity'),
    blueRadius: gl.getUniformLocation(program, 'u_blueRadius'),
    purpleIntensity: gl.getUniformLocation(program, 'u_purpleIntensity'),
    purpleRadius: gl.getUniformLocation(program, 'u_purpleRadius'),
    normalStrength: gl.getUniformLocation(program, 'u_normalStrength'),
    specularStrength: gl.getUniformLocation(program, 'u_specularStrength'),
    fresnelStrength: gl.getUniformLocation(program, 'u_fresnelStrength'),
    shininess: gl.getUniformLocation(program, 'u_shininess'),
    transmission: gl.getUniformLocation(program, 'u_transmission'),
    exposure: gl.getUniformLocation(program, 'u_exposure'),
    renderMode: gl.getUniformLocation(program, 'u_renderMode'),
  }
}

export class GlassFlowerWebGLRenderer {
  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly uniforms: UniformMap
  private readonly vertexBuffer: WebGLBuffer
  private readonly vertexArray: WebGLVertexArrayObject
  private readonly resizeObserver: ResizeObserver
  private textures: WebGLTexture[] = []
  private blue: LightPosition = { x: 0.26, y: 0.3 }
  private purple: LightPosition = { x: 0.77, y: 0.28 }
  private settings: ShaderSettings
  private ready = false
  private disposed = false
  private frameRequest = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    initialSettings: ShaderSettings,
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
    if (!vertexBuffer || !vertexArray) {
      if (vertexBuffer) gl.deleteBuffer(vertexBuffer)
      if (vertexArray) gl.deleteVertexArray(vertexArray)
      throw new Error('Unable to allocate WebGL geometry.')
    }

    this.gl = gl
    this.program = createProgram(gl)
    this.uniforms = getUniforms(gl, this.program)
    this.settings = { ...initialSettings }
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

    gl.useProgram(this.program)
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_base'), 0)
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_normal'), 1)
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_specular'), 2)

    this.resizeObserver = new ResizeObserver(() => {
      this.resize()
      this.requestRender()
    })
    this.resizeObserver.observe(canvas)
    this.resize()
  }

  async loadTextures(urls: TextureUrls) {
    const images = await Promise.all([
      loadImage(urls.base),
      loadImage(urls.normal),
      loadImage(urls.specular),
    ])

    if (this.disposed) return

    const textures = images.map((image, unit) => createTexture(this.gl, image, unit))
    this.textures.forEach((texture) => this.gl.deleteTexture(texture))
    this.textures = textures
    this.ready = true
    this.requestRender()
  }

  setLights(blue: LightPosition, purple: LightPosition) {
    this.blue = { ...blue }
    this.purple = { ...purple }
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
    if (!this.ready || this.disposed || this.frameRequest) return

    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = 0
      this.render()
    })
  }

  private render() {
    if (!this.ready || this.disposed) return

    const gl = this.gl
    const settings = this.settings
    const uniforms = this.uniforms

    gl.useProgram(this.program)
    gl.bindVertexArray(this.vertexArray)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.uniform2f(uniforms.resolution, this.canvas.width, this.canvas.height)
    gl.uniform2f(uniforms.bluePos, this.blue.x, 1 - this.blue.y)
    gl.uniform2f(uniforms.purplePos, this.purple.x, 1 - this.purple.y)
    gl.uniform1f(uniforms.blueIntensity, settings.blueIntensity)
    gl.uniform1f(uniforms.blueRadius, settings.blueRadius)
    gl.uniform1f(uniforms.purpleIntensity, settings.purpleIntensity)
    gl.uniform1f(uniforms.purpleRadius, settings.purpleRadius)
    gl.uniform1f(uniforms.normalStrength, settings.normalStrength)
    gl.uniform1f(uniforms.specularStrength, settings.specular)
    gl.uniform1f(uniforms.fresnelStrength, settings.fresnel)
    gl.uniform1f(uniforms.shininess, settings.shininess)
    gl.uniform1f(uniforms.transmission, settings.transmission)
    gl.uniform1f(uniforms.exposure, settings.exposure)
    gl.uniform1i(uniforms.renderMode, settings.renderMode)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  destroy() {
    if (this.disposed) return

    this.disposed = true
    cancelAnimationFrame(this.frameRequest)
    this.resizeObserver.disconnect()
    this.textures.forEach((texture) => this.gl.deleteTexture(texture))
    this.gl.deleteBuffer(this.vertexBuffer)
    this.gl.deleteVertexArray(this.vertexArray)
    this.gl.deleteProgram(this.program)
  }
}
