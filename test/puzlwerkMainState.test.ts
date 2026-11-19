import { createPlayer } from '@puzlwerk/viewer/bridge'
import {
  cubeStateDocuments,
  cubeStateFromWire,
  cubeTurnToMove,
  moveToCubeTurn,
} from '@puzlwerk/viewer/bridge/cube-state'
import { describe, expect, it } from 'vitest'
import { parityStatus } from '../src/client/capture/captureFlow'
import {
  advanceColorFrame,
  initialColorFrame,
} from '../src/core/view/AxisGizmo.gen'
import {
  applyCubeLayerMove,
  generateScrambleMoves,
  type CubeTurn,
} from '../src/client/view3d/cubeView3DState'
import {
  afterReset,
  afterShownCube,
  afterTurn,
  afterUndo,
  committedTurn,
  isInitialState,
  randomShownCube,
  scrambleTurns,
  startTurnState,
  undoTurn,
} from '../src/client/view3d/puzlwerkMainState'
import { createSolvedCube } from '../src/cube/cubeAssembly'
import { ALL_SIZES } from './cubeSizes'

const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const
const PALETTE = {
  W: '#ffffff',
  R: '#ff0000',
  G: '#00ff00',
  Y: '#ffff00',
  O: '#ff8800',
  B: '#0000ff',
}

// A deterministic stream of numbers in [0, 1).
const lcg = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

describe('turn state of the main view', () => {
  const size = 3
  const solved = createSolvedCube(size)
  const start = () => startTurnState(solved, [], undefined, size)

  it('starts with the cube, its moves and the color frame of that cube', () => {
    const state = start()
    expect(state.cube).toBe(solved)
    expect(state.moves).toEqual([])
    expect(state.frame).toEqual(initialColorFrame(solved, size))
    expect(isInitialState(state, solved)).toBe(true)
  })

  it('keeps a given frame and moves', () => {
    const frame = initialColorFrame(createSolvedCube(3), 3)
    const moves: CubeTurn[] = [{ face: 'R', depth: 1, turns: 1 }]
    const state = startTurnState(solved, moves, frame, size)
    expect(state.frame).toBe(frame)
    expect(state.moves).toEqual(moves)
    // Whether the cube is the initial one depends on the cube alone; the move list is checked apart.
    expect(isInitialState(state, solved)).toBe(true)
  })

  it('applies a turn to the cube, the move list and the frame', () => {
    const turn: CubeTurn = { face: 'R', depth: 1, turns: 1 }
    const next = afterTurn(start(), size, turn)
    expect(next.cube).toEqual(applyCubeLayerMove(solved, size, 'R', 1, 1, 1))
    expect(next.moves).toEqual([turn])
    expect(isInitialState(next, solved)).toBe(false)
  })

  it('carries the color frame along with a whole-cube turn', () => {
    const whole: CubeTurn = { face: 'R', depth: 3, width: 3, turns: 1 }
    const next = afterTurn(start(), size, whole)
    expect(next.frame).toEqual(
      advanceColorFrame(start().frame, size, 'R', 3, 1, 3),
    )
    expect(next.frame).not.toEqual(start().frame)
    // A turn of one outer layer leaves the frame alone.
    expect(
      afterTurn(start(), size, { face: 'U', depth: 1, turns: 1 }).frame,
    ).toEqual(start().frame)
  })

  it('merges consecutive turns of one layer like the existing history', () => {
    const turn: CubeTurn = { face: 'R', depth: 1, turns: 1 }
    const twice = afterTurn(afterTurn(start(), size, turn), size, turn)
    expect(twice.moves).toEqual([{ face: 'R', depth: 1, turns: 2 }])
    const back = afterTurn(twice, size, { ...turn, turns: -2 })
    expect(back.moves).toEqual([])
    expect(back.cube).toEqual(solved)
  })

  it('undoes the last move by its inverse and drops it from the list', () => {
    const a: CubeTurn = { face: 'R', depth: 1, turns: 1 }
    const b: CubeTurn = { face: 'U', depth: 1, turns: 2 }
    const state = afterTurn(afterTurn(start(), size, a), size, b)
    expect(undoTurn(state)).toEqual({ face: 'U', depth: 1, turns: -2 })
    const undone = afterUndo(state, size)
    expect(undone.moves).toEqual([a])
    expect(undone.cube).toEqual(afterTurn(start(), size, a).cube)
    expect(undone.frame).toEqual(afterTurn(start(), size, a).frame)
    expect(undoTurn(start())).toBeUndefined()
    expect(afterUndo(start(), size)).toEqual(start())
  })

  it('undoes a wide inner block with its width', () => {
    const wide: CubeTurn = { face: 'F', depth: 3, width: 2, turns: -1 }
    const big = createSolvedCube(5)
    const state = afterTurn(startTurnState(big, [], undefined, 5), 5, wide)
    expect(undoTurn(state)).toEqual({ ...wide, turns: 1 })
    expect(afterUndo(state, 5).cube).toEqual(big)
  })

  it('resets to the source cube with no moves and its frame', () => {
    const turned = afterTurn(start(), size, {
      face: 'U',
      depth: 1,
      turns: 1,
    })
    const reset = afterReset(solved, size)
    expect(turned.cube).not.toEqual(solved)
    expect(reset.cube).toBe(solved)
    expect(reset.moves).toEqual([])
    expect(reset.frame).toEqual(initialColorFrame(solved, size))
  })

  it('shows another cube with no history and its own frame', () => {
    const random = randomShownCube(size, lcg(3))
    const shown = afterShownCube(random, size)
    expect(shown.cube).toBe(random)
    expect(shown.moves).toEqual([])
    expect(shown.frame).toEqual(initialColorFrame(random, size))
  })
})

