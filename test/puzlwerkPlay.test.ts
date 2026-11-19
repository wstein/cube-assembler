import { describe, expect, it } from 'vitest'
import { mountMainPlay } from '../src/client/view3d/puzlwerkPlay'
import { createSolvedCube } from '../src/cube/cubeAssembly'

const PALETTE = {
  W: '#ffffff',
  R: '#ff0000',
  G: '#00ff00',
  Y: '#ffff00',
  O: '#ff8800',
  B: '#0000ff',
}
const ok = { ok: true as const, value: undefined }

// A stage and child that accept everything and record the transitions the player asks the scene for.
function fakeStage(gate?: Promise<void>) {
  const transitions: { pieceIds: readonly string[]; axis: number[] }[] = []
  const child = {
    setProjection: async () => ok,
    dispose: () => {},
    transition: async (t: { pieceIds: readonly string[]; axis: number[] }) => {
      transitions.push(t)
      await gate
      return ok
    },
    beginPreview: () => ({ ok: false, error: { code: 'Unavailable' } }),
    cancel: () => ok,
  }
  let mode: 'view' | 'play' = 'view'
  const stage = {
    addCube: () => ({ ok: true as const, value: child }),
    setPlayTarget: () => ok,
    setInteractionMode: (value: 'view' | 'play') => {
      mode = value
      return ok
    },
    getInteractionMode: () => mode,
  }
  return { stage, transitions }
}

const ready = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('an app turn played on the main player', () => {
  for (const size of [2, 3, 4, 7]) {
    it(`turns the layer of the size ${size} cube it was made for`, async () => {
      const { stage, transitions } = fakeStage()
      const play = mountMainPlay({
        stage: stage as never,
        cube: createSolvedCube(size),
        size,
        palette: PALETTE,
        layerMoves: true,
        seamWide: false,
        onProblem: () => {},
        onMode: () => {},
        onShown: () => {},
      })
      await ready()
      const played = await play.turn({ face: 'R', depth: 1, turns: 1 }, 0)
      expect(played).toBe(true)
      expect(transitions).toHaveLength(1)
      // The outer layer of an n cube holds n*n pieces less the hidden inner ones: 4 corners, 4(n-2) edges and (n-2)^2 centers.
      const layer = 4 + 4 * (size - 2) + (size - 2) ** 2
      expect(transitions[0].pieceIds).toHaveLength(layer)
      expect(transitions[0].axis).toEqual([1, 0, 0])
    })
  }

  it('is not counted when the player is disposed while the turn plays', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { stage, transitions } = fakeStage(gate)
    const play = mountMainPlay({
      stage: stage as never,
      cube: createSolvedCube(3),
      size: 3,
      palette: PALETTE,
      layerMoves: true,
      seamWide: false,
      onProblem: () => {},
      onMode: () => {},
      onShown: () => {},
    })
    await ready()
    const playing = play.turn({ face: 'R', depth: 1, turns: 1 }, 0)
    await ready()
    expect(transitions).toHaveLength(1)
    play.dispose()
    release()
    expect(await playing).toBe(false)
  })

  it('is refused after dispose', async () => {
    const { stage } = fakeStage()
    const play = mountMainPlay({
      stage: stage as never,
      cube: createSolvedCube(3),
      size: 3,
      palette: PALETTE,
      layerMoves: true,
      seamWide: false,
      onProblem: () => {},
      onMode: () => {},
      onShown: () => {},
    })
    await ready()
    play.dispose()
    expect(await play.turn({ face: 'R', depth: 1, turns: 1 }, 0)).toBe(false)
  })
})
