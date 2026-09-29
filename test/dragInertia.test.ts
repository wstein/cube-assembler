import { describe, expect, it } from 'vitest'
import { stepDragInertia } from '../src/client/view3d/dragInertia'

describe('stepDragInertia', () => {
  it('continues a released drag and slows it to a stop', () => {
    let velocity = 0.003
    let travelled = 0
    for (let frame = 0; frame < 90; frame++) {
      const step = stepDragInertia(velocity, 16)
      travelled += step.delta
      velocity = step.velocity
    }
    expect(travelled).toBeGreaterThan(0.4)
    expect(travelled).toBeLessThan(1)
    expect(velocity).toBe(0)
  })

  it('uses elapsed time so animation speed is independent of frame rate', () => {
    const oneFrame = stepDragInertia(0.002, 32)
    const first = stepDragInertia(0.002, 16)
    const second = stepDragInertia(first.velocity, 16)
    expect(first.delta + second.delta).toBeCloseTo(oneFrame.delta, 8)
    expect(second.velocity).toBeCloseTo(oneFrame.velocity, 8)
  })
})
