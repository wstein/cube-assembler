import type { RefObject } from 'preact'
import {
  swipeLayerAngle,
  type CubeGesture,
  type CubeGestureCamera,
  type CubeSurfaceHit,
  type PressLevel,
  type SwipeLayer,
  type SwipeTuning,
} from './cubeGesture'
import type { Point } from './cubeView3DState'

export interface DragTurn {
  layer: SwipeLayer
  angle: number
  velocity: number
  time: number
  // Lights up the grabbed layers of a wide or whole-cube turn.
  highlight?: boolean
  // What the mesh last showed, so it is rebuilt only when that changes.
  drawn: string | null
}
export interface CubePointerGesture {
  x: number
  y: number
  hit: CubeSurfaceHit | null
  mode: CubeGesture
  pointerType: string
  // Shift selects a wide move; an ordinary swipe starts on one layer.
  level: PressLevel
  // Read once when the gesture starts so settings stay stable during a swipe.
  tuning: SwipeTuning
  // Where the turn's angle is measured from once dragging turns layers.
  turnHit?: CubeSurfaceHit
  turnFrom?: Point
  // A seam swipe whose lean may change the wide block at any point.
  seamOpen?: boolean
}

interface DragInteractionOptions {
  dragTurnRef: RefObject<DragTurn | null>
  setIsTurning: (turning: boolean) => void
}

export function createDragInteraction({
  dragTurnRef,
  setIsTurning,
}: DragInteractionOptions) {
  // From here the layers follow the finger until release.
  const startDragTurn = (
    gesture: CubePointerGesture,
    layer: SwipeLayer,
    from: Point,
    hit: CubeSurfaceHit,
    e: Pick<PointerEvent, 'clientX' | 'clientY' | 'timeStamp'>,
    camera: CubeGestureCamera,
  ) => {
    gesture.mode = 'turn'
    gesture.turnHit = hit
    gesture.turnFrom = from
    dragTurnRef.current = {
      layer,
      angle: swipeLayerAngle(
        hit,
        layer,
        e.clientX - from[0],
        e.clientY - from[1],
        camera,
      ),
      velocity: 0,
      time: e.timeStamp,
      highlight: gesture.level !== 'layer',
      drawn: null,
    }
    setIsTurning(true)
  }

  return { startDragTurn }
}
