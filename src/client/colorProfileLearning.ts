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

// Largest mean distance at which a saved profile still counts as close to
// the six-face palette (see matchColorProfile).
const CLOSE_PROFILE_DISTANCE = 0.04

export interface AutomaticResolution {
  profile: ColorProfile | null
  // clear: matchColorProfile's clear match. preview: the profile the live
  // preview used, still the nearest and close, though without a clear lead.
  // tie: close profiles, none clearly ahead. far: no saved profile is close.
  // none: no saved profiles.
  reason: 'clear' | 'preview' | 'tie' | 'far' | 'none'
  // The nearest saved profiles with their fit (profileColorFitPercent), best first.
  nearest: Array<{ profile: ColorProfile; fit: number }>
}

// The saved profile Automatic settles on for a complete capture, and why.
// The live preview always takes the nearest profile; the final choice
// wants a clear lead, but keeps the preview's profile when that is still
// the nearest and close, so the two don't disagree on a near tie.
export function resolveAutomaticProfile(profiles: ColorProfile[], measured: Record<string, RGB>, previewId: string | null): AutomaticResolution {
  const ranked = profiles.filter((profile) => profile.captures > 0)
    .map((profile) => ({ profile, distance: paletteDistance(profile.colors, measured) }))
    .sort((a, b) => a.distance - b.distance)
  const nearest = ranked.slice(0, 3).map(({ profile }) => ({ profile, fit: profileColorFitPercent(profile.colors, measured) }))
  const best = ranked[0]
  if (!best) return { profile: null, reason: 'none', nearest }
  const clear = matchColorProfile(profiles, measured)
  if (clear) return { profile: clear, reason: 'clear', nearest }
  if (best.distance > CLOSE_PROFILE_DISTANCE) return { profile: null, reason: 'far', nearest }
  if (best.profile.id === previewId) return { profile: best.profile, reason: 'preview', nearest }
  return { profile: null, reason: 'tie', nearest }
}

// "plastic2 (faces 2–6), Generic colors (face 1)": which profile previewed
// each face, in capture order; null when no face recorded one.
export function summarizePreviewProfiles(names: Array<string | undefined>): string | null {
  const faces = new Map<string, number[]>()
  names.forEach((name, i) => { if (name) faces.set(name, [...(faces.get(name) ?? []), i + 1]) })
  if (faces.size === 0) return null
  const spans = (numbers: number[]) => {
    const parts: string[] = []
    for (let i = 0; i < numbers.length;) {
      let j = i
      while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j++
      parts.push(i === j ? `${numbers[i]}` : `${numbers[i]}–${numbers[j]}`)
      i = j + 1
    }
    return parts.join(', ')
  }
  return [...faces].map(([name, numbers]) => `${name} (${numbers.length === 1 ? 'face' : 'faces'} ${spans(numbers)})`).join(', ')
}

// The saved profile a reviewed capture may update, offered as an explicit
// Update action: the one Automatic resolved to, or the hand-selected one.
// Needs a valid, camera-only, recalibrated capture whose colors are close
// enough (see assessPalette); never Generic or Automatic.
export function profileToUpdate(
  profiles: ColorProfile[],
  { automatic, resolvedId, selectedId }: { automatic: boolean; resolvedId: string | null; selectedId: string },
  measured: Record<string, RGB>,
  evidence: PaletteEvidence,
): ColorProfile | null {
  if (!evidence.reviewedValid || !evidence.cameraOnly || !evidence.recalibrated) return null
  const target = profiles.find((profile) => profile.id === (automatic ? resolvedId : selectedId))
  return target && shouldBlendColorProfile(target, measured, evidence, false) ? target : null
}
