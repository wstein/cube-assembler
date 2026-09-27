import { describe, expect, expectTypeOf, it } from 'vitest'
import { stickerCount } from '../src/cube/InteropPilot.gen'

describe('ReScript to TypeScript interop', () => {
  it('exports a typed cube calculation through genType', () => {
    expectTypeOf(stickerCount).toEqualTypeOf<(size: number) => number>()
    expect(stickerCount(2)).toBe(24)
    expect(stickerCount(3)).toBe(54)
    expect(stickerCount(7)).toBe(294)
  })
})
