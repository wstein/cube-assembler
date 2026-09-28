// Cube geometry and sticker colors are independent: one color profile can
// serve cubes of several sizes, while each cube keeps its own sticker gap.
// Typed entry point for src/core/profiles/ProfileSettings.res.
import {
  activeColorProfile as activeColorProfileRes,
  activeCube as activeCubeRes,
  allColorProfiles as allColorProfilesRes,
  allCubes as allCubesRes,
  builtinColorProfiles as builtinColorProfilesRes,
  builtinCube as builtinCubeRes,
  captureColorProfileSnapshot as captureColorProfileSnapshotRes,
  capturePalette as capturePaletteRes,
  colorPalette as colorPaletteRes,
  copyColorProfile as copyColorProfileRes,
  copyCubeSetting as copyCubeSettingRes,
  cubeGroupName as cubeGroupNameRes,
  cubesForSize as cubesForSizeRes,
  deleteColorProfile as deleteColorProfileRes,
  deleteCube as deleteCubeRes,
  groupCubesByName as groupCubesByNameRes,
  isBuiltinColorProfile as isBuiltinColorProfileRes,
  isBuiltinCube as isBuiltinCubeRes,
  mergeSettings as mergeSettingsRes,
  parseProfileSettingsValue as parseProfileSettingsValueRes,
  renameColorProfile as renameColorProfileRes,
  renameCube as renameCubeRes,
  resolvedColorProfileSnapshot as resolvedColorProfileSnapshotRes,
  saveColorProfile as saveColorProfileRes,
  saveCube as saveCubeRes,
  selectColorProfile as selectColorProfileRes,
  selectCube as selectCubeRes,
  setAutoColorMatch as setAutoColorMatchRes,
  autoColorsId,
  captureColorsId,
  cubeSizes,
  emptySettings,
} from '../core/profiles/ProfileSettings.gen'
import type { RGB, SamplingGeometry } from './imageProcessing'

export interface CubeSetting {
  id: string
  name: string
  size: number
  sampling: SamplingGeometry
}

export interface ColorProfile {
  id: string
  name: string
  colors: Record<string, RGB>
  captures: number
  updatedAt?: string
}

export interface UsedColorProfile {
  id: string
  name: string
  selection: 'automatic' | 'manual'
  colors: Record<string, RGB>
  colorFitPercent?: number
}

export interface ProfileSettings {
  cubes: CubeSetting[]
  colors: ColorProfile[]
  activeCubeBySize: Record<number, string>
  activeColorsId: string
  autoMatchedColorsId?: string
}

type Settings = Parameters<typeof saveCubeRes>[0]
const toRes = (settings: ProfileSettings) => settings as unknown as Settings
const fromRes = (settings: Settings) => settings as unknown as ProfileSettings

export const CUBE_SIZES: number[] = cubeSizes
export const AUTO_COLORS_ID = autoColorsId
export const CAPTURE_COLORS_ID = captureColorsId
export const EMPTY_SETTINGS: ProfileSettings = fromRes(emptySettings)

export function builtinColorProfiles(): ColorProfile[] {
  return builtinColorProfilesRes()
}

export function isBuiltinColorProfile(id: string): boolean {
  return isBuiltinColorProfileRes(id)
}

// The same object every time for a size: the live camera effect depends on
// the selected cube's sampling object staying stable.
export function builtinCube(size: number): CubeSetting {
  return builtinCubeRes(size)
}

export function isBuiltinCube(id: string): boolean {
  return isBuiltinCubeRes(id)
}

export function allCubes(settings: ProfileSettings): CubeSetting[] {
  return allCubesRes(toRes(settings))
}

export function cubeGroupName(cube: CubeSetting): string {
  return cubeGroupNameRes(cube)
}

export function groupCubesByName(
  settings: ProfileSettings,
): Array<{ name: string; cubes: CubeSetting[] }> {
  return groupCubesByNameRes(toRes(settings))
}

