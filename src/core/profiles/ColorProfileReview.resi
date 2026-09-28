@genType
type level = | @as("ok") Ok | @as("warn") Warn | @as("bad") Bad

@genType let splitColorLevel: float => (level, string)
@genType
let whiteBalancedColors: (Dict.t<StickerGeometry.rgb>, float) => Dict.t<StickerGeometry.rgb>
@genType
let colorsUnderWhite: (
  Dict.t<StickerGeometry.rgb>,
  StickerGeometry.rgb,
) => Dict.t<StickerGeometry.rgb>
@genType let profileDistance: (Dict.t<StickerGeometry.rgb>, Dict.t<StickerGeometry.rgb>) => float
@genType
let colorDifferences: (Dict.t<StickerGeometry.rgb>, Dict.t<StickerGeometry.rgb>) => Dict.t<float>
@genType let averageLimitFraction: float
@genType let withinMergeLimit: (Dict.t<float>, float) => bool

@genType
type comparable = {id: string, colors: Dict.t<StickerGeometry.rgb>}

@genType let groupSimilarProfileIndexes: (array<comparable>, float) => array<array<int>>

@genType
type worstColor = {color: string, value: float}
@genType
type groupSummary = {byColor: Dict.t<float>, worst: worstColor, average: float}

@genType let groupDifferences: array<ProfileSettings.withColors> => groupSummary
@genType let mergedColors: array<ProfileSettings.withColors> => Dict.t<StickerGeometry.rgb>

@genType
type merged = {settings: ProfileSettings.profileSettings, profile: ProfileSettings.colorProfile}

@genType
let mergeColorProfiles: (ProfileSettings.profileSettings, array<string>, string, string) => merged
@genType
let deleteColorProfiles: (
  ProfileSettings.profileSettings,
  array<string>,
) => ProfileSettings.profileSettings
@genType let colorDeletionEffects: (ProfileSettings.profileSettings, array<string>) => array<string>
@genType let unusedColorProfiles: ProfileSettings.profileSettings => array<string>

@genType let mixedDistance: float
@genType let closeDistance: float
@genType let pairDistance: (StickerGeometry.rgb, StickerGeometry.rgb) => float
@genType let pairLevel: float => (level, string)

@genType
type reviewFace = {
  face: string,
  label: string,
  colors: array<array<string>>,
  cellColors: array<array<StickerGeometry.rgb>>,
}

@genType
type tryOnCell = {measured: StickerGeometry.rgb, truth: string, readA: string, readB: string}

@genType
type tryOn = {
  faces: array<array<array<tryOnCell>>>,
  wrongA: int,
  wrongB: int,
  total: int,
  changes: Dict.t<int>,
}

@genType
let tryOnProfiles: (
  array<reviewFace>,
  bool,
  Dict.t<StickerGeometry.rgb>,
  Dict.t<StickerGeometry.rgb>,
) => Null.t<tryOn>
