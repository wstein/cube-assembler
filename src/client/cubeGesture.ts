// The 3D cube's gesture math: typed entry point for
// src/core/view/CubeGesture.res. Wrappers only add default arguments.
import {
  defaultHoldTimings,
  flickMs,
  pickSwipeLayer as pickSwipeLayerRes,
  pressLevel as pressLevelRes,
  releasedQuarterTurns as releasedQuarterTurnsRes,
  swipeMoveAxis as swipeMoveAxisRes,
  swipeStartPx,
  turnCommitFraction,
  type camera,
  type holdTimings,
  type pressKeys,
  type pressLevel as level,
  type surfaceHit,
  type swipeLayer,
} from '../core/view/CubeGesture.gen'

export {
  blockLayer,
  clampZoom,
  cubePressMs as CUBE_PRESS_MS,
  defaultHoldTimings as DEFAULT_HOLD_TIMINGS,
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
  holdTimings as HoldTimings,
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

export function pressLevel(
  heldMs: number,
  keys: pressKeys,
  timings: holdTimings = defaultHoldTimings,
): level {
  return pressLevelRes(heldMs, keys, timings)
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
