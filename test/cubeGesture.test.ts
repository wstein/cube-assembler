import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SWIPE_TUNING,
  WIDE_PRESS_MS,
  blockLayer,
  clampZoom,
  pressLevel,
  nextWheelSwipe,
  WHEEL_SWIPE_GAP_MS,
  wholeCubeLayer,
  standardWideLayer,
  gestureAfterPointerUp,
  gestureForPointerDown,
  gestureWhenSwipeTurnsNothing,
  twoFingerLock,
  pickCubeSurface,
  pickSwipeLayer,
  releasedQuarterTurns,
  swipeLayerAngle,
  twoFingerMotion,
  wheelGesture,
  type CubeGestureCamera,
  type CubeSurfaceHit,
} from '../src/client/cubeGesture'

const camera = { width: 600, height: 600, zoom: 12, pitch: 0, yaw: 0, size: 5 }

// The layer a quick swipe turns and which way, as the view reads it.
function getSwipeLayerTurn(
  hit: CubeSurfaceHit,
  dx: number,
  dy: number,
  cam: CubeGestureCamera,
) {
  const layer = pickSwipeLayer(hit, dx, dy, cam)
  if (!layer) return null
  const turns = Math.sign(swipeLayerAngle(hit, layer, dx, dy, cam))
  return { face: layer.face, depth: layer.depth, turns }
}

describe('cube sticker drag', () => {
  it('picks a visible sticker and ignores the background', () => {
    expect(pickCubeSurface(300, 300, camera)?.face).toBe('F')
    expect(
      pickCubeSurface(300, 300, { ...camera, yaw: -Math.PI / 2 })?.face,
    ).toBe('R')
    expect(pickCubeSurface(10, 10, camera)).toBeNull()
  })

  it('turns the inner column touched on a 5x5 face', () => {
    const hit = pickCubeSurface(240, 300, camera)
    expect(hit).not.toBeNull()
    const turn = getSwipeLayerTurn(hit!, 0, -80, camera)
    expect(turn).toMatchObject({ face: 'L', depth: 2, turns: -1 })
  })

  it('turns the row touched on the front face', () => {
    const hit = pickCubeSurface(300, 300, camera)
    const turn = getSwipeLayerTurn(hit!, 80, 0, camera)
    expect(turn).toMatchObject({ face: 'U', depth: 3, turns: -1 })
    expect(getSwipeLayerTurn(hit!, 1, 1, camera)).toBeNull()
  })
})

describe('live sticker drag', () => {
  const quarter = Math.PI / 2

  it('turns the layer as far as the finger moved the sticker', () => {
    const hit = pickCubeSurface(300, 300, camera)!
    const layer = pickSwipeLayer(hit, 80, 0, camera)
    expect(layer).toMatchObject({ face: 'U', depth: 3 })
    // Facing the front, the sticker moves across the face by half the cube
    // width per radian, seen from the camera distance to the face.
    const focal = camera.height / (2 * Math.tan(Math.PI / 8))
    const radiansPerPixel = (camera.zoom - 2.5) / (focal * 2.5)
    expect(swipeLayerAngle(hit, layer!, 80, 0, camera)).toBeCloseTo(
      -80 * radiansPerPixel,
      6,
    )
  })

  it('keeps following the finger past a quarter turn and back past the start', () => {
    const hit = pickCubeSurface(300, 300, camera)!
    const layer = pickSwipeLayer(hit, 80, 0, camera)!
    const angle = (dx: number) => swipeLayerAngle(hit, layer, dx, 0, camera)
    expect(angle(800)).toBeCloseTo(10 * angle(80), 9)
    expect(Math.abs(angle(800))).toBeGreaterThan(2 * quarter)
    expect(angle(-40)).toBeCloseTo(-angle(40), 9)
    // Only the chosen layer's direction counts once it is picked.
    expect(swipeLayerAngle(hit, layer, 80, 30, camera)).toBeCloseTo(
      angle(80),
      9,
    )
  })

  it('agrees with the turn direction a quick swipe picks', () => {
    const iso = {
      width: 600,
      height: 600,
      zoom: 8.4,
      pitch: 0.42,
      yaw: -0.62,
      size: 3,
    }
    for (const [x, y, dx, dy] of [
      [200, 450, 30, 0],
      [200, 450, 0, 30],
      [450, 300, 30, 0],
      [450, 300, 0, 30],
      [350, 150, 0, 30],
      [350, 150, 30, 0],
    ]) {
      const hit = pickCubeSurface(x, y, iso)!
      const layer = pickSwipeLayer(hit, dx, dy, iso)!
      const turn = getSwipeLayerTurn(hit, dx, dy, iso)!
      expect(Math.sign(swipeLayerAngle(hit, layer, dx, dy, iso))).toBe(
        turn.turns,
      )
    }
  })

  it('springs back from a short slow drag and commits past the threshold', () => {
    expect(releasedQuarterTurns(0.2 * quarter, 0)).toBe(0)
    expect(releasedQuarterTurns(-0.3 * quarter, 0)).toBe(0)
    expect(releasedQuarterTurns(0.4 * quarter, 0)).toBe(1)
    expect(releasedQuarterTurns(-0.5 * quarter, 0)).toBe(-1)
  })

  it('counts every further quarter turn the drag passes', () => {
    expect(releasedQuarterTurns(1.3 * quarter, 0)).toBe(1)
    expect(releasedQuarterTurns(1.4 * quarter, 0)).toBe(2)
    expect(releasedQuarterTurns(2.9 * quarter, 0)).toBe(3)
    expect(releasedQuarterTurns(-2.3 * quarter, 0)).toBe(-2)
  })

  it('lets a quick flick finish one more turn but not several', () => {
    expect(releasedQuarterTurns(0.1 * quarter, 0.01)).toBe(1)
    expect(releasedQuarterTurns(-0.1 * quarter, -0.01)).toBe(-1)
    expect(releasedQuarterTurns(0, 1)).toBe(1)
    expect(releasedQuarterTurns(1.1 * quarter, -1)).toBe(1)
  })
})

