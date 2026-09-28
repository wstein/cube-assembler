// The profiles file and stored settings: version 3 of the format, with the
// cube and color profiles as ProfileSettings writes them.
open ProfileSettings

let profileSettingsKey = "cube-assembler-profiles-v1"
let settingsFileType = "cube-assembler-profiles"

let isV3 = (value: Untrusted.t) =>
  value->Untrusted.field("version")->Option.flatMap(Untrusted.number) == Some(3.0) &&
  value->Untrusted.field("cubes")->Option.flatMap(Untrusted.array)->Option.isSome &&
  value->Untrusted.field("colors")->Option.flatMap(Untrusted.array)->Option.isSome

// The settings with the file's type and version in front.
let withHeader = (header, settings: profileSettings): Dict.t<JSON.t> => {
  let file = Dict.fromArray(header)
  Obj.magic(settings)->Dict.forEachWithKey((value, key) => file->Dict.set(key, value))
  file
}

let settingsFile = settings =>
  withHeader([("type", JSON.String(settingsFileType)), ("version", JSON.Number(3.0))], settings)

// Settings from an imported profiles file, or null when it isn't one.
let parseSettingsFile = value => {
  let value = Untrusted.fromAny(value)
  value->Untrusted.field("type")->Option.flatMap(Untrusted.string) == Some(settingsFileType) &&
    isV3(value)
    ? Null.make(parseProfileSettings(value))
    : Null.null
}

// What is stored: the settings with the format version.
let storedText = settings =>
  JSON.stringifyAny(withHeader([("version", JSON.Number(3.0))], settings))->Option.getOr("")

// Stored settings; corrupt or missing ones start with the built-in profiles.
let parseStoredText = text =>
  switch Null.toOption(text) {
  | Some(text) if text != "" =>
    switch JSON.parseOrThrow(text) {
    | data =>
      isV3(Untrusted.fromAny(data)) ? parseProfileSettings(Untrusted.fromAny(data)) : emptySettings
    | exception _ => emptySettings
    }
  | _ => emptySettings
  }