describe('scramble and random state', () => {
  it.each(ALL_SIZES)(
    'a scramble at size %i has the length of the option',
    (n) => {
      const options = { length: 'normal' as const, innerLayers: true }
      const turns = scrambleTurns(n, options, lcg(n))
      expect(turns).toEqual(generateScrambleMoves(n, options, lcg(n)))
      expect(turns.length).toBeGreaterThan(0)
      const short = scrambleTurns(n, { length: 'short' }, lcg(n)).length
      const long = scrambleTurns(n, { length: 'long' }, lcg(n)).length
      expect(short).toBeLessThan(turns.length)
      expect(long).toBeGreaterThan(turns.length)
    },
  )

  it('a scramble without inner layers turns only outer layers', () => {
    const turns = scrambleTurns(5, { innerLayers: false }, lcg(1))
    expect(turns.every((t) => t.depth === 1)).toBe(true)
  })

  it.each(ALL_SIZES)('a random state at size %i is a valid cube', (n) => {
    for (let seed = 1; seed <= 5; seed += 1) {
      const cube = randomShownCube(n, lcg(seed))
      const verdict = parityStatus(cube, n)
      expect(verdict.valid, `${n}x${n} seed ${seed}: ${verdict.result}`).toBe(
        true,
      )
    }
  })

  it('a random state differs between draws', () => {
    expect(randomShownCube(4, lcg(1))).not.toEqual(randomShownCube(4, lcg(2)))
  })
})

// The player of the viewer bridge with a scene that accepts every transition: its wire state is the
// oracle for the state the app holds.
const quietScene = {
  transition: async () => ({ ok: true as const, value: undefined }),
  beginPreview: () => ({ ok: false as const, error: { code: 'Unavailable' } }),
  cancel: () => ({ ok: true as const, value: undefined }),
  dispose: () => {},
}

