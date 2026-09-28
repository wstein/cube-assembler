// Color science for sticker classification - OKLCH/Oklab conversions, hue
// ranges, the clustering distance, first-pass classification and gains:
// typed entry point for src/core/color/ColorMath.res (see there for why
// OKLCH, and for the tuning behind the clustering distance).
import {
  applyGains as applyGainsRes,
  classifySticker as classifyStickerRes,
  clusterDistance as clusterDistanceRes,
  clusterOklabDistance as clusterOklabDistanceRes,
  confidenceDistanceScale,
  hueCircularRange as hueCircularRangeRes,
  hueRangesOverlap as hueRangesOverlapRes,
  linearChannelToSrgb as linearChannelToSrgbRes,
  linearRange as linearRangeRes,
  linearRgbToOklab as linearRgbToOklabRes,
  neutralGains,
  oklabToRgb as oklabToRgbRes,
  removeGains as removeGainsRes,
  rgbToOKLCH as rgbToOKLCHRes,
  rgbToOklab as rgbToOklabRes,
  srgbChannelToLinear as srgbChannelToLinearRes,
} from '../core/color/ColorMath.gen'
import type { RGB } from './stickerColorGeometry'

export interface OKLCH {
  l: number // lightness, 0-1
  c: number // chroma, unbounded (~0-0.4 for in-gamut sRGB)
  h: number // hue, degrees, 0-360
}

export type Oklab = { l: number; a: number; b: number }

export function srgbChannelToLinear(c: number): number {
  return srgbChannelToLinearRes(c)
}

export function rgbToOklab(rgb: RGB): Oklab {
  return rgbToOklabRes(rgb)
}

// From linear-light channels, which may exceed 1.
export function linearRgbToOklab(r: number, g: number, b: number): Oklab {
  return linearRgbToOklabRes(r, g, b)
}

export function linearChannelToSrgb(v: number): number {
  return linearChannelToSrgbRes(v)
}

export function oklabToRgb(lab: Oklab): RGB {
  return oklabToRgbRes(lab)
}

export function rgbToOKLCH(rgb: RGB): OKLCH {
  return rgbToOKLCHRes(rgb)
}

export interface HueRange {
  min: number
  max: number
  span: number
}

// The smallest arc containing every given hue, across the 0/360 wrap.
export function hueCircularRange(hues: number[]): HueRange | null {
  return hueCircularRangeRes(hues)
}

// Whether two hue arcs share any point on the circle.
export function hueRangesOverlap(a: HueRange, b: HueRange): boolean {
  return hueRangesOverlapRes(a, b)
}

export interface LinearRange {
  min: number
  max: number
}

// Plain min/max range for lightness and chroma.
export function linearRange(values: number[]): LinearRange | null {
  return linearRangeRes(values)
}

// Oklab distance with lightness discounted for saturated colors.
export function clusterOklabDistance(o1: Oklab, o2: Oklab): number {
  return clusterOklabDistanceRes(o1, o2)
}

export function clusterDistance(c1: RGB, c2: RGB): number {
  return clusterDistanceRes(c1, c2)
}

// Turns a distance into a 0-1 confidence.
export const CONFIDENCE_DISTANCE_SCALE = confidenceDistanceScale

// First-pass classification of a single sticker, from a learned palette
// when there is one, otherwise from chroma and typical hues.
export function classifySticker(
  rgb: RGB,
  palette?: Record<string, RGB>,
): { color: string; confidence: number } {
  return classifyStickerRes(rgb, palette)
}

export const NEUTRAL_GAINS: RGB = neutralGains

// Gains scale light, so they apply in linear light.
export function applyGains(rgb: RGB, gains: RGB): RGB {
  return applyGainsRes(rgb, gains)
}

// A sticker reading as it was before applyGains.
export function removeGains(rgb: RGB, gains: RGB): RGB {
  return removeGainsRes(rgb, gains)
}

// A photo's pixels (RGBA) adjusted like its stickers are, for showing what
// the backdrop white balance did to a face. Stays a TS loop over pixels.
export function applyGainsToPixels(
  data: Uint8ClampedArray,
  gains: RGB,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const { r, g, b } = applyGains(
      { r: data[i], g: data[i + 1], b: data[i + 2] },
      gains,
    )
    out[i] = r
    out[i + 1] = g
    out[i + 2] = b
    out[i + 3] = data[i + 3]
  }
  return out
}
