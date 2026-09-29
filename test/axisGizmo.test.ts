import { describe, expect, it } from 'vitest'
import { gizmoAxes, gizmoCamera } from '../src/core/view/AxisGizmo.gen'
import {
  ISOMETRIC_PITCH,
  ISOMETRIC_YAW,
} from '../src/client/view3d/cubeView3DState'

const inside = ([x, y]: readonly [number, number]) =>
  x > 0 && x < 96 && y > 0 && y < 96

describe('axis gizmo', () => {
  it('points X, Y and Z through R, U and F, toward the viewer isometrically', () => {
    const axes = gizmoAxes(gizmoCamera(96, 96, ISOMETRIC_PITCH, ISOMETRIC_YAW))
    expect(
      Object.fromEntries(axes.map((axis) => [axis.name, axis.face])),
    ).toEqual({ x: 'R', y: 'U', z: 'F' })
    expect(axes.every((axis) => axis.front)).toBe(true)
  })

  it('keeps the arrows and labels inside from any view', () => {
    for (let pitch = -1.5; pitch <= 1.5; pitch += 0.25)
      for (let yaw = -3.1; yaw <= 3.1; yaw += 0.3)
        for (const axis of gizmoAxes(gizmoCamera(96, 96, pitch, yaw))) {
          expect(inside(axis.tip)).toBe(true)
          expect(inside(axis.label)).toBe(true)
        }
  })

  it('draws the axes farthest first, starting at the middle', () => {
    const axes = gizmoAxes(gizmoCamera(96, 96, 0, 0))
    // Facing the front, Z points at the viewer and is drawn last.
    expect(axes.at(-1)?.name).toBe('z')
    for (const axis of axes) expect(axis.center).toEqual([48, 48])
  })
})
