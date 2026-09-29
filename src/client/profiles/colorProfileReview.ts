// Reviewing saved color profiles side by side, each balanced on its own
// White before comparing, and merging the ones that stay close. Typed entry
// point for src/core/profiles/ColorProfileReview.res.
import {
  groupSimilarProfileIndexes,
  whiteBalancedColors as whiteBalancedColorsRes,
} from '../../core/profiles/ColorProfileReview.gen'
import type { RGB } from '../vision/stickerColorGeometry'
import type { ColorProfile } from './profileSettings'

export {
  averageLimitFraction as AVERAGE_LIMIT_FRACTION,
  closeDistance as CLOSE_DISTANCE,
  colorDeletionEffects,
  colorDifferences,
  colorsUnderWhite,
  deleteColorProfiles,
  groupDifferences,
  mergeColorProfiles,
  mergedColors,
  pairDistance,
  pairLevel,
  profileDistance,
  splitColorLevel,
  tryOnProfiles,
  unusedColorProfiles,
  wheelCenter as WHEEL_CENTER,
  wheelOutline,
  wheelPoint,
  wheelRadius as WHEEL_RADIUS,
  withinMergeLimit,
} from '../../core/profiles/ColorProfileReview.gen'

export type { reviewFace as ReviewFace } from '../../core/profiles/ColorProfileReview.gen'

// `colors` scaled per channel so White becomes a neutral grey of linear
// brightness `white`.
export function whiteBalancedColors(
  colors: Record<string, RGB>,
  white = 0.9,
): Record<string, RGB> {
  return whiteBalancedColorsRes(colors, white)
}

// Groups in which every pair of profiles is within the merge limit.
export function groupSimilarProfiles<
  T extends Pick<ColorProfile, 'id' | 'colors'>,
>(profiles: T[], limit: number): T[][] {
  return groupSimilarProfileIndexes(profiles, limit).map((group) =>
    group.map((index) => profiles[index]),
  )
}
