// When a reviewed capture's learned colors may create or update a color
// profile, how Automatic picks a saved profile, and how that is reported.
// Typed entry point for src/core/profiles/ColorProfileLearning.res.
import {
  assessPalette as assessPaletteRes,
  balancedPaletteDistance as balancedPaletteDistanceRes,
  blendColorProfile as blendColorProfileRes,
  canCreateProfileFromCapture as canCreateProfileFromCaptureRes,
  captureProfileFinding as captureProfileFindingRes,
  matchColorProfile as matchColorProfileRes,
  matchPartialColorProfile as matchPartialColorProfileRes,
  profileColorFitPercent as profileColorFitPercentRes,
  profileToUpdate as profileToUpdateRes,
  resolveAutomaticProfile as resolveAutomaticProfileRes,
  shouldBlendColorProfile as shouldBlendColorProfileRes,
  summarizePreviewProfiles as summarizePreviewProfilesRes,
  updateProfileFromCapture as updateProfileFromCaptureRes,
} from '../core/profiles/ColorProfileLearning.gen'
import type { RGB } from './imageProcessing'
import type { ColorProfile } from './profileSettings'

export interface PaletteEvidence {
  reviewedValid: boolean
  cameraOnly: boolean
  recalibrated: boolean
  confidentFraction: number
  correctedFraction?: number
}

export function canCreateProfileFromCapture(
  evidence: PaletteEvidence,
): boolean {
  return canCreateProfileFromCaptureRes(evidence)
}

// Whether a capture's colors may update `profile`, with their distance.
export function assessPalette(
  profile: ColorProfile,
  measured: Record<string, RGB>,
  evidence: PaletteEvidence,
): { accepted: boolean; distance: number; reason?: string } {
  return assessPaletteRes(profile, measured, evidence)
}

export function shouldBlendColorProfile(
  profile: ColorProfile,
  measured: Record<string, RGB>,
  evidence: PaletteEvidence,
  automatic: boolean,
): boolean {
  return shouldBlendColorProfileRes(profile, measured, evidence, automatic)
}

export function blendColorProfile(
  profile: ColorProfile,
  measured: Record<string, RGB>,
  updatedAt: string,
): ColorProfile {
  return blendColorProfileRes(profile, measured, updatedAt)
}

// Called only by the explicit Update profile action for an Automatic match.
export function updateProfileFromCapture(
  profile: ColorProfile,
  measured: Record<string, RGB>,
  evidence: PaletteEvidence,
  updatedAt: string,
): ColorProfile | null {
  return updateProfileFromCaptureRes(profile, measured, evidence, updatedAt)
}

// How far a saved profile is from a capture's colors, both balanced on
// their own White first.
export function balancedPaletteDistance(
  profile: Record<string, RGB>,
  measured: Record<string, RGB>,
): number {
  return balancedPaletteDistanceRes(profile, measured)
}

export function matchColorProfile(
  profiles: ColorProfile[],
  measured: Record<string, RGB>,
): ColorProfile | null {
  return matchColorProfileRes(profiles, measured)
}

// The nearest profile to a partial scan's stickers.
export function matchPartialColorProfile(
  profiles: ColorProfile[],
  samples: RGB[],
): ColorProfile | null {
  return matchPartialColorProfileRes(profiles, samples)
}

// A descriptive 0-100 color-similarity score.
export function profileColorFitPercent(
  profile: Record<string, RGB>,
  measured: Record<string, RGB>,
): number {
  return profileColorFitPercentRes(profile, measured)
}

export interface AutomaticResolution {
  profile: ColorProfile | null
  // clear: a strong lead. preview: the nearest close profile also drove the
  // latest live preview. nearest: another close profile won after six faces.
  // tie is retained for older fixtures that fell back to captured colors.
  // far: no saved profile is close. none: no saved profiles.
  reason: 'clear' | 'preview' | 'nearest' | 'tie' | 'far' | 'none'
  // The nearest saved profiles with their fit, best first.
  nearest: Array<{ profile: ColorProfile; fit: number }>
}

// The saved palette Automatic settles on for a complete capture.
export function resolveAutomaticProfile(
  profiles: ColorProfile[],
  measured: Record<string, RGB>,
  previewId: string | null,
): AutomaticResolution {
  return resolveAutomaticProfileRes(profiles, measured, previewId)
}

// Which profile previewed each face, in capture order; null for none.
export function summarizePreviewProfiles(
  names: Array<string | undefined>,
): string | null {
  return summarizePreviewProfilesRes(names)
}

// A note on how Automatic's final profile came about, if one is worth it.
export function captureProfileFinding(
  previewNames: Array<string | undefined>,
  resolvedName: string,
  reason: AutomaticResolution['reason'] | null,
): string | null {
  return captureProfileFindingRes(previewNames, resolvedName, reason)
}

// The saved profile a reviewed capture may update, offered as an explicit
// Update action.
export function profileToUpdate(
  profiles: ColorProfile[],
  choice: { automatic: boolean; resolvedId: string | null; selectedId: string },
  measured: Record<string, RGB>,
  evidence: PaletteEvidence,
): ColorProfile | null {
  return profileToUpdateRes(profiles, choice, measured, evidence)
}
