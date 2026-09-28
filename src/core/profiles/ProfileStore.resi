@genType
let withSelectedColors: (
  ProfileSettings.profileSettings,
  Null.t<string>,
) => ProfileSettings.profileSettings

@genType
type learningOffer = {
  colors: Dict.t<StickerGeometry.rgb>,
  evidence: ColorProfileLearning.paletteEvidence,
  matchedProfileId: Null.t<string>,
  updatedProfileName?: string,
}

@genType
let withNewColors: (
  ProfileSettings.profileSettings,
  learningOffer,
  string,
  string,
  string,
) => ProfileSettings.profileSettings
@genType let updatableName: (ProfileSettings.profileSettings, Null.t<learningOffer>) => string

@genType type updated = {settings: ProfileSettings.profileSettings, offer: learningOffer}

@genType
let withUpdatedColors: (
  ProfileSettings.profileSettings,
  Null.t<learningOffer>,
  string,
) => Null.t<updated>
@genType
let autoColorProfiles: ProfileSettings.profileSettings => array<ProfileSettings.colorProfile>
@genType
let provisionalColorProfile: (
  array<ProfileSettings.colorProfile>,
  array<StickerGeometry.rgb>,
) => Null.t<ProfileSettings.colorProfile>
@genType
let capturePalette: (
  ProfileSettings.profileSettings,
  Null.t<ProfileSettings.colorProfile>,
) => option<Dict.t<StickerGeometry.rgb>>

@genType type previewProfile = {id: string, name: string, colors: Dict.t<StickerGeometry.rgb>}

@genType
let previewProfile: (
  ProfileSettings.profileSettings,
  Null.t<ProfileSettings.colorProfile>,
  array<ProfileSettings.colorProfile>,
  Null.t<string>,
) => option<previewProfile>
