import { describe, expect, it } from 'vitest'
import {
  settleTurn,
  startTurn,
  turnFrame,
} from '../src/core/view/TurnAnimation.gen'
import { magneticSettleAngle, turnEase } from '../src/client/turnFeel'

const layer = { face: 'R' as const, depth: 1, axis: 0, sign: -1 }

describe('settling a released drag', () => {
  it('keeps the speed it was let go with', () => {
    expect(settleTurn(layer, 1.2, 1, 160, 0.003).speed).toBe(0.003)
  })

  it('is sucked onto the quarter turn when the magnetic snap is on', () => {
    const turn = startTurn(settleTurn(layer, 1.2, 1, 160, 0.003), 0, true, 90)
    for (const time of [0, 0.3, 0.6, 0.9, 1].map((f) => f * turn.duration))
      expect(turnFrame(turn, time).angle).toBeCloseTo(
        magneticSettleAngle(
          1.2,
          Math.PI / 2,
          0.003,
          turn.duration,
          time / turn.duration,
        ),
        12,
      )
    expect(turnFrame(turn, turn.duration)).toEqual({
      angle: Math.PI / 2,
      finished: true,
    })
  })

  it('eases out plainly with the magnetic snap off', () => {
    const turn = startTurn(settleTurn(layer, 1.2, 1, 160, 0.003), 0, false, 90)
    const half = turn.duration / 2
    expect(turnFrame(turn, half).angle).toBeCloseTo(
      1.2 + turnEase(0.5, false) * (Math.PI / 2 - 1.2),
      12,
    )
  })

  it('leaves other turns on the magnetic ease', () => {
    const turn = startTurn({ face: 'U', turns: 1, duration: 100 }, 0, true, 90)
    expect(turnFrame(turn, 50).angle).toBeCloseTo(
      turnEase(0.5, true) * (Math.PI / 2),
      12,
    )
  })
})
