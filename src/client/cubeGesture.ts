// The 3D cube's gesture math: typed entry point for
// src/core/view/CubeGesture.res.
import type { FaceKey } from '../cube/cubeAssembly'
import {
  blockLayer as blockLayerRes,
  clampZoom as clampZoomRes,
  cubePressMs,
  defaultHoldTimings,
  defaultSwipeTuning,
  facePlanePoint as facePlanePointRes,
  flickMs,
  gestureAfterPointerUp as gestureAfterPointerUpRes,
  gestureForPointerDown as gestureForPointerDownRes,
  gestureWhenSwipeTurnsNothing as gestureWhenSwipeTurnsNothingRes,
  layerIndex as layerIndexRes,
  pickCubeSurface as pickCubeSurfaceRes,
  pickSwipeLayer as pickSwipeLayerRes,
  pinchMinPx,
  pinchMinRatio,
  pressLevel as pressLevelRes,
  pressSlopPx,
  releasedQuarterTurns as releasedQuarterTurnsRes,
  swipeLayerAngle as swipeLayerAngleRes,
  swipeMoveAxis as swipeMoveAxisRes,
  swipeStartPx,
  tiltMinPx,
  turnCommitFraction,
  twoFingerLock as twoFingerLockRes,
  twoFingerMotion as twoFingerMotionRes,
  wheelGesture as wheelGestureRes,
  wholeCubeLayer as wholeCubeLayerRes,
  widePressMs,
} from '../core/view/CubeGesture.gen'

type Vec = [number, number, number]
type Axis = 0 | 1 | 2
export type GestureAxis = Axis

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

