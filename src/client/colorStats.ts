import {
  hueCircularRange,
  hueRangesOverlap,
  linearRange,
  rgbToOKLCH,
  type RGB,
} from './imageProcessing'
import { FACE_ORDER } from './captureSteps'
import { COLOR_ORDER } from './stickerDisplay'

export interface ColorStat {
  count: number
  expected: number
  lightness: { min: number; max: number } | null
  chroma: { min: number; max: number } | null
  hue: { min: number; max: number } | null
  hueOverlapsWith: string[]
}

// Aggregates every captured sticker's detected color across all 6 faces,
// keyed by color letter - count (vs. the expected per-color total for this
// puzzle size) plus each color's OKLCH lightness/chroma/hue spread and
// which other colors' hue ranges it overlaps (the exact condition that
// produces boundary misclassifications between two colors). Saved as
// fixture metadata for later offline analysis - the review wizard flags
// individual stickers from cellLookalikes instead, since a whole color's
// hue range overlapping another's flagged every sticker of both colors.
export function computeColorStats(
  capturedFaces: Record<string, { colors: string[][]; cellColors?: RGB[][] }>,
  puzzleSize: number,
): Record<string, ColorStat> {
  const counts: Record<string, number> = { W: 0, O: 0, G: 0, R: 0, B: 0, Y: 0 }
  const oklchByColor: Record<string, { l: number; c: number; h: number }[]> = {
    W: [],
    O: [],
    G: [],
    R: [],
    B: [],
    Y: [],
  }
  for (const f of FACE_ORDER) {
    const grid = capturedFaces[f]?.colors
    const cellColors = capturedFaces[f]?.cellColors
    if (!grid) continue
    grid.forEach((row, r) =>
      row.forEach((color, c) => {
        if (!(color in counts)) return
        counts[color]++
        const rgb = cellColors?.[r]?.[c]
        if (rgb) oklchByColor[color].push(rgbToOKLCH(rgb))
      }),
    )
  }
  const hueRangeByColor: Record<
    string,
    ReturnType<typeof hueCircularRange>
  > = {}
  for (const color of COLOR_ORDER)
    hueRangeByColor[color] = hueCircularRange(
      oklchByColor[color].map((o) => o.h),
    )

  const expected = puzzleSize * puzzleSize
  const stats: Record<string, ColorStat> = {}
  for (const color of COLOR_ORDER) {
    const samples = oklchByColor[color]
    const range = hueRangeByColor[color]
    stats[color] = {
      count: counts[color],
      expected,
      lightness: linearRange(samples.map((o) => o.l)),
      chroma: linearRange(samples.map((o) => o.c)),
      hue: range,
      hueOverlapsWith: range
        ? COLOR_ORDER.filter((other) => {
            if (other === color) return false
            const otherRange = hueRangeByColor[other]
            return otherRange !== null && hueRangesOverlap(range, otherRange)
          })
        : [],
    }
  }
  return stats
}
