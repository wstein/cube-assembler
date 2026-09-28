// Learning the six sticker colors from a capture's own stickers: balanced
// k-means, glare and mixed-cluster detection, and the Hungarian assignment
// behind them. Typed entry point for src/core/color/StickerLearning.res
// (see there for the reasoning and tuning).
import {
  balancedAssign as balancedAssignRes,
  clearStickerColors as clearStickerColorsRes,
  glareStickers as glareStickersRes,
  glareWarningStickers,
  hungarianAssignment as hungarianAssignmentRes,
  learnStickerColors as learnStickerColorsRes,
  mixedUpClusters as mixedUpClustersRes,
} from '../core/color/StickerLearning.gen'
import { STICKER_COLORS, type RGB } from './stickerColorGeometry'

export interface StickerSample {
  rgb: RGB
  colorGuess: string
}

// Minimum-cost perfect matching on a square cost matrix:
// assignment[row] = column.
export function hungarianAssignment(cost: number[][]): number[] {
  return hungarianAssignmentRes(cost)
}

// Assigns each point to a centroid with every centroid taking an equal
// share, as cheaply as possible overall; `pinned[i]`, when set, is the
// cluster point i must take.
export function balancedAssign(
  points: RGB[],
  centroids: RGB[],
  pinned: Array<number | null> = [],
): number[] {
  return balancedAssignRes(points, centroids, pinned)
}

export interface LearnedColors {
  colors: Record<string, RGB>
  clusterSizes: Record<string, number>
  labelsBySampleIndex: string[]
  // Each sample's distance to its cluster's centroid computed without that
  // sample (leave-one-out).
  leaveOneOutDistances: number[]
  // Each sample's pinned color (see clearStickerColors), or null.
  clearLabels: Array<string | null>
  // Colors whose cluster likely mixed two colors (see mixedUpClusters).
  mixedUpColors: string[]
}

// The reference color each sticker unmistakably shows, or null.
export function clearStickerColors(
  points: RGB[],
  referencePalette: Record<string, RGB>,
): Array<string | null> {
  return clearStickerColorsRes(points, referencePalette)
}

// Glare on this many stickers is worth a warning.
export const GLARE_WARNING_STICKERS = glareWarningStickers

// The stickers glare washed out, compared within the capture.
export function glareStickers(
  points: RGB[],
  labels: string[],
  palette: Record<string, RGB>,
): number[] {
  return glareStickersRes(points, labels, palette)
}

// The clusters whose center is far from the points finally assigned to
// them - likely two colors mixed.
export function mixedUpClusters(
  points: RGB[],
  centroids: RGB[],
  assignment: number[],
): number[] {
  return mixedUpClustersRes(points, centroids, assignment)
}

// Learns each of the 6 sticker colors from the capture itself and labels
// every sticker by balanced assignment against them.
export function learnStickerColors(
  samples: StickerSample[],
  referencePalette: Record<string, RGB> = STICKER_COLORS,
  clearLabels: Array<string | null> = [],
): LearnedColors | null {
  return learnStickerColorsRes(samples, referencePalette, clearLabels)
}