export function pickCubeSurface(
  x: number,
  y: number,
  camera: CubeGestureCamera,
): CubeSurfaceHit | null {
  return pickCubeSurfaceRes(x, y, camera) as CubeSurfaceHit | null
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

// A swipe turns a layer once it has moved SWIPE_START_PX (by default; the
// settings page can change it) and clearly along one of the face's axes.
export const SWIPE_START_PX = swipeStartPx

export function pickSwipeLayer(
  hit: CubeSurfaceHit,
  dx: number,
  dy: number,
  camera: CubeGestureCamera,
  startPx = SWIPE_START_PX,
): SwipeLayer | null {
  return pickSwipeLayerRes(hit, dx, dy, camera, startPx) as SwipeLayer | null
}

// The picked layer's angle in its face's clockwise radians, so the touched
// sticker follows the finger.
export function swipeLayerAngle(
  hit: CubeSurfaceHit,
  layer: SwipeLayer,
  dx: number,
  dy: number,
  camera: CubeGestureCamera,
): number {
  return swipeLayerAngleRes(hit, layer, dx, dy, camera)
}

// Holding a sticker before dragging turns more than its layer: a block of
// layers after WIDE_PRESS_MS, the whole cube after CUBE_PRESS_MS. Shift and
// Alt pick the same at once. A finger that moves PRESS_SLOP_PX first is
// swiping, not holding.
export const WIDE_PRESS_MS = widePressMs
export const CUBE_PRESS_MS = cubePressMs
export const PRESS_SLOP_PX = pressSlopPx

export type PressLevel = 'layer' | 'block' | 'cube'

// How long to hold for a block and for the whole cube; the settings page
// can change them.
export interface HoldTimings {
  blockMs: number
  cubeMs: number
}

export const DEFAULT_HOLD_TIMINGS: HoldTimings = defaultHoldTimings

export function pressLevel(
  heldMs: number,
  keys: { shiftKey: boolean; altKey: boolean },
  timings: HoldTimings = DEFAULT_HOLD_TIMINGS,
): PressLevel {
  return pressLevelRes(heldMs, keys, timings)
}

// Where the pointer is on the plane of the face `hit` is on, even beyond the
// face's edges, so picking layers can run off the cube.
export function facePlanePoint(
  x: number,
  y: number,
  camera: CubeGestureCamera,
  hit: CubeSurfaceHit,
): Vec | null {
  return facePlanePointRes(x, y, camera, hit)
}

// The layer a coordinate along an axis falls in, 0 at the negative side.
export function layerIndex(coordinate: number, size: number): number {
  return layerIndexRes(coordinate, size)
}

// The in-plane axis a clear swipe travels along: the layers it crosses are
// the ones it picks. The layer a swipe would turn rotates about the other.
export function swipeMoveAxis(
  hit: CubeSurfaceHit,
  dx: number,
  dy: number,
  camera: CubeGestureCamera,
  startPx = SWIPE_START_PX,
): Axis | null {
  return swipeMoveAxisRes(hit, dx, dy, camera, startPx) as Axis | null
}

// The layers between two indexes along an axis, named from the face the
// block reaches, else from the nearer face.
export function blockLayer(
  axis: Axis,
  from: number,
  to: number,
  size: number,
): SwipeLayer {
  return blockLayerRes(axis, from, to, size) as SwipeLayer
}

// Every layer about an axis: an x, y or z rotation of the whole cube.
export function wholeCubeLayer(axis: Axis, size: number): SwipeLayer {
  return wholeCubeLayerRes(axis, size) as SwipeLayer
}

// A released drag settles on whole quarter turns. Each further quarter
// counts once the drag passes TURN_COMMIT_FRACTION of it, so a short slow
// drag springs back. A flick carries on for FLICK_MS at its speed, but at
// most half a quarter, so it finishes one more turn and never spins on.
export const TURN_COMMIT_FRACTION = turnCommitFraction
export const FLICK_MS = flickMs

// The three can be changed on the settings page.
export interface SwipeTuning {
  startPx: number
  commitFraction: number
  flickMs: number
}

export const DEFAULT_SWIPE_TUNING: SwipeTuning = defaultSwipeTuning

export function releasedQuarterTurns(
  angle: number,
  velocity: number,
  commitFraction = TURN_COMMIT_FRACTION,
  flickMs = FLICK_MS,
): number {
  return releasedQuarterTurnsRes(angle, velocity, commitFraction, flickMs)
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
  return gestureForPointerDownRes(pointerType, touches, hit, current)
}

export function gestureWhenSwipeTurnsNothing(pointerType: string): CubeGesture {
  return gestureWhenSwipeTurnsNothingRes(pointerType)
}

// Lifting one of two tilting fingers must not start a layer turn with the
// other.
export function gestureAfterPointerUp(
  remaining: number,
  current: CubeGesture | null,
): CubeGesture | null {
  return gestureAfterPointerUpRes(remaining, current)
}

type ScreenPoint = [number, number]

export function twoFingerMotion(
  before: [ScreenPoint, ScreenPoint],
  after: [ScreenPoint, ScreenPoint],
): { dx: number; dy: number; scale: number } {
  return twoFingerMotionRes(before, after)
}

// Two fingers either tilt or pinch, decided once per gesture like map apps.
export const PINCH_MIN_PX = pinchMinPx
export const PINCH_MIN_RATIO = pinchMinRatio
export const TILT_MIN_PX = tiltMinPx

export type TwoFingerLock = 'undecided' | 'tilt' | 'pinch'

export function twoFingerLock(
  startSpread: number,
  spread: number,
  midpointTravel: number,
  lock: TwoFingerLock,
): TwoFingerLock {
  return twoFingerLockRes(startSpread, spread, midpointTravel, lock)
}

export function clampZoom(zoom: number, size: number): number {
  return clampZoomRes(zoom, size)
}

// Touchpads send two-finger swipes as wheel events and pinches as wheel
// events with Ctrl held: a swipe tilts, a pinch or a mouse wheel zooms.
export function wheelGesture(e: {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey: boolean
}): 'zoom' | 'tilt' {
  return wheelGestureRes(e)
}
