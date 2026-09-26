import { oklabToRgb, paletteDistance, rgbToOklab, type RGB } from './imageProcessing'
import { AUTO_COLORS_ID, GENERIC_COLORS_ID, type ColorProfile } from './profileSettings'

const COLOR_KEYS = ['W', 'Y', 'O', 'R', 'G', 'B']

export interface PaletteEvidence {
  reviewedValid: boolean
  cameraOnly: boolean
  recalibrated: boolean
  confidentFraction: number
  correctedFraction?: number
}

export function canCreateProfileFromCapture(evidence: PaletteEvidence): boolean {
  return evidence.reviewedValid && evidence.cameraOnly && evidence.recalibrated
    && evidence.confidentFraction >= 0.8 && (evidence.correctedFraction ?? 0) <= 0.02
}

// The saved fixture palettes overlap heavily across named cubes. The update
// limits catch large shifts; they never identify physical cube geometry.
export function assessPalette(profile: ColorProfile, measured: Record<string, RGB>, evidence: PaletteEvidence): {
  accepted: boolean; distance: number; reason?: string
} {
  const distance = paletteDistance(profile.colors, measured)
  if (!canCreateProfileFromCapture(evidence))
    return { accepted: false, distance, reason: 'Capture quality is too low to update colors' }
  if (profile.captures === 0) return { accepted: true, distance }
  const largest = Math.max(...COLOR_KEYS.map((key) => paletteDistance({ [key]: profile.colors[key] }, { [key]: measured[key] })))
  if (distance > 0.08 || largest > 0.14)
    return { accepted: false, distance, reason: 'Measured colors are too far from this profile' }
  return { accepted: true, distance }
}

export function shouldBlendColorProfile(profile: ColorProfile, measured: Record<string, RGB>, evidence: PaletteEvidence, automatic: boolean): boolean {
  return !automatic && profile.id !== GENERIC_COLORS_ID && profile.id !== AUTO_COLORS_ID
    && assessPalette(profile, measured, evidence).accepted
}

export function blendColorProfile(profile: ColorProfile, measured: Record<string, RGB>, updatedAt: string): ColorProfile {
  if (profile.id === GENERIC_COLORS_ID || profile.id === AUTO_COLORS_ID) throw new Error('Cannot update Generic colors')
  const weight = profile.captures === 0 ? 1 : Math.max(0.2, 1 / (profile.captures + 1))
  const colors = Object.fromEntries(COLOR_KEYS.map((key) => {
    const oldLab = rgbToOklab(profile.colors[key])
    const newLab = rgbToOklab(measured[key])
    return [key, oklabToRgb({
      l: oldLab.l * (1 - weight) + newLab.l * weight,
      a: oldLab.a * (1 - weight) + newLab.a * weight,
      b: oldLab.b * (1 - weight) + newLab.b * weight,
    })]
  })) as Record<string, RGB>
  return { ...profile, colors, captures: profile.captures + 1, updatedAt }
}

// Called only by the explicit Update profile action for an Automatic match.
export function updateProfileFromCapture(profile: ColorProfile, measured: Record<string, RGB>, evidence: PaletteEvidence, updatedAt: string): ColorProfile | null {
  return profile.id !== GENERIC_COLORS_ID && profile.id !== AUTO_COLORS_ID && assessPalette(profile, measured, evidence).accepted
    ? blendColorProfile(profile, measured, updatedAt) : null
}

export function matchColorProfile(profiles: ColorProfile[], measured: Record<string, RGB>): ColorProfile | null {
  const ranked = profiles.filter((profile) => profile.captures > 0)
    .map((profile) => ({ profile, distance: paletteDistance(profile.colors, measured) }))
    .sort((a, b) => a.distance - b.distance)
  const best = ranked[0]
  const second = ranked[1]?.distance ?? Infinity
  const clear = best && best.distance <= (ranked.length === 1 ? 0.025 : 0.04)
    && best.distance < second * 0.65
  return clear ? best.profile : null
}

// A partial scan may show only two or three of the six colors. Compare each
// captured sticker with its closest available centroid without trusting its
// first-pass color label. Equal fits retain the first profile in the list.
export function matchPartialColorProfile(profiles: ColorProfile[], samples: RGB[]): ColorProfile | null {
  if (samples.length === 0) return null
  const ranked = profiles.filter((profile) => profile.captures > 0 || profile.id === GENERIC_COLORS_ID)
    .map((profile) => ({
      profile,
      distance: samples.reduce((sum, sample) => sum + Math.min(...COLOR_KEYS.map((key) =>
        paletteDistance({ sample }, { sample: profile.colors[key] }))), 0) / samples.length,
    }))
    .sort((a, b) => a.distance - b.distance)
  const best = ranked[0]
  if (!best) return null
  return best.profile
}

// A descriptive 0–100 color-similarity score, not a probability that the
// physical cube has a particular brand. The 0.08 scale is the existing
// maximum mean distance allowed when updating a saved profile.
export function profileColorFitPercent(profile: Record<string, RGB>, measured: Record<string, RGB>): number {
  return Math.round(100 * Math.max(0, Math.min(1, 1 - paletteDistance(profile, measured) / 0.08)))
}
