import { describe, expect, it } from 'vitest'
import { unforcedColor } from '../src/client/capture/captureRecalibration'
import { STICKER_COLORS } from '../src/client/vision/stickerColorGeometry'

describe('a sticker the equal color share forced', () => {
  it('keeps the color it clearly is, when its assigned color barely matches', () => {
    // An orange sticker pushed into white to give white its share.
    expect(unforcedColor(STICKER_COLORS.O, 'W', STICKER_COLORS)).toBe('O')
    // A blue one too.
    expect(unforcedColor(STICKER_COLORS.B, 'W', STICKER_COLORS)).toBe('B')
  })

  it('leaves a sticker that matches its assigned color', () => {
    expect(unforcedColor(STICKER_COLORS.W, 'W', STICKER_COLORS)).toBeNull()
    expect(unforcedColor(STICKER_COLORS.O, 'O', STICKER_COLORS)).toBeNull()
  })

  it('moves a sticker onto another color only within 30 points of its best match', () => {
    // Halfway between orange and yellow: both match about equally well, so
    // the share may put it on either.
    const between = {
      r: (STICKER_COLORS.O.r + STICKER_COLORS.Y.r) / 2,
      g: (STICKER_COLORS.O.g + STICKER_COLORS.Y.g) / 2,
      b: (STICKER_COLORS.O.b + STICKER_COLORS.Y.b) / 2,
    }
    expect(unforcedColor(between, 'O', STICKER_COLORS)).toBeNull()
    expect(unforcedColor(between, 'Y', STICKER_COLORS)).toBeNull()
  })
})
