import { oklabToRgb, paletteDistance, rgbToOklab, type RGB } from './imageProcessing'
import type { ColorProfile } from './profileSettings'

const COLOR_KEYS = ['W', 'Y', 'O', 'R', 'G', 'B']

export interface PaletteEvidence {
  reviewedValid: boolean
  cameraOnly: boolean
  recalibrated: boolean
  confidentFraction: number
}

// The saved fixtures include same-cube distances through 0.083 and
// individual-color shifts through 0.185. These are conservative update
// limits, not an identity classifier: changed lighting should ask first.
export function assessPalette(profile: ColorProfile, measured: Record<string, RGB>, evidence: PaletteEvidence): {
  accepted: boolean; distance: number; reason?: string
} {
  const distance = paletteDistance(profile.colors, measured)
  if (!evidence.reviewedValid || !evidence.cameraOnly || !evidence.recalibrated || evidence.confidentFraction < 0.8)
    return { accepted: false, distance, reason: 'Capture quality is too low to update colors' }
  if (profile.captures === 0) return { accepted: true, distance }
  const largest = Math.max(...COLOR_KEYS.map((key) => paletteDistance({ [key]: profile.colors[key] }, { [key]: measured[key] })))
  if (distance > 0.09 || largest > 0.14)
    return { accepted: false, distance, reason: 'Measured colors are too far from this profile' }
  return { accepted: true, distance }
}

export function blendColorProfile(profile: ColorProfile, measured: Record<string, RGB>, updatedAt: string): ColorProfile {
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

export function chooseColorProfile(profiles: ColorProfile[], selectedId: string, measured: Record<string, RGB>): {
  suggested: ColorProfile | null; autoSelect: ColorProfile | null
} {
  const ranked = profiles.filter((profile) => profile.captures > 0)
    .map((profile) => ({ profile, distance: paletteDistance(profile.colors, measured) }))
    .sort((a, b) => a.distance - b.distance)
  const best = ranked[0]
  const selectedProfile = profiles.find((profile) => profile.id === selectedId)
  const selected = selectedProfile ? { profile: selectedProfile, distance: paletteDistance(selectedProfile.colors, measured) } : null
  if (!best || !selected || best.profile.id === selectedId || best.distance > 0.04) return { suggested: null, autoSelect: null }
  const second = ranked[1]?.distance ?? Infinity
  const clear = best.distance < selected.distance * 0.65 && best.distance < second * 0.65
    && (selectedProfile?.captures !== 0 || best.distance <= 0.025)
  return { suggested: best.profile, autoSelect: clear ? best.profile : null }
}
