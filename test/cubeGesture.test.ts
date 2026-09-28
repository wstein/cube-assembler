import { describe, expect, it } from 'vitest'
import {
  clampZoom,
  getSwipeLayerTurn,
  gestureAfterPointerUp,
  gestureForPointerDown,
  gestureWhenSwipeTurnsNothing,
  pinchZoom,
  pickCubeSurface,
  twoFingerMotion,
  wheelGesture,
} from '../src/client/cubeGesture'

const camera = { width: 600, height: 600, zoom: 12, pitch: 0, yaw: 0, size: 5 }

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

  it('tilts with a second finger, even after a pending sticker swipe', () => {
    expect(gestureForPointerDown('touch', 2, null, 'pending')).toBe('tilt')
    expect(gestureForPointerDown('touch', 2, hit, 'none')).toBe('tilt')
    // A third finger changes nothing.
    expect(gestureForPointerDown('touch', 3, null, 'tilt')).toBe('tilt')
  })

  it('does not turn a layer with the finger left after a two-finger tilt', () => {
    expect(gestureAfterPointerUp(1, 'tilt')).toBe('none')
    expect(gestureAfterPointerUp(0, 'tilt')).toBeNull()
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

  it('ignores the small spread changes of a two-finger tilt', () => {
    // Fingers drift apart a little while tilting; that must not zoom.
    expect(pinchZoom(200, 212, 210, false)).toEqual({
      scale: 1,
      zooming: false,
    })
    expect(pinchZoom(200, 184, 186, false)).toEqual({
      scale: 1,
      zooming: false,
    })
  })

  it('zooms once the fingers clearly pinch, without jumping', () => {
    const start = pinchZoom(200, 240, 226, false)
    expect(start.zooming).toBe(true)
    // Only the step past the previous spread applies, not the whole change.
    expect(start.scale).toBeCloseTo(240 / 226)
    // Once pinching, every change zooms, even small ones.
    const next = pinchZoom(200, 236, 240, true)
    expect(next).toEqual({ scale: 236 / 240, zooming: true })
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
