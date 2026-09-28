import type { FaceKey } from '../cube/cubeAssembly'

type Vec = [number, number, number]
type Axis = 0 | 1 | 2

export interface CubeGestureCamera {
  width: number
  height: number
  zoom: number
  pitch: number
  yaw: number
  size: number
}

export interface CubeSurfaceHit {
  face: FaceKey
  point: Vec
  normalAxis: Axis
}

function rotateX([x, y, z]: Vec, angle: number): Vec {
  return [
    x,
    y * Math.cos(angle) - z * Math.sin(angle),
    y * Math.sin(angle) + z * Math.cos(angle),
  ]
}

function rotateY([x, y, z]: Vec, angle: number): Vec {
  return [
    x * Math.cos(angle) + z * Math.sin(angle),
    y,
    -x * Math.sin(angle) + z * Math.cos(angle),
  ]
}

export function pickCubeSurface(
  x: number,
  y: number,
  camera: CubeGestureCamera,
): CubeSurfaceHit | null {
  const { width, height, zoom, pitch, yaw, size } = camera
  if (width <= 0 || height <= 0) return null
  const tangent = Math.tan(Math.PI / 8)
  const ray: Vec = [
    ((2 * x) / width - 1) * tangent * (width / height),
    (1 - (2 * y) / height) * tangent,
    -1,
  ]
  const unrotate = (v: Vec) => rotateY(rotateX(v, -pitch), -yaw)
  const origin = unrotate([0, 0, zoom])
  const direction = unrotate(ray)
  const half = size / 2
  let closest = Number.POSITIVE_INFINITY
  let hit: CubeSurfaceHit | null = null
  const faces: Array<[Axis, number, FaceKey]> = [
    [0, 1, 'R'],
    [0, -1, 'L'],
    [1, 1, 'U'],
    [1, -1, 'D'],
    [2, 1, 'F'],
    [2, -1, 'B'],
  ]
  for (const [axis, sign, face] of faces) {
    if (Math.abs(direction[axis]) < 1e-8) continue
    const distance = (sign * half - origin[axis]) / direction[axis]
    if (distance <= 0 || distance >= closest) continue
    const point: Vec = [
      origin[0] + distance * direction[0],
      origin[1] + distance * direction[1],
      origin[2] + distance * direction[2],
    ]
    if (point.some((value) => Math.abs(value) > half + 1e-6)) continue
    closest = distance
    hit = { face, point, normalAxis: axis }
  }
  return hit
}

function project(point: Vec, camera: CubeGestureCamera): [number, number] {
  const [x, y, z] = rotateX(rotateY(point, camera.yaw), camera.pitch)
  const focal = camera.height / (2 * Math.tan(Math.PI / 8))
  return [(focal * x) / (camera.zoom - z), (-focal * y) / (camera.zoom - z)]
}

function tangent(axis: Axis, [x, y, z]: Vec): Vec {
  if (axis === 0) return [0, -z, y]
  if (axis === 1) return [z, 0, -x]
  return [-y, x, 0]
}

export function getSwipeLayerTurn(
  hit: CubeSurfaceHit,
  dx: number,
  dy: number,
  camera: CubeGestureCamera,
): { face: FaceKey; depth: number; turns: number } | null {
  if (Math.hypot(dx, dy) < 18) return null
  // The two layers a swipe can turn rotate about the face's two in-plane
  // axes. Each moves the touched point along the face, across the other
  // axis; its motion into the face would only skew the projection.
  const axes = ([0, 1, 2] as const).filter((axis) => axis !== hit.normalAxis)
  const a = project(hit.point, camera)
  const screen = axes.map((axis) => {
    const direction = tangent(axis, hit.point)
    direction[hit.normalAxis] = 0
    const b = project(
      [
        hit.point[0] + direction[0] * 0.1,
        hit.point[1] + direction[1] * 0.1,
        hit.point[2] + direction[2] * 0.1,
      ],
      camera,
    )
    return [b[0] - a[0], b[1] - a[1]]
  })
  // Express the swipe in those two on-screen directions: how far it moved
  // the point along the face for each layer.
  const [[ux, uy], [vx, vy]] = screen
  const det = ux * vy - uy * vx
  if (Math.abs(det) < 1e-9) return null
  const along = [(dx * vy - dy * vx) / det, (ux * dy - uy * dx) / det]
  const [first, second] = along.map(Math.abs)
  // A diagonal swipe across the face is ambiguous.
  if (Math.min(first, second) > 0.75 * Math.max(first, second)) return null
  const pick = first >= second ? 0 : 1
  const best = { axis: axes[pick], dot: along[pick] }
  const positive = hit.point[best.axis] >= 0
  const face: FaceKey =
    best.axis === 0
      ? positive
        ? 'R'
        : 'L'
      : best.axis === 1
        ? positive
          ? 'U'
          : 'D'
        : positive
          ? 'F'
          : 'B'
  const index = Math.max(
    0,
    Math.min(
      camera.size - 1,
      Math.round(hit.point[best.axis] + (camera.size - 1) / 2),
    ),
  )
  const depth = positive ? camera.size - index : index + 1
  const turns = (positive ? -1 : 1) * Math.sign(best.dot)
  return { face, depth, turns }
}

