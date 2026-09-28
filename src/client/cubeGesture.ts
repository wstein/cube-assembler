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

// How far a swipe moved the touched point along the face for each of the
// two layers it can turn, in tenths of a radian. The layers rotate about the
// face's two in-plane axes; each moves the point across the other axis, and
// its motion into the face would only skew the projection.
function swipeAlong(
  hit: CubeSurfaceHit,
  dx: number,
  dy: number,
  camera: CubeGestureCamera,
): { axes: Axis[]; along: [number, number] } | null {
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
  // Express the swipe in those two on-screen directions.
  const [[ux, uy], [vx, vy]] = screen
  const det = ux * vy - uy * vx
  if (Math.abs(det) < 1e-9) return null
  return {
    axes,
    along: [(dx * vy - dy * vx) / det, (ux * dy - uy * dx) / det],
  }
}

export interface SwipeLayer {
  face: FaceKey
  depth: number
  // Layers turning together, ending at `depth`; 1 when omitted.
  width?: number
  axis: Axis
  // Turns the rotation about +axis into the face's clockwise turns.
  sign: 1 | -1
}

export function pickSwipeLayer(
  hit: CubeSurfaceHit,
  dx: number,
  dy: number,
  camera: CubeGestureCamera,
): SwipeLayer | null {
  if (Math.hypot(dx, dy) < 18) return null
  const swipe = swipeAlong(hit, dx, dy, camera)
  if (!swipe) return null
  const [first, second] = swipe.along.map(Math.abs)
  // A diagonal swipe across the face is ambiguous.
  if (Math.min(first, second) > 0.75 * Math.max(first, second)) return null
  const axis = swipe.axes[first >= second ? 0 : 1]
  const positive = hit.point[axis] >= 0
  const face: FaceKey =
    axis === 0
      ? positive
        ? 'R'
        : 'L'
      : axis === 1
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
      Math.round(hit.point[axis] + (camera.size - 1) / 2),
    ),
  )
  const depth = positive ? camera.size - index : index + 1
  return { face, depth, axis, sign: positive ? -1 : 1 }
}

// The picked layer's angle in its face's clockwise radians, so the touched
// sticker follows the finger. A turn about an in-plane axis moves the point
// along the face by half the cube width per radian, so a tenth of that
// distance is a tenth of a radian.
export function swipeLayerAngle(
  hit: CubeSurfaceHit,
  layer: SwipeLayer,
  dx: number,
  dy: number,
  camera: CubeGestureCamera,
): number {
  const swipe = swipeAlong(hit, dx, dy, camera)
  if (!swipe) return 0
  return layer.sign * 0.1 * swipe.along[swipe.axes.indexOf(layer.axis)]
}

// Holding a sticker before dragging turns more than its layer: a block of
// layers after WIDE_PRESS_MS, the whole cube after CUBE_PRESS_MS. Shift and
// Alt pick the same at once. A finger that moves PRESS_SLOP_PX first is
// swiping, not holding.
export const WIDE_PRESS_MS = 300
export const CUBE_PRESS_MS = 600
export const PRESS_SLOP_PX = 10

export type PressLevel = 'layer' | 'block' | 'cube'

export function pressLevel(
  heldMs: number,
  keys: { shiftKey: boolean; altKey: boolean },
): PressLevel {
  if (keys.altKey || heldMs >= CUBE_PRESS_MS) return 'cube'
  if (keys.shiftKey || heldMs >= WIDE_PRESS_MS) return 'block'
  return 'layer'
}

// Where the pointer is on the plane of the face `hit` is on, even beyond the
// face's edges, so picking layers can run off the cube.
export function facePlanePoint(
  x: number,
  y: number,
  camera: CubeGestureCamera,
  hit: CubeSurfaceHit,
): Vec | null {
  const { width, height, zoom, pitch, yaw } = camera
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
  const axis = hit.normalAxis
  if (Math.abs(direction[axis]) < 1e-8) return null
  const distance = (hit.point[axis] - origin[axis]) / direction[axis]
  if (distance <= 0) return null
  return [
    origin[0] + distance * direction[0],
    origin[1] + distance * direction[1],
    origin[2] + distance * direction[2],
  ]
}

