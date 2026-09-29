// The cross-face color pass after all six faces are in. The per-pixel
// re-detection (runGlobalWhiteBalance) stays here; the pure parts are the
// typed entry point for src/core/color/Recalibration.res.
import {
  classifyAcrossFaces as classifyAcrossFacesRes,
  colorConfidences as colorConfidencesRes,
  type classified,
} from '../../core/color/Recalibration.gen'
import {
  DEFAULT_SAMPLING,
  STICKER_COLORS,
  type ColorDetectionResult,
  type RGB,
  type SamplingGeometry,
} from '../stickerColorGeometry'
import { NEUTRAL_GAINS } from '../colorMath'
import { limitBackgroundGain } from '../faceSampling'
import { redetectFaceColors } from '../faceDetection'

// Each face's colors after the cross-face pass, the learned palette when it
// applied, and the stickers glare washed out (see glareStickers).
export type LearnedColorClassificationResult = classified

// How well `rgb` matches each color, 0-1 on the scale of cellConfidences -
// for showing a human how plausible each alternative is when fixing a
// sticker. `palette` is the learned colors when the cross-face pass ran.
export function colorConfidences(
  rgb: RGB,
  palette: Record<string, RGB> = STICKER_COLORS,
): Record<string, number> {
  return colorConfidencesRes(rgb, palette)
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
  return classifyAcrossFacesRes(baselineFaces, referencePalette)
}
