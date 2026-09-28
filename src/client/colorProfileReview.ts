// Reviewing saved color profiles side by side, each balanced on its own
// White before comparing, and merging the ones that stay close. Typed entry
// point for src/core/profiles/ColorProfileReview.res.
import {
  averageLimitFraction,
  colorDeletionEffects as colorDeletionEffectsRes,
  colorDifferences as colorDifferencesRes,
  colorsUnderWhite as colorsUnderWhiteRes,
  deleteColorProfiles as deleteColorProfilesRes,
  groupDifferences as groupDifferencesRes,
  groupSimilarProfileIndexes,
  mergeColorProfiles as mergeColorProfilesRes,
  mergedColors as mergedColorsRes,
  profileDistance as profileDistanceRes,
  splitColorLevel as splitColorLevelRes,
  unusedColorProfiles as unusedColorProfilesRes,
  whiteBalancedColors as whiteBalancedColorsRes,
  withinMergeLimit as withinMergeLimitRes,
} from '../core/profiles/ColorProfileReview.gen'
import type { RGB } from './imageProcessing'
import type { ColorProfile, ProfileSettings } from './profileSettings'

type HuedKey = 'Y' | 'O' | 'R' | 'G' | 'B'
type Settings = Parameters<typeof deleteColorProfilesRes>[0]
const toRes = (settings: ProfileSettings) => settings as unknown as Settings
const fromRes = (settings: Settings) => settings as unknown as ProfileSettings

// Labels for one A/B sticker swatch.
export function splitColorLevel(
  deltaE: number,
): ['ok' | 'warn' | 'bad', string] {
  return splitColorLevelRes(deltaE)
}

// `colors` scaled per channel so White becomes a neutral grey of linear
// brightness `white`.
export function whiteBalancedColors(
  colors: Record<string, RGB>,
  white = 0.9,
): Record<string, RGB> {
  return whiteBalancedColorsRes(colors, white)
}

// The reverse of whiteBalancedColors: `colors` as they look under `white`.
export function colorsUnderWhite(
  colors: Record<string, RGB>,
  white: RGB,
): Record<string, RGB> {
  return colorsUnderWhiteRes(colors, white)
}

// Mean OKLab distance x 100 of the five colored stickers once both
// profiles are balanced: under 5 is hard to tell apart.
export function profileDistance(
  a: Record<string, RGB>,
  b: Record<string, RGB>,
): number {
  return profileDistanceRes(a, b)
}

// OKLab distance x 100 per colored sticker once both are balanced.
export function colorDifferences(
  a: Record<string, RGB>,
  b: Record<string, RGB>,
): Record<HuedKey, number> {
  return colorDifferencesRes(a, b) as Record<HuedKey, number>
}

export const AVERAGE_LIMIT_FRACTION = averageLimitFraction

// No colored sticker over `limit`, and the average within its share.
export function withinMergeLimit(
  differences: Record<HuedKey, number>,
  limit: number,
): boolean {
  return withinMergeLimitRes(differences, limit)
}

// Groups in which every pair of profiles is within the merge limit.
export function groupSimilarProfiles<
  T extends Pick<ColorProfile, 'id' | 'colors'>,
>(profiles: T[], limit: number): T[][] {
  return groupSimilarProfileIndexes(profiles, limit).map((group) =>
    group.map((index) => profiles[index]),
  )
}

// A group's largest difference per colored sticker over all pairs, its
// worst color, and its largest average difference.
export function groupDifferences(profiles: Pick<ColorProfile, 'colors'>[]): {
  byColor: Record<HuedKey, number>
  worst: { color: HuedKey; value: number }
  average: number
} {
  return groupDifferencesRes(profiles) as {
    byColor: Record<HuedKey, number>
    worst: { color: HuedKey; value: number }
    average: number
  }
}

// The members balanced to their mean White brightness and averaged.
export function mergedColors(
  profiles: Pick<ColorProfile, 'colors'>[],
): Record<string, RGB> {
  return mergedColorsRes(profiles)
}

// Replaces the profiles `ids` with one merged profile named `name`.
export function mergeColorProfiles(
  settings: ProfileSettings,
  ids: string[],
  name: string,
  updatedAt: string,
): { settings: ProfileSettings; profile: ColorProfile } {
  const merged = mergeColorProfilesRes(toRes(settings), ids, name, updatedAt)
  return { settings: fromRes(merged.settings), profile: merged.profile }
}

// Deletes the saved color profiles `ids`.
export function deleteColorProfiles(
  settings: ProfileSettings,
  ids: string[],
): ProfileSettings {
  return fromRes(deleteColorProfilesRes(toRes(settings), ids))
}

// What deleting `ids` changes for the selected and the automatic colors.
export function colorDeletionEffects(
  settings: ProfileSettings,
  ids: string[],
): string[] {
  return colorDeletionEffectsRes(toRes(settings), ids)
}

// Saved color profiles that are neither selected nor the automatic match.
export function unusedColorProfiles(settings: ProfileSettings): string[] {
  return unusedColorProfilesRes(toRes(settings))
}