// What a drag does. Mouse and pen: a sticker swipe turns its layer and the
// background rotates the view. Touch: one finger only turns layers, and two
// fingers tilt and zoom, so a thumb resting on the cube never spins it.
export type CubeGesture = 'pending' | 'turn' | 'camera' | 'tilt' | 'none'

export function gestureForPointerDown(
  pointerType: string,
  touches: number,
  hit: CubeSurfaceHit | null,
  current: CubeGesture | null,
): CubeGesture {
  if (pointerType !== 'touch') return hit ? 'pending' : 'camera'
  if (touches === 1) return hit ? 'pending' : 'none'
  if (touches === 2) return 'tilt'
  return current ?? 'none'
}

export function gestureWhenSwipeTurnsNothing(pointerType: string): CubeGesture {
  return pointerType === 'touch' ? 'none' : 'camera'
}

// Lifting one of two tilting fingers must not start a layer turn with the
// other.
export function gestureAfterPointerUp(
  remaining: number,
  current: CubeGesture | null,
): CubeGesture | null {
  if (remaining === 0) return null
  return current === 'tilt' ? 'none' : current
}

type ScreenPoint = [number, number]

export function twoFingerMotion(
  before: [ScreenPoint, ScreenPoint],
  after: [ScreenPoint, ScreenPoint],
): { dx: number; dy: number; scale: number } {
  const mid = ([a, b]: [ScreenPoint, ScreenPoint]) => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ]
  const spread = ([a, b]: [ScreenPoint, ScreenPoint]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1])
  const [x0, y0] = mid(before)
  const [x1, y1] = mid(after)
  const s0 = spread(before)
  return { dx: x1 - x0, dy: y1 - y0, scale: s0 > 0 ? spread(after) / s0 : 1 }
}

// Fingers drift apart a little while tilting. Zoom only once their spread
// has changed by more than this fraction since the two fingers landed.
export const PINCH_ZOOM_THRESHOLD = 0.15

export function pinchZoom(
  startSpread: number,
  spread: number,
  previousSpread: number,
  zooming: boolean,
): { scale: number; zooming: boolean } {
  if (startSpread <= 0 || previousSpread <= 0) return { scale: 1, zooming }
  if (!zooming && Math.abs(spread / startSpread - 1) <= PINCH_ZOOM_THRESHOLD)
    return { scale: 1, zooming: false }
  return { scale: spread / previousSpread, zooming: true }
}

export function clampZoom(zoom: number, size: number): number {
  return Math.max(2 + size, Math.min(8 + size * 3, zoom))
}

// Touchpads send two-finger swipes as wheel events and pinches as wheel
// events with Ctrl held. A swipe tilts the cube like two fingers on a touch
// screen; a pinch or a mouse wheel zooms. Mouse wheels step in whole lines or
// in large whole-pixel notches without sideways movement.
export function wheelGesture(e: {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
}): 'zoom' | 'tilt' {
  if (e.ctrlKey) return 'zoom'
  if (e.deltaMode !== 0) return 'zoom'
  const notch =
    e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50
  return notch ? 'zoom' : 'tilt'
}
