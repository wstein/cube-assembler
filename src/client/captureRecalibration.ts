// The cross-face color pass after all six faces are in. The per-pixel
// re-detection (runGlobalWhiteBalance) stays here; the pure parts are the
// typed entry point for src/core/color/Recalibration.res.
import {
  classifyAcrossFaces as classifyAcrossFacesRes,
  colorConfidences as colorConfidencesRes,
  lookalikeRatio,
  nearestOtherColor as nearestOtherColorRes,
  paletteDistance as paletteDistanceRes,
} from '../core/color/Recalibration.gen'
import {
  DEFAULT_SAMPLING,
  STICKER_COLORS,
  type ColorDetectionResult,
  type RGB,
  type SamplingGeometry,
} from './stickerColorGeometry'
import type { LearnedColors } from './stickerLearning'
import { NEUTRAL_GAINS } from './colorMath'
import { limitBackgroundGain } from './faceSampling'
import { redetectFaceColors } from './faceDetection'

export interface LearnedColorClassificationResult {
  learned: LearnedColors | null
  applied: boolean
  faces: Record<string, ColorDetectionResult>
  // Stickers glare washed out (see glareStickers).
  glare: Array<{ face: string; row: number; col: number }>
}

// How well `rgb` matches each color, 0-1 on the scale of cellConfidences -
// for showing a human how plausible each alternative is when fixing a
// sticker. `palette` is the learned colors when the cross-face pass ran.
export function colorConfidences(
  rgb: RGB,
  palette: Record<string, RGB> = STICKER_COLORS,
): Record<string, number> {
  return colorConfidencesRes(rgb, palette)
}

// How different two palettes are: the mean distance between their
// same-named colors, in the clustering metric.
export function paletteDistance(
  a: Record<string, RGB>,
  b: Record<string, RGB>,
): number {
  return paletteDistanceRes(a, b)
}

// How far toward the nearest other color a sticker may sit before it's
// worth a second look (1 is on the boundary).
export const LOOKALIKE_RATIO = lookalikeRatio

// The nearest learned color other than `label`, and how close `rgb` is to
// the boundary with it.
export function nearestOtherColor(
  rgb: RGB,
  label: string,
  colors: Record<string, RGB>,
): { color: string; ratio: number } | null {
  return nearestOtherColorRes(rgb, label, colors)
}

/**
 * Runs the full post-capture recalibration pass: redetects every face's
 * stored snapshot from scratch (ignoring whatever WB preset/auto-estimate
 * was live-applied during capture — that was only ever a capture-time aid
 * for the user, not something this pass should inherit), learns each
 * color's actual RGB from all 6 faces' stickers together
 * (learnStickerColors), then reclassifies every sticker against those
 * learned colors instead of the hardcoded canonical palette — relabeling
 * only, no re-extraction, since the raw per-cell RGB doesn't change.
 * Falls back to the neutral-gain/hardcoded-palette baseline
 * (`applied: false`) if there aren't enough stickers to cluster reliably.
 *
 * `faceGains`, when given, redetects each face with that face's own gain
 * instead of NEUTRAL_GAINS for all of them - the background-based
 * cross-face correction: face 1 is the
 * reference (gain 1,1,1), later faces get whatever gain would make their
 * OWN background patch read the same as face 1's did. A face missing from
 * `faceGains` (background unavailable that shot) falls back to neutral.
 */
export async function runGlobalWhiteBalance(
  faceCroppedImages: Record<string, string>,
  gridSize: number,
  faceGains?: Record<string, RGB>,
  sampling: SamplingGeometry = DEFAULT_SAMPLING,
  referencePalette?: Record<string, RGB>,
): Promise<LearnedColorClassificationResult> {
  const baselineFaces: Record<string, ColorDetectionResult> = {}
  for (const [face, dataUrl] of Object.entries(faceCroppedImages)) {
    const gains = faceGains?.[face]
      ? limitBackgroundGain(faceGains[face])
      : NEUTRAL_GAINS
    baselineFaces[face] = await redetectFaceColors(
      dataUrl,
      gridSize,
      gains,
      sampling,
      referencePalette,
    )
  }

  return classifyAcrossFaces(baselineFaces, referencePalette)
}

// The balanced cross-face assignment behind runGlobalWhiteBalance, on
// already-measured faces (see Recalibration.res).
export function classifyAcrossFaces(
  baselineFaces: Record<string, ColorDetectionResult>,
  referencePalette?: Record<string, RGB>,
): LearnedColorClassificationResult {
  return classifyAcrossFacesRes(
    baselineFaces,
    referencePalette,
  ) as LearnedColorClassificationResult
}
