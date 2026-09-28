// Typed entry point for the 3D cube's ReScript gesture math. Only the
// optional arguments need wrappers; all other values keep their generated types.
import {
  flickMs,
  pickSwipeLayer as pickSwipeLayerRes,
  pressLevel as pressLevelRes,
  releasedQuarterTurns as releasedQuarterTurnsRes,
  swipeMoveAxis as swipeMoveAxisRes,
  swipeStartPx,
  turnCommitFraction,
  type camera,
  type pressKeys,
  type pressLevel as level,
  type surfaceHit,
  type swipeLayer,
} from '../core/view/CubeGesture.gen'

export {
  blockLayer,
  clampZoom,
  defaultSwipeTuning as DEFAULT_SWIPE_TUNING,
  facePlanePoint,
  flickMs as FLICK_MS,
  gestureAfterPointerUp,
  gestureForPointerDown,
  gestureWhenSwipeTurnsNothing,
  layerIndex,
  pickCubeSurface,
  pinchMinPx as PINCH_MIN_PX,
  pinchMinRatio as PINCH_MIN_RATIO,
  pressSlopPx as PRESS_SLOP_PX,
  standardWideLayer,
  swipeLayerAngle,
  swipeStartPx as SWIPE_START_PX,
  tiltMinPx as TILT_MIN_PX,
  turnCommitFraction as TURN_COMMIT_FRACTION,
  twoFingerLock,
  twoFingerMotion,
  wheelGesture,
  wholeCubeLayer,
  widePressMs as WIDE_PRESS_MS,
} from '../core/view/CubeGesture.gen'

export type {
  camera as CubeGestureCamera,
  cubeGesture as CubeGesture,
  pressLevel as PressLevel,
  surfaceHit as CubeSurfaceHit,
  swipeLayer as SwipeLayer,
  swipeTuning as SwipeTuning,
  twoFingerLock as TwoFingerLock,
} from '../core/view/CubeGesture.gen'

export type GestureAxis = 0 | 1 | 2

export function pickSwipeLayer(
  hit: surfaceHit,
  dx: number,
  dy: number,
  camera: camera,
  startPx = swipeStartPx,
): swipeLayer | null {
  return pickSwipeLayerRes(hit, dx, dy, camera, startPx)
}

export function pressLevel(heldMs: number, keys: pressKeys): level {
  return pressLevelRes(heldMs, keys)
}

export function swipeMoveAxis(
  hit: surfaceHit,
  dx: number,
  dy: number,
  camera: camera,
  startPx = swipeStartPx,
): GestureAxis | null {
  return swipeMoveAxisRes(hit, dx, dy, camera, startPx) as GestureAxis | null
}

export function releasedQuarterTurns(
  angle: number,
  velocity: number,
  commitFraction = turnCommitFraction,
  flick = flickMs,
): number {
  return releasedQuarterTurnsRes(angle, velocity, commitFraction, flick)
}