describe('the held state equals the wire state read back, sizes 2..15', () => {
  it.each(ALL_SIZES)(
    'after random turns at size %i',
    async (n) => {
      const solved = createSolvedCube(n)
      const documents = cubeStateDocuments(n, solved, PALETTE, {
        movePolicy: 'any',
      })
      if (!documents.ok) throw new Error(documents.error.code)
      const { definition, state, appearance, options } = documents.value
      const made = createPlayer(
        definition,
        state,
        appearance,
        options,
        quietScene as never,
      )
      if (!made.ok) throw new Error(made.error.code)
      const player = made.value
      let held = startTurnState(solved, [], undefined, n)
      const random = lcg(n * 7919)
      for (let i = 0; i < 25; i += 1) {
        const width = 1 + Math.floor(random() * Math.max(1, Math.floor(n / 2)))
        const depth = width + Math.floor(random() * (n - width + 1))
        const turn: CubeTurn = {
          face: FACES[Math.floor(random() * 6)],
          depth,
          ...(width > 1 ? { width } : {}),
          turns: [1, -1, 2][Math.floor(random() * 3)],
        }
        const move = cubeTurnToMove(n, turn)
        if (!move.ok) throw new Error(move.error.code)
        const turned = await player.turn(
          move.value.axis,
          move.value.layers,
          move.value.turns,
          0,
        )
        expect(turned.ok).toBe(true)
        // The turn the app records is the one the wire move maps back to.
        const back = moveToCubeTurn(n, move.value)
        if (!back.ok) throw new Error(back.error.code)
        held = afterTurn(held, n, back.value)
        const read = cubeStateFromWire(n, player.state(), appearance)
        if (!read.ok) throw new Error(read.error.code)
        expect(read.value, `${n}x${n} turn ${i}`).toEqual(held.cube)
      }
      player.dispose()
    },
    60_000,
  )

  it('a random state read back from its own documents', () => {
    for (const n of [2, 3, 7, 15]) {
      const cube = randomShownCube(n, lcg(n))
      const documents = cubeStateDocuments(n, cube, PALETTE, {
        movePolicy: 'any',
      })
      if (!documents.ok) throw new Error(documents.error.code)
      const read = cubeStateFromWire(
        n,
        documents.value.state,
        documents.value.appearance,
      )
      if (!read.ok) throw new Error(read.error.code)
      expect(read.value).toEqual(cube)
    }
  })
})

describe('the turn a played gesture commits', () => {
  it('maps the selected layers and the committed quarter turns to the app turn', () => {
    expect(committedTurn(3, { axis: 'Y', layers: [2] }, 1)).toEqual({
      face: 'U',
      depth: 1,
      turns: -1,
    })
    expect(committedTurn(3, { axis: 'X', layers: [0] }, -1)).toEqual({
      face: 'L',
      depth: 1,
      turns: -1,
    })
    expect(committedTurn(5, { axis: 'Z', layers: [3, 4] }, 2)).toEqual({
      face: 'F',
      depth: 2,
      width: 2,
      turns: 2,
    })
  })

  it('names the whole cube by the positive face', () => {
    expect(committedTurn(4, { axis: 'X', layers: [0, 1, 2, 3] }, 1)).toEqual({
      face: 'R',
      depth: 4,
      width: 4,
      turns: -1,
    })
  })

  it('gives nothing for a selection that is no move', () => {
    expect(committedTurn(3, { axis: 'X', layers: [] }, 1)).toBeUndefined()
    expect(committedTurn(3, { axis: 'X', layers: [0, 2] }, 1)).toBeUndefined()
  })

  it('agrees with the wire turn of every layer and axis at sizes 2..15', () => {
    for (const n of ALL_SIZES)
      for (const axis of ['X', 'Y', 'Z'] as const)
        for (let layer = 0; layer < n; layer += 1) {
          const turn = committedTurn(n, { axis, layers: [layer] }, 1)
          expect(turn, `${n} ${axis} ${layer}`).toBeDefined()
          if (!turn) continue
          const move = cubeTurnToMove(n, turn)
          expect(move.ok && move.value).toEqual({
            axis,
            layers: [layer],
            turns: 1,
          })
        }
  })
})
