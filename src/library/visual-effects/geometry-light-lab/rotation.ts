import type { GeometryLightControls } from './model'

export type Quaternion = readonly [x: number, y: number, z: number, w: number]

const IDENTITY: Quaternion = [0, 0, 0, 1]

export function orientationFromControls(
  controls: Pick<GeometryLightControls, 'rotationX' | 'rotationY' | 'rotationZ'>,
) {
  return rotateInViewSpace(
    IDENTITY,
    controls.rotationX,
    controls.rotationY,
    controls.rotationZ,
  )
}

export function rotateInViewSpace(
  orientation: Quaternion,
  xDegrees: number,
  yDegrees: number,
  zDegrees = 0,
): Quaternion {
  let delta = IDENTITY
  if (yDegrees) delta = multiply(axisAngle(0, 1, 0, yDegrees), delta)
  if (xDegrees) delta = multiply(axisAngle(1, 0, 0, xDegrees), delta)
  if (zDegrees) delta = multiply(axisAngle(0, 0, 1, zDegrees), delta)
  return normalize(multiply(delta, orientation))
}

function axisAngle(x: number, y: number, z: number, degrees: number): Quaternion {
  const halfAngle = degrees * Math.PI / 360
  const sine = Math.sin(halfAngle)
  return [x * sine, y * sine, z * sine, Math.cos(halfAngle)]
}

function multiply(left: Quaternion, right: Quaternion): Quaternion {
  const [lx, ly, lz, lw] = left
  const [rx, ry, rz, rw] = right
  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ]
}

function normalize(quaternion: Quaternion): Quaternion {
  const length = Math.hypot(...quaternion)
  return quaternion.map((value) => value / length) as unknown as Quaternion
}
