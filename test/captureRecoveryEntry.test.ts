import { describe, expect, it } from 'vitest'
import { canAdjustCapture } from '../src/client/capture/captureReviewRouting'

describe('capture recovery entry', () => {
  it.each([0, 1, 3])('does not depend on %i retained candidates', (count) => {
    expect(canAdjustCapture(6, count, true)).toBe(true)
    expect(canAdjustCapture(6, count, false)).toBe(true)
  })
  it('requires the six source faces rather than solver alternatives', () => {
    expect(canAdjustCapture(5, 3, true)).toBe(false)
  })
})
