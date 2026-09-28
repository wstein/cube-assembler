@genType let profileSettingsKey: string
@genType let settingsFileType: string
@genType let settingsFile: ProfileSettings.profileSettings => Dict.t<JSON.t>
@genType let parseSettingsFile: 'a => Null.t<ProfileSettings.profileSettings>
@genType let storedText: ProfileSettings.profileSettings => string
@genType let parseStoredText: Null.t<string> => ProfileSettings.profileSettings
