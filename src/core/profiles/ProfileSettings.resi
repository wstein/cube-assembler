@genType
type cubeSetting = {
  id: string,
  name: string,
  size: int,
  sampling: StickerGeometry.samplingGeometry,
}

@genType
type colorProfile = {
  id: string,
  name: string,
  colors: Dict.t<StickerGeometry.rgb>,
  captures: int,
  updatedAt?: string,
}

@genType
type selection = | @as("automatic") Automatic | @as("manual") Manual

@genType
type usedColorProfile = {
  id: string,
  name: string,
  selection: selection,
  colors: Dict.t<StickerGeometry.rgb>,
  colorFitPercent?: float,
}

@genType
type profileSettings = {
  cubes: array<cubeSetting>,
  colors: array<colorProfile>,
  activeCubeBySize: Dict.t<string>,
  activeColorsId: string,
  autoMatchedColorsId?: string,
}

// A fresh id with the prefix that `taken` says no existing one uses.
let freshId: (string, string => bool) => string

@genType let cubeSizes: array<int>
@genType let autoColorsId: string
@genType let captureColorsId: string
@genType let emptySettings: profileSettings
@genType let builtinColorProfiles: unit => array<colorProfile>
@genType let isBuiltinColorProfile: string => bool
@genType let builtinCube: int => cubeSetting
@genType let isBuiltinCube: string => bool
@genType let allCubes: profileSettings => array<cubeSetting>
@genType let cubeGroupName: cubeSetting => string

@genType
type cubeGroup = {name: string, cubes: array<cubeSetting>}

@genType let groupCubesByName: profileSettings => array<cubeGroup>
@genType let cubesForSize: (profileSettings, int) => array<cubeSetting>
@genType let activeCube: (profileSettings, int) => cubeSetting
@genType let saveCube: (profileSettings, cubeSetting) => profileSettings
@genType let selectCube: (profileSettings, string) => profileSettings
@genType let copyCubeSetting: (profileSettings, cubeSetting, string) => cubeSetting
@genType let deleteCube: (profileSettings, string) => profileSettings
@genType let renameCube: (profileSettings, string, string) => profileSettings
@genType let renameColorProfile: (profileSettings, string, string) => profileSettings

@genType
type withColors = {colors: Dict.t<StickerGeometry.rgb>}

@genType let colorPalette: withColors => Dict.t<StickerGeometry.rgb>
@genType let copyColorProfile: (profileSettings, colorProfile, string) => colorProfile
@genType let allColorProfiles: profileSettings => array<colorProfile>
@genType let activeColorProfile: profileSettings => colorProfile
@genType let capturePalette: profileSettings => option<Dict.t<StickerGeometry.rgb>>
@genType let captureColorProfileSnapshot: Dict.t<StickerGeometry.rgb> => usedColorProfile
@genType
let resolvedColorProfileSnapshot: (colorProfile, selection, option<float>) => usedColorProfile
@genType let setAutoColorMatch: (profileSettings, Null.t<string>) => profileSettings
@genType let saveColorProfile: (profileSettings, colorProfile) => profileSettings
@genType let selectColorProfile: (profileSettings, string) => profileSettings
@genType let deleteColorProfile: (profileSettings, string) => profileSettings
@genType let mergeSettings: (profileSettings, profileSettings) => profileSettings
let parseProfileSettings: Untrusted.t => profileSettings
@genType let parseProfileSettingsValue: 'a => profileSettings