export function cubesForSize(
  settings: ProfileSettings,
  size: number,
): CubeSetting[] {
  return cubesForSizeRes(toRes(settings), size)
}

export function activeCube(
  settings: ProfileSettings,
  size: number,
): CubeSetting {
  return activeCubeRes(toRes(settings), size)
}

export function saveCube(
  settings: ProfileSettings,
  cube: CubeSetting,
): ProfileSettings {
  return fromRes(saveCubeRes(toRes(settings), cube))
}

export function selectCube(
  settings: ProfileSettings,
  id: string,
): ProfileSettings {
  return fromRes(selectCubeRes(toRes(settings), id))
}

export function copyCubeSetting(
  settings: ProfileSettings,
  cube: CubeSetting,
  name: string,
): CubeSetting {
  return copyCubeSettingRes(toRes(settings), cube, name)
}

export function deleteCube(
  settings: ProfileSettings,
  id: string,
): ProfileSettings {
  return fromRes(deleteCubeRes(toRes(settings), id))
}

// Renames a saved cube; built-in Generic cubes keep their names.
export function renameCube(
  settings: ProfileSettings,
  id: string,
  name: string,
): ProfileSettings {
  return fromRes(renameCubeRes(toRes(settings), id, name))
}

// Renames a saved color profile; Generic and Automatic keep their names.
export function renameColorProfile(
  settings: ProfileSettings,
  id: string,
  name: string,
): ProfileSettings {
  return fromRes(renameColorProfileRes(toRes(settings), id, name))
}

export function colorPalette(
  profile: Pick<ColorProfile, 'colors'>,
): Record<string, RGB> {
  return colorPaletteRes(profile)
}

export function copyColorProfile(
  settings: ProfileSettings,
  source: ColorProfile,
  name: string,
): ColorProfile {
  return copyColorProfileRes(toRes(settings), source, name)
}

export function allColorProfiles(settings: ProfileSettings): ColorProfile[] {
  return allColorProfilesRes(toRes(settings))
}

export function activeColorProfile(settings: ProfileSettings): ColorProfile {
  return activeColorProfileRes(toRes(settings))
}

// Automatic does not reuse a match from an earlier complete cube.
export function capturePalette(
  settings: ProfileSettings,
): Record<string, RGB> | undefined {
  return capturePaletteRes(toRes(settings))
}

export function captureColorProfileSnapshot(
  colors: Record<string, RGB>,
): UsedColorProfile {
  return captureColorProfileSnapshotRes(colors)
}

export function resolvedColorProfileSnapshot(
  active: ColorProfile,
  selection: UsedColorProfile['selection'],
  colorFitPercent?: number,
): UsedColorProfile {
  return resolvedColorProfileSnapshotRes(active, selection, colorFitPercent)
}

export function setAutoColorMatch(
  settings: ProfileSettings,
  id: string | null,
): ProfileSettings {
  return fromRes(setAutoColorMatchRes(toRes(settings), id))
}

export function saveColorProfile(
  settings: ProfileSettings,
  profile: ColorProfile,
): ProfileSettings {
  return fromRes(saveColorProfileRes(toRes(settings), profile))
}

export function selectColorProfile(
  settings: ProfileSettings,
  id: string,
): ProfileSettings {
  return fromRes(selectColorProfileRes(toRes(settings), id))
}

export function deleteColorProfile(
  settings: ProfileSettings,
  id: string,
): ProfileSettings {
  return fromRes(deleteColorProfileRes(toRes(settings), id))
}

export function mergeSettings(
  current: ProfileSettings,
  imported: ProfileSettings,
): ProfileSettings {
  return fromRes(mergeSettingsRes(toRes(current), toRes(imported)))
}

// Any value, from storage or an imported file, as valid settings.
export function parseProfileSettings(value: unknown): ProfileSettings {
  return fromRes(parseProfileSettingsValueRes(value))
}
