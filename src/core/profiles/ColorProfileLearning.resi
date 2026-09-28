@genType
type paletteEvidence = {
  reviewedValid: bool,
  cameraOnly: bool,
  recalibrated: bool,
  confidentFraction: float,
  correctedFraction?: float,
}

@genType let canCreateProfileFromCapture: paletteEvidence => bool

@genType
type assessment = {accepted: bool, distance: float, reason?: string}

@genType
let assessPalette: (
  ProfileSettings.colorProfile,
  Dict.t<StickerGeometry.rgb>,
  paletteEvidence,
) => assessment
@genType
let shouldBlendColorProfile: (
  ProfileSettings.colorProfile,
  Dict.t<StickerGeometry.rgb>,
  paletteEvidence,
  bool,
) => bool
@genType
let blendColorProfile: (
  ProfileSettings.colorProfile,
  Dict.t<StickerGeometry.rgb>,
  string,
) => ProfileSettings.colorProfile
@genType
let updateProfileFromCapture: (
  ProfileSettings.colorProfile,
  Dict.t<StickerGeometry.rgb>,
  paletteEvidence,
  string,
) => Null.t<ProfileSettings.colorProfile>
@genType
let balancedPaletteDistance: (Dict.t<StickerGeometry.rgb>, Dict.t<StickerGeometry.rgb>) => float
@genType
let matchColorProfile: (
  array<ProfileSettings.colorProfile>,
  Dict.t<StickerGeometry.rgb>,
) => Null.t<ProfileSettings.colorProfile>
@genType
let matchPartialColorProfile: (
  array<ProfileSettings.colorProfile>,
  array<StickerGeometry.rgb>,
) => Null.t<ProfileSettings.colorProfile>
@genType
let profileColorFitPercent: (Dict.t<StickerGeometry.rgb>, Dict.t<StickerGeometry.rgb>) => float

@genType
type reason =
  | @as("clear") Clear
  | @as("preview") Preview
  | @as("nearest") Nearest
  | @as("tie") Tie
  | @as("far") Far
  | @as("none") NoProfiles

@genType
type nearestProfile = {profile: ProfileSettings.colorProfile, fit: float}

@genType
type automaticResolution = {
  profile: Null.t<ProfileSettings.colorProfile>,
  reason: reason,
  nearest: array<nearestProfile>,
}

@genType
let resolveAutomaticProfile: (
  array<ProfileSettings.colorProfile>,
  Dict.t<StickerGeometry.rgb>,
  Null.t<string>,
) => automaticResolution
@genType let summarizePreviewProfiles: array<Nullable.t<string>> => Null.t<string>
@genType
let captureProfileFinding: (array<Nullable.t<string>>, string, Null.t<reason>) => Null.t<string>

@genType
type updateChoice = {automatic: bool, resolvedId: Null.t<string>, selectedId: string}

@genType
let profileToUpdate: (
  array<ProfileSettings.colorProfile>,
  updateChoice,
  Dict.t<StickerGeometry.rgb>,
  paletteEvidence,
) => Null.t<ProfileSettings.colorProfile>
