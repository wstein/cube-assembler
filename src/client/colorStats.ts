// Per-color counts and OKLCH spreads of a capture, saved with fixtures:
// typed entry point for src/core/color/ColorStats.res.
import { computeColorStats as computeColorStatsRes } from '../core/color/ColorStats.gen'
import type { RGB } from './imageProcessing'

export interface ColorStat {
  count: number
  expected: number
  lightness: { min: number; max: number } | null
  chroma: { min: number; max: number } | null
  hue: { min: number; max: number } | null
  hueOverlapsWith: string[]
}

export function computeColorStats(
  capturedFaces: Record<string, { colors: string[][]; cellColors?: RGB[][] }>,
  puzzleSize: number,
): Record<string, ColorStat> {
  return computeColorStatsRes(capturedFaces, puzzleSize)
}