describe('sticker swipes in the default isometric view', () => {
  const iso = {
    width: 600,
    height: 600,
    zoom: 8.4,
    pitch: 0.42,
    yaw: -0.62,
    size: 3,
  }
  const swipe = (x: number, y: number, dx: number, dy: number) => {
    const hit = pickCubeSurface(x, y, iso)
    expect(hit).not.toBeNull()
    const turn = getSwipeLayerTurn(hit!, dx, dy, iso)
    return turn && `${turn.face}${turn.turns < 0 ? "'" : ''}${turn.depth}`
  }

  it('turns the row for a sideways swipe low on the front face', () => {
    // The point's motion into the cube used to make both candidate
    // directions look alike on screen here, and swapped row and column.
    expect(swipe(200, 450, 30, 0)).toBe('D1')
    expect(swipe(200, 450, 0, 30)).toBe('L2')
    expect(swipe(150, 400, 30, 0)).toBe('D1')
    expect(swipe(150, 400, 0, 30)).toBe('L1')
  })

  it('accepts sideways swipes near the back edge of the right face', () => {
    expect(swipe(450, 300, 30, 0)).toBe("U'2")
    expect(swipe(450, 300, 0, 30)).toBe("B'1")
    expect(swipe(450, 400, 30, 0)).toBe('D1')
  })

  it('turns a column for a downward swipe on the top face', () => {
    expect(swipe(350, 150, 0, 30)).toBe('L2')
    expect(swipe(350, 150, 30, 0)).toBe("B'1")
  })

  it('leaves a swipe diagonal to the face grid alone', () => {
    expect(swipe(250, 200, 0, 30)).toBeNull()
  })
})

