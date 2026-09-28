// Learning the six sticker colors from a capture's own stickers: balanced
// k-means, glare and mixed-cluster detection, and the Hungarian assignment
// behind them. Typed entry point for src/core/color/StickerLearning.res
// (see there for the reasoning and tuning).
import {
  balancedAssign as balancedAssignRes,
  learnStickerColors as learnStickerColorsRes,
  type learnedColors,
  type stickerSample,
} from '../core/color/StickerLearning.gen'
import { STICKER_COLORS, type RGB } from './stickerColorGeometry'

export {
  clearStickerColors,
  glareStickers,
  glareWarningStickers as GLARE_WARNING_STICKERS,
  hungarianAssignment,
  mixedUpClusters,
} from '../core/color/StickerLearning.gen'

export type {
  learnedColors as LearnedColors,
  stickerSample as StickerSample,
} from '../core/color/StickerLearning.gen'

// `pinned[i]`, when set, is the cluster point i must take.
export function balancedAssign(
  points: RGB[],
  centroids: RGB[],
  pinned: Array<number | null> = [],
): number[] {
  return balancedAssignRes(points, centroids, pinned)
}

export function learnStickerColors(
  samples: stickerSample[],
  referencePalette: Record<string, RGB> = STICKER_COLORS,
  clearLabels: Array<string | null> = [],
): learnedColors | null {
  return learnStickerColorsRes(samples, referencePalette, clearLabels)
}
