// Color science for sticker classification - OKLCH/Oklab conversions, hue
// ranges, the clustering distance, first-pass classification and gains:
// typed entry point for src/core/color/ColorMath.res (see there for why
// OKLCH, and for the tuning behind the clustering distance).
import { classifySticker as classifyStickerRes } from '../core/color/ColorMath.gen'
import type { RGB } from './stickerColorGeometry'

export {
  applyGains,
  applyGainsToPixels,
  hueCircularRange,
  hueRangesOverlap,
  linearChannelToSrgb,
  linearRange,
  neutralGains as NEUTRAL_GAINS,
  removeGains,
  rgbToOKLCH,
  rgbToOklab,
  srgbChannelToLinear,
} from '../core/color/ColorMath.gen'

export type {
  hueRange as HueRange,
  linearRange as LinearRange,
  oklab as Oklab,
  oklch as OKLCH,
} from '../core/color/ColorMath.gen'

// First-pass classification of a single sticker, from a learned palette
// when there is one, otherwise from chroma and typical hues.
export function classifySticker(
  rgb: RGB,
  palette?: Record<string, RGB>,
): { color: string; confidence: number } {
  return classifyStickerRes(rgb, palette)
}