describe('touch gestures', () => {
  const hit = pickCubeSurface(300, 300, camera)

  it('keeps mouse drags: sticker turns, background rotates the view', () => {
    expect(gestureForPointerDown('mouse', 1, hit, null)).toBe('pending')
    expect(gestureForPointerDown('mouse', 1, null, null)).toBe('camera')
    expect(gestureWhenSwipeTurnsNothing('mouse')).toBe('camera')
  })

  it('turns layers with one finger and never tilts with it', () => {
    expect(gestureForPointerDown('touch', 1, hit, null)).toBe('pending')
    expect(gestureForPointerDown('touch', 1, null, null)).toBe('none')
    expect(gestureWhenSwipeTurnsNothing('touch')).toBe('none')
  })

  it('starts a two-finger gesture even after a pending sticker swipe', () => {
    expect(gestureForPointerDown('touch', 2, null, 'pending')).toBe(
      'two-finger',
    )
    expect(gestureForPointerDown('touch', 2, hit, 'none')).toBe('two-finger')
    // A third finger changes nothing.
    expect(gestureForPointerDown('touch', 3, null, 'two-finger')).toBe(
      'two-finger',
    )
  })

  it('does not turn a layer with the finger left after a two-finger gesture', () => {
    expect(gestureAfterPointerUp(1, 'two-finger')).toBe('none')
    expect(gestureAfterPointerUp(0, 'two-finger')).toBeNull()
    expect(gestureAfterPointerUp(0, 'turn')).toBeNull()
  })

  it('follows the midpoint of two fingers and their spread', () => {
    const motion = twoFingerMotion(
      [
        [100, 100],
        [200, 100],
      ],
      [
        [110, 130],
        [230, 130],
      ],
    )
    expect(motion.dx).toBeCloseTo(20)
    expect(motion.dy).toBeCloseTo(30)
    expect(motion.scale).toBeCloseTo(1.2)
  })

  it('waits until two fingers clearly tilt or pinch', () => {
    expect(twoFingerLock(60, 64, 6, 'undecided')).toBe('undecided')
  })

  it('locks a two-finger swipe to tilting despite normal finger drift', () => {
    // Phone fingertips sit 40-100 px apart and drift 6-16 px while swiping;
    // the midpoint travels much further.
    expect(twoFingerLock(40, 46, 16, 'undecided')).toBe('tilt')
    expect(twoFingerLock(60, 70, 20, 'undecided')).toBe('tilt')
    expect(twoFingerLock(100, 116, 30, 'undecided')).toBe('tilt')
  })

  it('needs at least 24 px of spread change to pinch, even with close fingers', () => {
    // 20 px is 50% of a 40 px spread, but still no pinch.
    expect(twoFingerLock(40, 60, 4, 'undecided')).toBe('undecided')
    expect(twoFingerLock(40, 65, 4, 'undecided')).toBe('pinch')
    // Wide fingers need 15%: 24 px of 200 is not enough.
    expect(twoFingerLock(200, 226, 4, 'undecided')).toBe('undecided')
    expect(twoFingerLock(200, 232, 4, 'undecided')).toBe('pinch')
  })

  it('treats a pinch with one finger resting as a pinch, not a tilt', () => {
    // Moving one finger 30 px moves the midpoint only 15 px.
    expect(twoFingerLock(80, 110, 15, 'undecided')).toBe('pinch')
    expect(twoFingerLock(80, 50, 15, 'undecided')).toBe('pinch')
  })

  it('keeps its lock until the fingers lift', () => {
    expect(twoFingerLock(60, 140, 5, 'tilt')).toBe('tilt')
    expect(twoFingerLock(60, 62, 200, 'pinch')).toBe('pinch')
  })

  it('keeps the zoom in the same range as the mouse wheel', () => {
    expect(clampZoom(1, 3)).toBe(5)
    expect(clampZoom(100, 3)).toBe(17)
    expect(clampZoom(9, 3)).toBe(9)
  })
})

describe('wheel and touchpad', () => {
  const wheel = (deltaX: number, deltaY: number, extra = {}) => ({
    deltaX,
    deltaY,
    deltaMode: 0,
    ctrlKey: false,
    ...extra,
  })

  it('zooms with a pinch, which browsers send as a wheel with Ctrl', () => {
    expect(wheelGesture(wheel(0, -3.5, { ctrlKey: true }))).toBe('zoom')
  })

  it('tilts with a two-finger touchpad swipe', () => {
    expect(wheelGesture(wheel(4.2, -1.5))).toBe('tilt')
    expect(wheelGesture(wheel(0, 7.25))).toBe('tilt')
    expect(wheelGesture(wheel(12, 0))).toBe('tilt')
  })

  it('keeps zooming with a mouse wheel', () => {
    expect(wheelGesture(wheel(0, 100))).toBe('zoom')
    expect(wheelGesture(wheel(0, -120))).toBe('zoom')
    expect(wheelGesture(wheel(0, 3, { deltaMode: 1 }))).toBe('zoom')
  })
})

