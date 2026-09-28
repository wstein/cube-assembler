import { describe, expect, it } from 'vitest'
import {
  gizmoAxes,
  gizmoCamera,
  gizmoFaceColors,
} from '../src/core/view/AxisGizmo.gen'
import { createSolvedCube } from '../src/cube/cubeAssembly'
import { applyCubeLayerMove } from '../src/cube/cubeMoves'
import { ISOMETRIC_PITCH, ISOMETRIC_YAW } from '../src/client/cubeView3DState'

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

  it('colors each axis by the face it points through now', () => {
    expect(gizmoFaceColors(createSolvedCube(3), 3)).toEqual({
      U: 'W',
      R: 'R',
      F: 'G',
      D: 'Y',
      L: 'O',
      B: 'B',
    })
    // After y the front shows what was on the right.
    const turned = applyCubeLayerMove(createSolvedCube(4), 4, 'U', 4, 1, 4)
    expect(gizmoFaceColors(turned, 4)).toMatchObject({ F: 'R', U: 'W' })
    // A scrambled face reads as its center majority; a 2x2 as all four.
    let cube = createSolvedCube(5)
    cube = applyCubeLayerMove(cube, 5, 'R', 1, 1, 1)
    cube = applyCubeLayerMove(cube, 5, 'U', 1, 1, 1)
    expect(gizmoFaceColors(cube, 5)).toMatchObject({ U: 'W', F: 'G' })
    expect(gizmoFaceColors(createSolvedCube(2), 2).F).toBe('G')
  })

  it.each([3, 5, 7])(
    'tracks M, E, and S by the fixed centers on a %i cube',
    (size) => {
      const solved = createSolvedCube(size)
      const middle = (size + 1) / 2
      for (const face of ['L', 'D', 'F'] as const) {
        const slice = applyCubeLayerMove(solved, size, face, middle, 1)
        const axis = applyCubeLayerMove(solved, size, face, size, 1, size)
        expect(gizmoFaceColors(slice, size)).toEqual(
          gizmoFaceColors(axis, size),
        )
      }
    },
  )
})
