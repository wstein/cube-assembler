// Cube geometry and sticker colors are independent: one color profile can
// serve cubes of several sizes, while each cube keeps its own sticker gap.
// Typed entry point for src/core/profiles/ProfileSettings.res.
import type { RGB } from './stickerColorGeometry'
import {
  colorPalette as colorPaletteRes,
  resolvedColorProfileSnapshot as resolvedColorProfileSnapshotRes,
  type colorProfile,
  type selection,
  type usedColorProfile,
} from '../core/profiles/ProfileSettings.gen'

export {
  activeColorProfile,
  activeCube,
  allColorProfiles,
  allCubes,
  autoColorsId as AUTO_COLORS_ID,
  builtinColorProfiles,
  // The same object every time for a size: the live camera effect depends
  // on the selected cube's sampling object staying stable.
  builtinCube,
  captureColorProfileSnapshot,
  captureColorsId as CAPTURE_COLORS_ID,
  // Automatic does not reuse a match from an earlier complete cube.
  capturePalette,
  copyColorProfile,
  copyCubeSetting,
  cubeGroupName,
  cubeSizes as CUBE_SIZES,
  cubesForSize,
  deleteColorProfile,
  deleteCube,
  emptySettings as EMPTY_SETTINGS,
  groupCubesByName,
  isBuiltinColorProfile,
  isBuiltinCube,
  mergeSettings,
  // Any value, from storage or an imported file, as valid settings.
  parseProfileSettingsValue as parseProfileSettings,
  // Saved profiles only; Generic, Automatic and the built-ins keep their
  // names.
  renameColorProfile,
  renameCube,
  saveColorProfile,
  saveCube,
  selectColorProfile,
  selectCube,
  setAutoColorMatch,
} from '../core/profiles/ProfileSettings.gen'

export type {
  colorProfile as ColorProfile,
  cubeSetting as CubeSetting,
  profileSettings as ProfileSettings,
  usedColorProfile as UsedColorProfile,
} from '../core/profiles/ProfileSettings.gen'

export function resolvedColorProfileSnapshot(
  active: colorProfile,
  selection: selection,
  colorFitPercent?: number,
): usedColorProfile {
  return resolvedColorProfileSnapshotRes(active, selection, colorFitPercent)
}

// The six colors of a profile, copied for editing.
export function colorPalette(profile: {
  colors: Record<string, RGB>
}): Record<string, RGB> {
  return colorPaletteRes(profile)
}