// The layer a coordinate along an axis falls in, 0 at the negative side.
export function layerIndex(coordinate: number, size: number): number {
  return Math.max(
    0,
    Math.min(size - 1, Math.round(coordinate + (size - 1) / 2)),
  )
}

// The in-plane axis a clear swipe travels along: the layers it crosses are
// the ones it picks. The layer a swipe would turn rotates about the other.
export function swipeMoveAxis(
  hit: CubeSurfaceHit,
  dx: number,
  dy: number,
  camera: CubeGestureCamera,
): Axis | null {
  const layer = pickSwipeLayer(hit, dx, dy, camera)
  if (!layer) return null
  return ([0, 1, 2] as const).find(
    (axis) => axis !== hit.normalAxis && axis !== layer.axis,
  )!
}

const AXIS_FACES: Record<Axis, [FaceKey, FaceKey]> = {
  0: ['R', 'L'],
  1: ['U', 'D'],
  2: ['F', 'B'],
}

// The layers between two indexes along an axis, named from the face the
// block reaches, else from the nearer face.
export function blockLayer(
  axis: Axis,
  from: number,
  to: number,
  size: number,
): SwipeLayer {
  const low = Math.min(from, to)
  const high = Math.max(from, to)
  const positive = high === size - 1 || (low !== 0 && low + high >= size - 1)
  return {
    face: AXIS_FACES[axis][positive ? 0 : 1],
    depth: positive ? size - low : high + 1,
    width: high - low + 1,
    axis,
    sign: positive ? -1 : 1,
  }
}

// Every layer about an axis: an x, y or z rotation of the whole cube.
export function wholeCubeLayer(axis: Axis, size: number): SwipeLayer {
  return blockLayer(axis, 0, size - 1, size)
}

// A released drag settles on whole quarter turns. Each further quarter
// counts once the drag passes TURN_COMMIT_FRACTION of it, so a short slow
// drag springs back. A flick carries on for FLICK_MS at its speed, but at
// most half a quarter, so it finishes one more turn and never spins on.
export const TURN_COMMIT_FRACTION = 0.35
export const FLICK_MS = 120

export function releasedQuarterTurns(angle: number, velocity: number): number {
  const quarter = Math.PI / 2
  const flick = Math.max(
    -quarter / 2,
    Math.min(quarter / 2, velocity * FLICK_MS),
  )
  const quarters = (angle + flick) / quarter
  const turns = Math.floor(Math.abs(quarters) + 1 - TURN_COMMIT_FRACTION)
  return turns === 0 ? 0 : Math.sign(quarters) * turns
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

// Two fingers either tilt or pinch, decided once per gesture like map apps.
// Fingers drift apart a little while tilting, so a pinch needs its spread
// to change by at least PINCH_MIN_PX and PINCH_MIN_RATIO, and by more than
// the midpoint moved. A tilt needs the midpoint to travel TILT_MIN_PX and
// more than the spread changed; a pinch with one finger resting moves the
// midpoint only half as far, so it never counts as a tilt.
export const PINCH_MIN_PX = 24
export const PINCH_MIN_RATIO = 0.15
export const TILT_MIN_PX = 16

export type TwoFingerLock = 'undecided' | 'tilt' | 'pinch'

export function twoFingerLock(
  startSpread: number,
  spread: number,
  midpointTravel: number,
  lock: TwoFingerLock,
): TwoFingerLock {
  if (lock !== 'undecided') return lock
  const spreadChange = Math.abs(spread - startSpread)
  if (
    spreadChange >= Math.max(PINCH_MIN_PX, PINCH_MIN_RATIO * startSpread) &&
    spreadChange > midpointTravel
  )
    return 'pinch'
  if (midpointTravel >= TILT_MIN_PX && midpointTravel > spreadChange)
    return 'tilt'
  return 'undecided'
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
