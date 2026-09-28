@genType
let duplicateCubeGroups: (
  ProfileSettings.profileSettings,
  float,
) => array<array<ProfileSettings.cubeSetting>>

@genType
type merged = {settings: ProfileSettings.profileSettings, cube: ProfileSettings.cubeSetting}

@genType let mergeCubes: (ProfileSettings.profileSettings, array<string>, string) => merged
@genType
let replaceCubes: (
  ProfileSettings.profileSettings,
  array<string>,
  string,
) => ProfileSettings.profileSettings
@genType
let deleteCubes: (ProfileSettings.profileSettings, array<string>) => ProfileSettings.profileSettings
@genType let cubeDeletionEffects: (ProfileSettings.profileSettings, array<string>) => array<string>
@genType let cubesSameAsGeneric: ProfileSettings.profileSettings => array<string>
@genType let unusedCubes: ProfileSettings.profileSettings => array<string>
