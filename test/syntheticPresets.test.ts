import { describe, expect, it } from 'vitest'
import { PRESETS, renderFace } from '../src/client/vision/syntheticFace'
import { extractColorsFromImageData } from '../src/client/vision/faceDetection'
import { NEUTRAL_GAINS } from '../src/client/vision/colorMath'
import { DEFAULT_SAMPLING } from '../src/client/vision/stickerColorGeometry'

// Every lighting preset against the app's own face detection: each sticker
// of a rendered face must be read back as the color it was drawn in. A preset
// the detection misreads is a finding; it stays listed here as a known
// failure (it.fails) until the pipeline handles it, and the test turns red
// when it starts to pass, so the list cannot go stale.
const SIZE = 300
const SIZES = [2, 3, 4, 5, 7]
const SEEDS = [1, 2, 3]
const LETTERS = 'WYORGB'

// Single-face detection has no other face to compare with, so a color cast
// over the whole photo (red up and blue down, or a dim warm lamp) moves
// stickers into their neighbors' colors.
const MISREAD = new Set(['gradient', 'dim-warm'])

function grid(n: number, seed: number): string[][] {
  return Array.from({ length: n }, (_, r) =>
    Array.from(
      { length: n },
      (_, c) => LETTERS[(r * 2 + c * 3 + ((r * c) % 5) + seed) % 6],
    ),
  )
}

// The stickers of every size and seed the detection reads wrongly.
function misreads(preset: string) {
  const wrong: string[] = []
  for (const n of SIZES)
    for (const seed of SEEDS) {
      const colors = grid(n, seed)
      const read = extractColorsFromImageData(
        renderFace(colors, preset, seed, SIZE),
        SIZE,
        SIZE,
        n,
        NEUTRAL_GAINS,
        DEFAULT_SAMPLING,
      ).colors
      colors.forEach((row, r) =>
        row.forEach((color, c) => {
          if (read[r][c] !== color)
            wrong.push(
              `${n}x${n} seed ${seed} (${r},${c}): ${color}->${read[r][c]}`,
            )
        }),
      )
    }
  return wrong
}

describe('synthetic presets against the face detection', () => {
  for (const preset of PRESETS)
    (MISREAD.has(preset) ? it.fails : it)(
      `reads every sticker of the ${preset} preset back as drawn`,
      () => {
        expect(misreads(preset)).toEqual([])
      },
      120_000,
    )
})
