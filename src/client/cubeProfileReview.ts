// Reviewing saved cube definitions: cubes of one size whose sticker areas
// match are duplicates to merge or delete. Typed entry point for
// src/core/profiles/CubeProfileReview.res.
import {
  cubeDeletionEffects as cubeDeletionEffectsRes,
  cubesSameAsGeneric as cubesSameAsGenericRes,
  deleteCubes as deleteCubesRes,
  duplicateCubeGroups as duplicateCubeGroupsRes,
  mergeCubes as mergeCubesRes,
  replaceCubes as replaceCubesRes,
  unusedCubes as unusedCubesRes,
} from '../core/profiles/CubeProfileReview.gen'
import type { CubeSetting, ProfileSettings } from './profileSettings'

type Settings = Parameters<typeof deleteCubesRes>[0]
const toRes = (settings: ProfileSettings) => settings as unknown as Settings
const fromRes = (settings: Settings) => settings as unknown as ProfileSettings

// Groups per size of cubes whose sticker areas are all within `tolerance`,
// each with at least one saved cube.
export function duplicateCubeGroups(
  settings: ProfileSettings,
  tolerance: number,
): CubeSetting[][] {
  return duplicateCubeGroupsRes(toRes(settings), tolerance)
}

// Replaces the saved cubes `ids` with one cube of their mean sticker area.
export function mergeCubes(
  settings: ProfileSettings,
  ids: string[],
  name: string,
): { settings: ProfileSettings; cube: CubeSetting } {
  const merged = mergeCubesRes(toRes(settings), ids, name)
  return { settings: fromRes(merged.settings), cube: merged.cube }
}

// Deletes the saved cubes `ids` in favour of `keepId`.
export function replaceCubes(
  settings: ProfileSettings,
  ids: string[],
  keepId: string,
): ProfileSettings {
  return fromRes(replaceCubesRes(toRes(settings), ids, keepId))
}

// Deletes the saved cubes `ids`.
export function deleteCubes(
  settings: ProfileSettings,
  ids: string[],
): ProfileSettings {
  return fromRes(deleteCubesRes(toRes(settings), ids))
}

// What deleting `ids` changes, one line per size that loses its active cube.
export function cubeDeletionEffects(
  settings: ProfileSettings,
  ids: string[],
): string[] {
  return cubeDeletionEffectsRes(toRes(settings), ids)
}

// Saved cubes whose sticker area equals their size's built-in Generic cube.
export function cubesSameAsGeneric(settings: ProfileSettings): string[] {
  return cubesSameAsGenericRes(toRes(settings))
}

// Saved cubes that are not the active cube of their size.
export function unusedCubes(settings: ProfileSettings): string[] {
  return unusedCubesRes(toRes(settings))
}
