export type Orientation = readonly [number, number, number, number]

function multiply(a: Orientation, b: Orientation): Orientation {
  const [x, y, z, w] = a
  const [X, Y, Z, W] = b
  return [w * X + x * W + y * Z - z * Y, w * Y - x * Z + y * W + z * X, w * Z + x * Y - y * X + z * W, w * W - x * X - y * Y - z * Z]
}

function axis(x: number, y: number, z: number, degrees: number): Orientation {
  const angle = degrees * Math.PI / 360
  return [x * Math.sin(angle), y * Math.sin(angle), z * Math.sin(angle), Math.cos(angle)]
}

/** Pre-multiplication keeps each incremental orbit in camera/screen axes. */
function rotate(view: Orientation, pitch: number, yaw: number, roll = 0): Orientation {
  const delta = multiply(axis(0, 0, 1, roll), multiply(axis(1, 0, 0, pitch), axis(0, 1, 0, yaw)))
  const result = multiply(delta, view)
  const length = Math.hypot(...result)
  return result.map((value) => value / length) as unknown as Orientation
}

// Camera direction in book coordinates: left (x <= 0), below (y >= 0),
// in front (z > 0). Roll does not change which side of the book is visible.
export function isAllowedView([x, y, z, w]: Orientation) {
  return 2 * (x * z - y * w) <= 1e-9
    && 2 * (y * z + x * w) >= -1e-9
    && 1 - 2 * (x * x + y * y) >= 0.18
}

/** Small screen-axis steps slide along the limits without jumping across them. */
export function orbit(view: Orientation, pitch: number, yaw: number, roll = 0): Orientation {
  const inputs = [pitch, yaw, roll].map((value) => Number.isFinite(value) ? Math.max(-180, Math.min(180, value)) : 0)
  const steps = Math.max(1, Math.ceil(Math.max(...inputs.map(Math.abs)) / 2))
  let current = view
  for (let step = 0; step < steps; step++) {
    for (let axisIndex = 0; axisIndex < 3; axisIndex++) {
      if (!inputs[axisIndex]) continue
      const delta: [number, number, number] = [0, 0, 0]
      delta[axisIndex] = inputs[axisIndex] / steps
      const candidate = rotate(current, ...delta)
      if (isAllowedView(candidate)) current = candidate
    }
  }
  return current
}

export const initialView = rotate([0, 0, 0, 1], 30, 36, -9)
export const views: Record<string, Orientation> = {
  composition: initialView,
  front: [0, 0, 0, 1],
  spine: rotate([0, 0, 0, 1], 10, 75),
  bottom: rotate([0, 0, 0, 1], 70, 20),
}

/** CSS receives the view rotation; the camera orbits a stationary book at origin. */
export function viewMatrix([x, y, z, w]: Orientation) {
  return `matrix3d(${[
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ].join(',')})`
}
