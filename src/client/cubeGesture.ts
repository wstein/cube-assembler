// Typed entry point for the 3D cube's ReScript gesture math. Only the
// optional arguments need wrappers; all other values keep their generated types.
import {
  flickMs,
  pickSwipeLayer as pickSwipeLayerRes,
  releasedQuarterTurns as releasedQuarterTurnsRes,
  swipeStartPx,
  turnCommitFraction,
  type camera,
  type surfaceHit,
  type swipeLayer,
} from '../core/view/CubeGesture.gen'

export {
  blockLayer,
  clampZoom,
  defaultSwipeTuning as DEFAULT_SWIPE_TUNING,
  gestureAfterPointerUp,
  gestureForPointerDown,
  gestureWhenSwipeTurnsNothing,
  pickCubeSurface,
  pressLevel,
  standardWideLayer,
  onSeam,
  seamChoice,
  swipeStart,
  followDrag,
  releaseDrag,
  seamWideLayer,
  screenPoint,
  swipeLayerAngle,
  twoFingerLock,
  twoFingerMotion,
  wheelGesture,
  wheelSwipeGapMs as WHEEL_SWIPE_GAP_MS,
  nextWheelSwipe,
  wholeCubeLayer,
} from '../core/view/CubeGesture.gen'

export type {
  camera as CubeGestureCamera,
  cubeGesture as CubeGesture,
  pressLevel as PressLevel,
  surfaceHit as CubeSurfaceHit,
  swipeLayer as SwipeLayer,
  swipeTuning as SwipeTuning,
  twoFingerLock as TwoFingerLock,
  wheelSwipe as WheelSwipe,
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

export function releasedQuarterTurns(
  angle: number,
  velocity: number,
  commitFraction = turnCommitFraction,
  flick = flickMs,
): number {
  return releasedQuarterTurnsRes(angle, velocity, commitFraction, flick)
}
