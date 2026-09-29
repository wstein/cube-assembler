import { describe, expect, it } from 'vitest'
import {
  advanceColorFrame,
  initialColorFrame,
} from '../src/core/view/AxisGizmo.gen'
import { createSolvedCube } from '../src/cube/cubeAssembly'
import {
  applyCubeLayerMove,
  generateScrambleMoves,
} from '../src/cube/cubeMoves'

const standardFrame = {
  u: 'W',
  r: 'R',
  f: 'G',
  d: 'Y',
  l: 'O',
  b: 'B',
}

describe('axis color reference frame', () => {
  it.each([2, 4, 6])('uses a logical frame for a mixed %i cube', (size) => {
    let cube = createSolvedCube(size)
    for (const face of ['U', 'R', 'F', 'D'] as const)
      cube = applyCubeLayerMove(cube, size, face, 1, 1, 1)
    expect(initialColorFrame(cube, size)).toEqual(standardFrame)
  })

  it.each([2, 4, 6])(
    'keeps the %i cube frame through face, inner and wide turns',
    (size) => {
      let frame = initialColorFrame(createSolvedCube(size), size)
      for (const face of ['U', 'R', 'F', 'D', 'L', 'B'] as const)
        frame = advanceColorFrame(frame, size, face, 1, 1, 1)
      for (let depth = 2; depth < size; depth++)
        frame = advanceColorFrame(frame, size, 'R', depth, 1, 1)
      frame = advanceColorFrame(frame, size, 'U', Math.min(3, size - 1), -1, 2)
      expect(frame).toEqual(standardFrame)
    },
  )

  it.each([2, 4, 6])('rotates the %i cube frame with x, y and z', (size) => {
    const start = initialColorFrame(createSolvedCube(size), size)
    const x = advanceColorFrame(start, size, 'R', size, 1, size)
    const y = advanceColorFrame(start, size, 'U', size, 1, size)
    const z = advanceColorFrame(start, size, 'F', size, 1, size)
    expect(x).toMatchObject({ u: 'G', f: 'Y', r: 'R' })
    expect(y).toMatchObject({ u: 'W', f: 'R', r: 'B' })
    expect(z).toMatchObject({ u: 'O', r: 'W', f: 'G' })
    expect(advanceColorFrame(y, size, 'U', size, -1, size)).toEqual(start)
  })

  it.each([3, 5, 7])(
    'preserves the middle-slice reference change on a %i cube',
    (size) => {
      const start = initialColorFrame(createSolvedCube(size), size)
      const middle = (size + 1) / 2
      for (const face of ['L', 'D', 'F'] as const) {
        const slice = advanceColorFrame(start, size, face, middle, 1, 1)
        const axis = advanceColorFrame(start, size, face, size, 1, size)
        expect(slice).toEqual(axis)
      }
      expect(advanceColorFrame(start, size, 'R', middle - 1, 1, 1)).toEqual(
        start,
      )
      expect(advanceColorFrame(start, size, 'R', middle, 1, 2)).toEqual(
        advanceColorFrame(start, size, 'R', size, 1, size),
      )
    },
  )

  it('starts odd cubes from fixed centers, including a rotated import', () => {
    const rotated = applyCubeLayerMove(createSolvedCube(3), 3, 'U', 3, 1, 3)
    expect(initialColorFrame(rotated, 3)).toMatchObject({ u: 'W', f: 'R' })
  })

  it.each([3, 5, 7])(
    'tracks fixed centers through a sequence of %i cube turns',
    (size) => {
      let cube = createSolvedCube(size)
      let frame = initialColorFrame(cube, size)
      const middle = (size + 1) / 2
      const turns = [
        { face: 'U', depth: size, width: size, turns: 1 },
        { face: 'R', depth: 1, width: 1, turns: -1 },
        { face: 'D', depth: middle, width: 1, turns: 1 },
        { face: 'F', depth: middle, width: 2, turns: -1 },
        { face: 'L', depth: middle, width: 1, turns: 2 },
        { face: 'B', depth: 1, width: 1, turns: 1 },
      ] as const
      for (const move of turns) {
        cube = applyCubeLayerMove(
          cube,
          size,
          move.face,
          move.depth,
          move.turns,
          move.width,
        )
        frame = advanceColorFrame(
          frame,
          size,
          move.face,
          move.depth,
          move.turns,
          move.width,
        )
        expect(frame).toEqual(initialColorFrame(cube, size))
      }
    },
  )

  it.each([2, 4, 6])(
    'restores the %i cube frame with inverse moves and ignores Scramble turns',
    (size) => {
      const initial = initialColorFrame(createSolvedCube(size), size)
      let frame = advanceColorFrame(initial, size, 'U', size, 1, size)
      frame = advanceColorFrame(frame, size, 'R', 1, 1, 1)
      frame = advanceColorFrame(frame, size, 'R', 1, -1, 1)
      expect(frame).not.toEqual(initial)
      frame = advanceColorFrame(frame, size, 'U', size, -1, size)
      expect(frame).toEqual(initial)
      for (const move of generateScrambleMoves(size, {
        length: 'short',
        innerLayers: true,
      }))
        frame = advanceColorFrame(
          frame,
          size,
          move.face,
          move.depth,
          move.turns,
          move.width ?? 1,
        )
      expect(frame).toEqual(initial)
    },
  )
})
