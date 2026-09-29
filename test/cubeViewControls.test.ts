import { describe, expect, it } from 'vitest'
import { createCubeViewControls } from '../src/client/cubeViewControls'
import {
  facePreset,
  isometricAngles,
  rotateYaw,
  tiltPitch,
  wheelZoom,
} from '../src/client/cubeView3DState'

describe('3D view controls', () => {
  it('uses the same presets and tilt steps for keyboard input', () => {
    let pitch = 0
    let yaw = 0
    let zoom = 8.4
    let pauses = 0
    let prevented = 0
    const set = (
      current: number,
      value: number | ((previous: number) => number),
    ) => (typeof value === 'function' ? value(current) : value)
    const controls = createCubeViewControls({
      puzzleSize: 3,
      pauseAutoRotation: () => pauses++,
      setPitch: (value) => {
        pitch = set(pitch, value)
      },
      setYaw: (value) => {
        yaw = set(yaw, value)
      },
      setZoom: (value) => {
        zoom = set(zoom, value)
      },
      rotateView: () => {},
    })
    const key = (name: string) =>
      controls.handleKeyDown({
        key: name,
        preventDefault: () => {
          prevented++
        },
      } as unknown as KeyboardEvent)

    key('U')
    expect({ pitch, yaw }).toEqual(facePreset('u'))
    key('ArrowDown')
    expect(pitch).toBeCloseTo(tiltPitch(facePreset('u').pitch, false))
    key('r')
    expect({ pitch, yaw }).toEqual(facePreset('r'))
    expect(zoom).toBe(8.4)
    expect(pauses).toBe(3)
    expect(prevented).toBe(1)
  })

  it('points each face button and keyboard preset at the same view', () => {
    const limit = Math.PI / 2 - 0.05
    expect(facePreset('u')).toEqual({ pitch: limit, yaw: 0 })
    expect(facePreset('d')).toEqual({ pitch: -limit, yaw: 0 })
    expect(facePreset('f')).toEqual({ pitch: 0, yaw: 0 })
    expect(facePreset('b')).toEqual({ pitch: 0, yaw: Math.PI })
    expect(facePreset('r')).toEqual({ pitch: 0, yaw: -Math.PI / 2 })
    expect(facePreset('l')).toEqual({ pitch: 0, yaw: Math.PI / 2 })
  })

  it('keeps the back isometric view below the cube', () => {
    expect(isometricAngles(false)).toEqual({ pitch: 0.52, yaw: -0.74 })
    expect(isometricAngles(true)).toEqual({
      pitch: -0.52,
      yaw: -0.74 + Math.PI,
    })
  })

  it('steps keyboard tilt and rotation, clamping pitch at the poles', () => {
    const limit = Math.PI / 2 - 0.05
    expect(tiltPitch(0, true)).toBeCloseTo(0.2)
    expect(tiltPitch(0, false)).toBeCloseTo(-0.2)
    expect(tiltPitch(limit, true)).toBe(limit)
    expect(tiltPitch(-limit, false)).toBe(-limit)
    expect(tiltPitch(limit + 0.5, false)).toBeCloseTo(limit + 0.3)
    expect(rotateYaw(0, true)).toBeCloseTo(0.2)
    expect(rotateYaw(0, false)).toBeCloseTo(-0.2)
  })

  it('uses smaller pinch steps than mouse wheel steps and clamps zoom', () => {
    expect(wheelZoom(8.4, 10, true, 3)).toBeCloseTo(8.9)
    expect(wheelZoom(8.4, 10, false, 3)).toBeCloseTo(8.5)
    expect(wheelZoom(0, -100, false, 3)).toBe(5)
    expect(wheelZoom(100, 100, false, 3)).toBe(17)
  })
})
