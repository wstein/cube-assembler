import { describe, expect, it } from 'vitest'
import {
  miniCamera,
  miniCubeAxes,
  miniCubeFaceColors,
  miniCubeFaces,
} from '../src/core/view/MiniCube.gen'
import { pickCubeSurface } from '../src/client/cubeGesture'
import { createSolvedCube } from '../src/cube/cubeAssembly'
import { applyCubeLayerMove } from '../src/cube/cubeMoves'
import { ISOMETRIC_PITCH, ISOMETRIC_YAW } from '../src/client/cubeView3DState'

const iso = miniCamera(96, 96, ISOMETRIC_PITCH, ISOMETRIC_YAW)
const centroid = (points: ReadonlyArray<readonly [number, number]>) => [
  points.reduce((sum, [x]) => sum + x, 0) / points.length,
  points.reduce((sum, [, y]) => sum + y, 0) / points.length,
]

describe('mini cube', () => {
  it('shows U, R and F from the isometric view, drawn back to front', () => {
    const faces = miniCubeFaces(iso)
    expect(faces.map((face) => face.face).sort()).toEqual(['F', 'R', 'U'])
    for (const face of faces) expect(face.points).toHaveLength(4)
  })

  it('shows only the front face when looking at it straight on', () => {
    expect(
      miniCubeFaces(miniCamera(96, 96, 0, 0)).map((face) => face.face),
    ).toEqual(['F'])
  })

  it('draws each face where a pointer picks that face', () => {
    for (const { face, points } of miniCubeFaces(iso)) {
      const [x, y] = centroid(points)
      expect(pickCubeSurface(x, y, iso)?.face).toBe(face)
    }
  })

  it('keeps the whole cube and its X/Y/Z arrows inside the gizmo', () => {
    const inside = ([x, y]: readonly [number, number]) =>
      x > 0 && x < 96 && y > 0 && y < 96
    for (const { points } of miniCubeFaces(iso))
      expect(points.every(inside)).toBe(true)
    const axes = miniCubeAxes(iso)
    expect(axes.map((axis) => axis.name).sort()).toEqual(['x', 'y', 'z'])
    for (const axis of axes) {
      expect(inside(axis.tip)).toBe(true)
      expect(inside(axis.label)).toBe(true)
    }
  })

  it('points X, Y and Z through the R, U and F faces, toward the viewer here', () => {
    const axes = miniCubeAxes(iso)
    expect(
      Object.fromEntries(axes.map((axis) => [axis.name, axis.face])),
    ).toEqual({ x: 'R', y: 'U', z: 'F' })
    expect(axes.every((axis) => axis.front)).toBe(true)
  })

  it('colors each face by the stickers it shows now', () => {
    expect(miniCubeFaceColors(createSolvedCube(3), 3)).toEqual({
      U: 'W',
      R: 'R',
      F: 'G',
      D: 'Y',
      L: 'O',
      B: 'B',
    })
    // After y the front shows what was on the right.
    const turned = applyCubeLayerMove(createSolvedCube(4), 4, 'U', 4, 1, 4)
    const colors = miniCubeFaceColors(turned, 4)
    expect(colors.F).toBe('R')
    expect(colors.U).toBe('W')
  })

  it('reads a scrambled face by its center majority', () => {
    let cube = createSolvedCube(5)
    cube = applyCubeLayerMove(cube, 5, 'R', 1, 1, 1)
    cube = applyCubeLayerMove(cube, 5, 'U', 1, 1, 1)
    expect(miniCubeFaceColors(cube, 5)).toMatchObject({ U: 'W', F: 'G' })
    expect(miniCubeFaceColors(createSolvedCube(2), 2).F).toBe('G')
  })
})
