import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSolvedCube } from '../src/cube/cubeAssembly'
import { initialColorFrame } from '../src/core/view/AxisGizmo.gen'
import {
  applyCubeLayerMove,
  type CubeTurn,
} from '../src/client/view3d/cubeView3DState'
import {
  usePuzlwerkTurns,
  type PuzlwerkTurnsOptions,
} from '../src/client/view3d/usePuzlwerkTurns'
import type { MainPlay } from '../src/client/view3d/puzlwerkPlay'
import { playFinishedTurnClick } from '../src/client/view3d/turnSound'
import { renderHook } from './support/hookHarness'

vi.mock('preact/hooks', () => import('./support/hookHarness'))
vi.mock('../src/client/view3d/turnSound', async (original) => ({
  ...(await original<typeof import('../src/client/view3d/turnSound')>()),
  playFinishedTurnClick: vi.fn(),
}))

// A player whose turns end when the test says so.
function controlledPlay() {
  const calls: { turn: CubeTurn; ms: number; end: (ok: boolean) => void }[] = []
  const play: MainPlay = {
    setLayerMoves: () => {},
    dispose: () => {},
    turn: (turn, ms) =>
      new Promise<boolean>((resolve) => {
        calls.push({ turn, ms, end: resolve })
      }),
  }
  return { play, calls }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function setup(
  size = 3,
  moves: CubeTurn[] = [],
  renderOptions: { deferEffects?: boolean } = {},
) {
  const source = createSolvedCube(size)
  const { play, calls } = controlledPlay()
  const onChange = vi.fn()
  const options = (over: Partial<PuzlwerkTurnsOptions> = {}) => ({
    size,
    source,
    moves,
    onTurnStateChange: onChange,
    playRef: { current: play },
    ...over,
  })
  const base = options()
  const hook = renderHook(
    (p: PuzlwerkTurnsOptions) => usePuzlwerkTurns(p),
    base,
    renderOptions,
  )
  hook.flushEffects()
  return { hook, calls, onChange, source, options, base, play }
}

beforeEach(() => {
  vi.stubGlobal('document', { cookie: '' })
  vi.mocked(playFinishedTurnClick).mockClear()
})

describe('the click of a finished turn', () => {
  it('sounds once for a finished scramble step and for an undo', async () => {
    const { hook, calls } = setup(3, [{ face: 'R', depth: 1, turns: 1 }])
    hook.result.current.toggleScramble()
    calls[0].end(true)
    await settle()
    expect(playFinishedTurnClick).toHaveBeenCalledTimes(1)
    // Stop: the step in progress still ends and clicks.
    hook.result.current.toggleScramble()
    hook.flush()
    calls[1].end(true)
    await settle()
    expect(playFinishedTurnClick).toHaveBeenCalledTimes(2)
    void hook.result.current.undo()
    expect(calls).toHaveLength(3)
    calls[2].end(true)
    await settle()
    expect(playFinishedTurnClick).toHaveBeenCalledTimes(3)
  })

  it('stays silent for a turn the player refused or that ends after Reset, Random State or unmount', async () => {
    const refused = setup()
    refused.hook.result.current.toggleScramble()
    refused.calls[0].end(false)
    await settle()
    const reset = setup()
    reset.hook.result.current.toggleScramble()
    reset.hook.result.current.reset()
    reset.calls[0].end(true)
    const random = setup()
    random.hook.result.current.toggleScramble()
    random.hook.result.current.randomState()
    random.calls[0].end(true)
    const gone = setup()
    gone.hook.result.current.toggleScramble()
    gone.hook.unmount()
    gone.calls[0].end(true)
    await settle()
    expect(playFinishedTurnClick).not.toHaveBeenCalled()
  })
})

describe('turns the viewer finished', () => {
  it('records a finished scramble step and reports the new state', async () => {
    const { hook, calls, onChange, source } = setup(5)
    hook.result.current.toggleScramble()
    hook.flush()
    expect(calls).toHaveLength(1)
    const turn = calls[0].turn
    calls[0].end(true)
    await settle()
    hook.flush()
    const expected = applyCubeLayerMove(
      source,
      5,
      turn.face,
      turn.depth,
      turn.turns,
      turn.width ?? 1,
    )
    expect(hook.result.current.state.moves).toEqual([turn])
    expect(hook.result.current.state.cube).toEqual(expected)
    expect(onChange).toHaveBeenCalledTimes(1)
    const [cube, moves, frame] = onChange.mock.calls[0]
    expect(cube).toEqual(expected)
    expect(moves).toEqual([turn])
    expect(frame).toEqual(hook.result.current.state.frame)
  })

  it('plays the next step after a finished one, with the scramble duration', async () => {
    const { hook, calls } = setup()
    hook.result.current.toggleScramble()
    calls[0].end(true)
    await settle()
    expect(calls).toHaveLength(2)
    expect(calls[1].ms).toBeGreaterThan(0)
  })

  it('records an undo and reports it', async () => {
    const turn: CubeTurn = { face: 'R', depth: 1, turns: 1 }
    const { hook, calls, onChange } = setup(3, [turn])
    void hook.result.current.undo()
    expect(calls[0].turn).toEqual({ ...turn, turns: -1 })
    calls[0].end(true)
    await settle()
    hook.flush()
    expect(hook.result.current.state.moves).toEqual([])
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('does not record a step the player refused', async () => {
    const { hook, calls, onChange } = setup()
    hook.result.current.toggleScramble()
    calls[0].end(false)
    await settle()
    hook.flush()
    expect(hook.result.current.state.moves).toEqual([])
    expect(hook.result.current.scrambling).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('a turn that ends after the shown cube changed is dropped', () => {
  it('after Reset', async () => {
    const { hook, calls, onChange } = setup(5)
    hook.result.current.toggleScramble()
    hook.result.current.reset()
    hook.flush()
    calls[0].end(true)
    await settle()
    hook.flush()
    expect(hook.result.current.state.moves).toEqual([])
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][1]).toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('after Random State', async () => {
    const { hook, calls, onChange } = setup(5)
    hook.result.current.toggleScramble()
    hook.result.current.randomState()
    hook.flush()
    const random = hook.result.current.state.cube
    calls[0].end(true)
    await settle()
    hook.flush()
    expect(hook.result.current.state.moves).toEqual([])
    expect(hook.result.current.state.cube).toBe(random)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toBe(random)
  })

  it('after a new source of another size', async () => {
    const { hook, calls, onChange, options } = setup(5)
    hook.result.current.toggleScramble()
    const next = createSolvedCube(4)
    hook.rerender(options({ size: 4, source: next }))
    hook.flush()
    calls[0].end(true)
    await settle()
    hook.flush()
    expect(hook.result.current.state.cube).toBe(next)
    expect(hook.result.current.state.moves).toEqual([])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('after a size change without a new source yet', async () => {
    const { hook, calls, onChange, options, source } = setup(5)
    hook.result.current.toggleScramble()
    hook.rerender(options({ size: 4 }))
    calls[0].end(true)
    await settle()
    hook.flush()
    expect(hook.result.current.state.cube).toBe(source)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('after unmount', async () => {
    const { hook, calls, onChange } = setup()
    hook.result.current.toggleScramble()
    hook.unmount()
    calls[0].end(true)
    await settle()
    expect(onChange).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
  })

  it('for an undo that ends after Reset', async () => {
    const turn: CubeTurn = { face: 'R', depth: 1, turns: 1 }
    const { hook, calls, onChange } = setup(3, [turn])
    void hook.result.current.undo()
    hook.result.current.reset()
    hook.flush()
    calls[0].end(true)
    await settle()
    hook.flush()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(hook.result.current.state.moves).toEqual([])
  })
})

describe('between the render of a new source and its effect', () => {
  // Preact runs effects after the paint: a step can end after the render that brought the new source.
  it('drops a turn that ends there, for a source of the same size', async () => {
    const { hook, calls, onChange, options } = setup(5, [], {
      deferEffects: true,
    })
    hook.result.current.toggleScramble()
    const next = createSolvedCube(5)
    hook.rerender(options({ source: next }))
    calls[0].end(true)
    await settle()
    hook.flushEffects()
    hook.flush()
    hook.flushEffects()
    expect(hook.result.current.state.cube).toBe(next)
    expect(hook.result.current.state.moves).toEqual([])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps a turn that ends after a render with the same source', async () => {
    const { hook, calls, onChange, options } = setup(5, [], {
      deferEffects: true,
    })
    hook.result.current.toggleScramble()
    hook.rerender(options())
    calls[0].end(true)
    await settle()
    hook.flush()
    expect(hook.result.current.state.moves).toHaveLength(1)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('drops a turn when the view asks for it (another player is made for the cube)', async () => {
    const { hook, calls, onChange } = setup(5)
    hook.result.current.toggleScramble()
    hook.result.current.invalidate()
    calls[0].end(true)
    await settle()
    hook.flush()
    expect(hook.result.current.state.moves).toEqual([])
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Stop', () => {
  it('keeps the step in progress and plays no further one', async () => {
    const { hook, calls, onChange } = setup()
    hook.result.current.toggleScramble()
    hook.result.current.toggleScramble()
    hook.flush()
    expect(hook.result.current.scrambling).toBe(false)
    calls[0].end(true)
    await settle()
    hook.flush()
    expect(hook.result.current.state.moves).toHaveLength(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(1)
  })
})

describe('the starting state', () => {
  it('is the cube given with its frame', () => {
    const { hook, source } = setup()
    expect(hook.result.current.state.cube).toBe(source)
    expect(hook.result.current.state.frame).toEqual(
      initialColorFrame(source, 3),
    )
    expect(hook.result.current.isInitial).toBe(true)
  })
})