describe('held sticker drags', () => {
  const front = {
    width: 600,
    height: 600,
    zoom: 12,
    pitch: 0,
    yaw: 0,
    size: 5,
  }

  it('holds a sticker 300 ms for a wide turn, however long it is held', () => {
    const keys = { shiftKey: false, altKey: false }
    expect(pressLevel(0, keys)).toBe('layer')
    expect(WIDE_PRESS_MS).toBe(300)
    expect(pressLevel(WIDE_PRESS_MS - 1, keys)).toBe('layer')
    expect(pressLevel(WIDE_PRESS_MS, keys)).toBe('wide')
    // Holding longer never turns the whole cube: that is the mini cube's
    // job (and Alt's).
    expect(pressLevel(800, keys)).toBe('wide')
    expect(pressLevel(5000, keys)).toBe('wide')
  })

  it('widens a touched slice from its named face without a selection swipe', () => {
    expect(
      standardWideLayer({ face: 'R', depth: 1, axis: 0, sign: -1 }, 5),
    ).toMatchObject({ face: 'R', depth: 2, width: 2 })
    expect(
      standardWideLayer({ face: 'L', depth: 2, axis: 0, sign: 1 }, 5),
    ).toMatchObject({ face: 'L', depth: 2, width: 2 })
    expect(
      standardWideLayer({ face: 'U', depth: 3, axis: 1, sign: -1 }, 7),
    ).toMatchObject({ face: 'U', depth: 3, width: 3 })
    expect(
      standardWideLayer({ face: 'R', depth: 1, axis: 0, sign: -1 }, 2),
    ).toMatchObject({ face: 'R', depth: 1, width: 1 })
  })

  it('takes Shift for a wide turn and Alt for the whole cube at once', () => {
    expect(pressLevel(0, { shiftKey: true, altKey: false })).toBe('wide')
    expect(pressLevel(0, { shiftKey: false, altKey: true })).toBe('cube')
    expect(pressLevel(0, { shiftKey: true, altKey: true })).toBe('cube')
  })

  it('names a block from the face it reaches, or the nearer one', () => {
    expect(blockLayer(0, 3, 4, 5)).toMatchObject({
      face: 'R',
      depth: 2,
      width: 2,
      axis: 0,
      sign: -1,
    })
    expect(blockLayer(0, 1, 0, 5)).toMatchObject({
      face: 'L',
      depth: 2,
      width: 2,
      sign: 1,
    })
    expect(blockLayer(1, 1, 2, 5)).toMatchObject({
      face: 'D',
      depth: 3,
      width: 2,
    })
    expect(blockLayer(2, 2, 3, 5)).toMatchObject({
      face: 'F',
      depth: 3,
      width: 2,
    })
    expect(blockLayer(0, 2, 2, 5)).toMatchObject({ depth: 3, width: 1 })
  })

  it('turns the whole cube about the swipe axis, named from R, U or F', () => {
    const hit = pickCubeSurface(240, 300, front)!
    const layer = pickSwipeLayer(hit, 0, -80, front)!
    expect(layer.face).toBe('L')
    const cube = wholeCubeLayer(layer.axis, 5)
    expect(cube).toEqual({ face: 'R', depth: 5, width: 5, axis: 0, sign: -1 })
    // Swiping up on the front turns the cube like R: an x rotation.
    expect(swipeLayerAngle(hit, cube, 0, -80, front)).toBeGreaterThan(0)
  })
})

describe('swipe sensitivity settings', () => {
  const quarter = Math.PI / 2
  it('starts a turn after the set distance', () => {
    const hit = pickCubeSurface(300, 300, camera)!
    expect(pickSwipeLayer(hit, 20, 0, camera)).not.toBeNull()
    expect(pickSwipeLayer(hit, 20, 0, camera, 30)).toBeNull()
    expect(pickSwipeLayer(hit, 10, 0, camera, 8)).not.toBeNull()
  })

  it('commits and flicks as set', () => {
    expect(releasedQuarterTurns(0.4 * quarter, 0, 0.5, 0)).toBe(0)
    expect(releasedQuarterTurns(0.2 * quarter, 0, 0.15, 0)).toBe(1)
    // A flick of 0 ms never carries on.
    expect(releasedQuarterTurns(0.1 * quarter, 1, 0.35, 0)).toBe(0)
    expect(releasedQuarterTurns(0.1 * quarter, 0.01, 0.35, 240)).toBe(1)
    expect(DEFAULT_SWIPE_TUNING).toEqual({
      startPx: 18,
      commitFraction: 0.35,
      flickMs: 120,
    })
  })
})

describe('touchpad swipes', () => {
  it('groups wheel events into swipes that end after a pause', () => {
    const first = nextWheelSwipe(null, 1000, 10, -4)
    expect(first).toEqual({ startTime: 1000, lastTime: 1000, dx: -10, dy: 4 })
    // The fingers move against the deltas; events within the gap add up.
    const second = nextWheelSwipe(first, 1016, 6, 0)
    expect(second).toEqual({ startTime: 1000, lastTime: 1016, dx: -16, dy: 4 })
    expect(WHEEL_SWIPE_GAP_MS).toBe(150)
    // After the gap a new swipe starts.
    expect(nextWheelSwipe(second, 1016 + 151, 2, 2)).toEqual({
      startTime: 1167,
      lastTime: 1167,
      dx: -2,
      dy: -2,
    })
  })
})
