// Cube geometry and sticker colors are independent: one color profile can
// serve cubes of several sizes, while each cube keeps its own sticker gap.
open StickerGeometry

type cubeSetting = {
  id: string,
  name: string,
  size: int,
  sampling: samplingGeometry,
}

type colorProfile = {
  id: string,
  name: string,
  colors: Dict.t<rgb>,
  captures: int,
  updatedAt?: string,
}

type selection = | @as("automatic") Automatic | @as("manual") Manual

type usedColorProfile = {
  id: string,
  name: string,
  selection: selection,
  colors: Dict.t<rgb>,
  colorFitPercent?: float,
}

type profileSettings = {
  cubes: array<cubeSetting>,
  colors: array<colorProfile>,
  // Keyed by cube size.
  activeCubeBySize: Dict.t<string>,
  activeColorsId: string,
  autoMatchedColorsId?: string,
}

let cubeSizes = [2, 3, 4, 5, 6, 7]
let autoColorsId = "auto-colors"
let captureColorsId = "capture-colors"
let colorKeys = ["W", "Y", "O", "R", "G", "B"]

let emptySettings = {
  cubes: [],
  colors: [],
  activeCubeBySize: Dict.make(),
  activeColorsId: autoColorsId,
}

let fail = message => JsError.throwWithMessage(message)

// As Number.isInteger.
let isInteger = n => Float.isFinite(n) && Math.floor(n) == n

type builtinProfile = {
  id: string,
  name: string,
  colors: Dict.t<rgb>,
  captures: int,
  updatedAt: string,
}
type profileCollection = {colors: array<builtinProfile>}
@module("../../../cube-assembler-profiles.json")
external profileCollection: profileCollection = "default"

let builtinColorProfileList = profileCollection.colors->Array.map((profile): colorProfile => {
  id: profile.id,
  name: profile.name,
  colors: profile.colors,
  captures: profile.captures,
  updatedAt: profile.updatedAt,
})
let defaultColorProfile =
  builtinColorProfileList->Array.find(profile => profile.name == "Classic")->Option.getOrThrow

let builtinColorProfiles = () => builtinColorProfileList

let isBuiltinColorProfile = id =>
  id == autoColorsId || builtinColorProfileList->Array.some(profile => profile.id == id)

let freeze: 'a => 'a = value => Object.freeze(Obj.magic(value))->Obj.magic

// Kept stable: the live camera effect depends on the selected cube's
// sampling object, and recreating Generic on each render would restart it
// and reset auto-capture before its frames can accumulate.
let builtinCubes = cubeSizes->Array.map(size =>
  freeze({
    id: `builtin-generic-${Int.toString(size)}`,
    name: `Generic ${Int.toString(size)}×${Int.toString(size)}`,
    size,
    sampling: freeze({stickerCore: 0.6}),
  })
)

let builtinCube = size =>
  switch builtinCubes->Array.find(cube => cube.size == size) {
  | Some(cube) => cube
  | None => fail("Unsupported cube size")
  }

let isBuiltinCube = id => builtinCubes->Array.some(cube => cube.id == id)

let allCubes = (settings: profileSettings) => [...builtinCubes, ...settings.cubes]

let cubeGroupName = (cube: cubeSetting) => {
  let size = Int.toString(cube.size)
  let suffix = RegExp.fromString(`\\s*${size}\\s*[×xX]\\s*${size}\\s*$`)
  let trimmed = cube.name->String.replaceRegExp(suffix, "")->String.trim
  trimmed == "" ? cube.name : trimmed
}

type cubeGroup = {name: string, cubes: array<cubeSetting>}

let groupCubesByName = (settings: profileSettings) => {
  let groups: array<cubeGroup> = []
  allCubes(settings)->Array.forEach(cube => {
    let name = cubeGroupName(cube)
    switch groups->Array.findIndex(group => group.name == name) {
    | -1 => groups->Array.push({name, cubes: [cube]})
    | index => (groups->Array.getUnsafe(index)).cubes->Array.push(cube)
    }
  })
  groups->Array.map(group => {
    ...group,
    cubes: group.cubes->Array.toSorted((a, b) => Int.toFloat(a.size - b.size)),
  })
}

let cubesForSize = (settings: profileSettings, size) =>
  allCubes(settings)->Array.filter(cube => cube.size == size)

let activeCube = (settings: profileSettings, size) => {
  let active = settings.activeCubeBySize->Dict.get(Int.toString(size))
  switch cubesForSize((settings: profileSettings), size)->Array.find(cube =>
    Some(cube.id) == active
  ) {
  | Some(cube) => cube
  | None => builtinCube(size)
  }
}

let validCubeSetting = (cube: cubeSetting) =>
  cube.id != "" &&
  cube.name->String.trim != "" &&
  cubeSizes->Array.includes(cube.size) &&
  Float.isFinite(cube.sampling.stickerCore) &&
  cube.sampling.stickerCore > 0.0 &&
  cube.sampling.stickerCore <= 1.0

let withActiveCube = (settings: profileSettings, size, id) => {
  let active = Dict.copy(settings.activeCubeBySize)
  active->Dict.set(Int.toString(size), id)
  active
}

let saveCube = (settings: profileSettings, cube: cubeSetting) => {
  if isBuiltinCube(cube.id) {
    fail("Cannot change a built-in cube")
  }
  if !validCubeSetting(cube) {
    fail("Invalid cube")
  }
  let exists = settings.cubes->Array.some(saved => saved.id == cube.id)
  {
    ...settings,
    cubes: exists
      ? settings.cubes->Array.map(saved => saved.id == cube.id ? cube : saved)
      : [...settings.cubes, cube],
    activeCubeBySize: withActiveCube((settings: profileSettings), cube.size, cube.id),
  }
}

let selectCube = (settings: profileSettings, id) =>
  switch allCubes(settings)->Array.find(candidate => candidate.id == id) {
  | Some(cube) => {
      ...settings,
      activeCubeBySize: withActiveCube((settings: profileSettings), cube.size, id),
    }
  | None => fail("Unknown cube")
  }

let randomSuffix = () => Math.random()->Float.toString(~radix=36)->String.slice(~start=2, ~end=8)

// A fresh id with `prefix` that no existing one uses.
let freshId = (prefix, taken) => {
  let id = ref("")
  let searching = ref(true)
  while searching.contents {
    id := `${prefix}-${Float.toString(Date.now())}-${randomSuffix()}`
    searching := taken(id.contents)
  }
  id.contents
}

let copyCubeSetting = (settings: profileSettings, cube: cubeSetting, name) => {
  let trimmed = name->String.trim->String.slice(~start=0, ~end=60)
  if trimmed == "" {
    fail("Cube name required")
  }
  let id = freshId("cube", id => allCubes(settings)->Array.some(saved => saved.id == id))
  {id, name: trimmed, size: cube.size, sampling: {stickerCore: cube.sampling.stickerCore}}
}

let deleteCube = (settings: profileSettings, id) => {
  if isBuiltinCube(id) {
    fail("Cannot delete a built-in cube")
  }
  let activeCubeBySize = Dict.fromArray(
    settings.activeCubeBySize->Dict.toArray->Array.filter(((_, active)) => active != id),
  )
  {...settings, cubes: settings.cubes->Array.filter(cube => cube.id != id), activeCubeBySize}
}

let profileName = (name, what) => {
  let trimmed = name->String.trim->String.slice(~start=0, ~end=60)
  if trimmed == "" {
    fail(`${what} name required`)
  }
  trimmed
}

// Renames a saved cube; built-in Generic cubes keep their names.
let renameCube = (settings: profileSettings, id, name) => {
  if isBuiltinCube(id) {
    fail("Cannot rename a built-in cube")
  }
  if !(settings.cubes->Array.some(cube => cube.id == id)) {
    fail("Unknown cube")
  }
  let trimmed = profileName(name, "Cube")
  {
    ...settings,
    cubes: settings.cubes->Array.map(cube => cube.id == id ? {...cube, name: trimmed} : cube),
  }
}

// Renames a saved color profile; Generic and Automatic keep their names.
let renameColorProfile = (settings: profileSettings, id, name) => {
  if isBuiltinColorProfile(id) {
    fail("Cannot rename built-in colors")
  }
  if !(settings.colors->Array.some(profile => profile.id == id)) {
    fail("Unknown color profile")
  }
  let trimmed = profileName(name, "Color profile")
  {
    ...settings,
    colors: settings.colors->Array.map((profile): colorProfile =>
      profile.id == id ? {...profile, name: trimmed} : profile
    ),
  }
}

// A copy of an object, as JS spread copies it (a missing value becomes {}).
let copyObject: 'a => 'a = value => Object.assign(Object.make(), Obj.magic(value))->Obj.magic

type withColors = {colors: Dict.t<rgb>}

// The six colors of a profile, copied.
let colorPalette = (profile: withColors) =>
  Dict.fromArray(
    colorKeys->Array.map(key => (key, copyObject(profile.colors->Dict.getUnsafe(key)))),
  )

let allColorProfiles = (settings: profileSettings) =>
  [
    {...defaultColorProfile, id: autoColorsId, name: "Automatic colors"},
    ...builtinColorProfileList,
    ...settings.colors->Array.filter(profile => !isBuiltinColorProfile(profile.id)),
  ]

let copyColorProfile = (settings: profileSettings, source: colorProfile, name): colorProfile => {
  let trimmed = name->String.trim->String.slice(~start=0, ~end=60)
  if trimmed == "" {
    fail("Color profile name required")
  }
  let id = freshId("colors", id =>
    allColorProfiles(settings)->Array.some(profile => profile.id == id)
  )
  {id, name: trimmed, colors: colorPalette({colors: source.colors}), captures: 0}
}

let findColorProfile = (settings: profileSettings, id) =>
  allColorProfiles(settings)->Array.find(profile => Some(profile.id) == id)

let activeColorProfile = (settings: profileSettings) =>
  (
    settings.activeColorsId == autoColorsId
      ? findColorProfile((settings: profileSettings), settings.autoMatchedColorsId)
      : findColorProfile((settings: profileSettings), Some(settings.activeColorsId))
  )->Option.getOr(defaultColorProfile)

// Automatic does not reuse a match from an earlier complete cube; the
// capture UI may supply a provisional palette matched from this cube.
let capturePalette = (settings: profileSettings) =>
  settings.activeColorsId == autoColorsId
    ? None
    : Some(colorPalette({colors: activeColorProfile(settings).colors}))

let captureColorProfileSnapshot = colors => {
  id: captureColorsId,
  name: "Colors from this capture",
  selection: Automatic,
  colors: colorPalette({colors: colors}),
}

let resolvedColorProfileSnapshot = (active: colorProfile, selection, colorFitPercent) =>
  switch colorFitPercent {
  | Some(percent) => {
      id: active.id,
      name: active.name,
      selection,
      colors: colorPalette({colors: active.colors}),
      colorFitPercent: percent,
    }
  | None => {
      id: active.id,
      name: active.name,
      selection,
      colors: colorPalette({colors: active.colors}),
    }
  }

let withoutAutoMatch = (settings: profileSettings) => {
  cubes: settings.cubes,
  colors: settings.colors,
  activeCubeBySize: settings.activeCubeBySize,
  activeColorsId: settings.activeColorsId,
}

let setAutoColorMatch = (settings: profileSettings, id) =>
  switch Null.toOption(id) {
  | None => withoutAutoMatch(settings)
  | Some(id) =>
    if (
      !(allColorProfiles(settings)->Array.some(profile => profile.id == id && id != autoColorsId))
    ) {
      fail("Unknown color profile")
    }
    {...settings, autoMatchedColorsId: id}
  }

let validColorValues = (colors: Untrusted.t) =>
  Untrusted.isObject(colors) &&
  colorKeys->Array.every(key =>
    ["r", "g", "b"]->Array.every(channel =>
      switch colors
      ->Untrusted.field(key)
      ->Option.flatMap(rgb => rgb->Untrusted.field(channel))
      ->Option.flatMap(Untrusted.number) {
      | Some(n) => Float.isFinite(n) && n >= 0.0 && n <= 255.0
      | None => false
      }
    )
  )

let nonEmptyString = (value, key) =>
  value->Untrusted.field(key)->Option.flatMap(Untrusted.string)->Option.filter(s => s != "")

let validColorProfile = (value: Untrusted.t) =>
  switch (
    nonEmptyString(value, "id"),
    nonEmptyString(value, "name"),
    value->Untrusted.field("captures")->Option.flatMap(Untrusted.number),
  ) {
  | (Some(_), Some(name), Some(captures)) =>
    name->String.trim != "" &&
    value->Untrusted.field("colors")->Option.mapOr(false, validColorValues) &&
    isInteger(captures) &&
    captures >= 0.0
  | _ => false
  }

let saveColorProfile = (settings: profileSettings, profile: colorProfile) => {
  if isBuiltinColorProfile(profile.id) {
    fail("Cannot change built-in colors")
  }
  if !validColorProfile(Untrusted.fromAny(profile)) {
    fail("Invalid color profile")
  }
  let exists = settings.colors->Array.some(saved => saved.id == profile.id)
  {
    ...settings,
    colors: exists
      ? settings.colors->Array.map(saved => saved.id == profile.id ? profile : saved)
      : [...settings.colors, profile],
    activeColorsId: profile.id,
  }
}

let selectColorProfile = (settings: profileSettings, id) => {
  if !(allColorProfiles(settings)->Array.some(profile => profile.id == id)) {
    fail("Unknown color profile")
  }
  {...settings, activeColorsId: id}
}

let deleteColorProfile = (settings: profileSettings, id) => {
  if isBuiltinColorProfile(id) {
    fail("Cannot delete built-in colors")
  }
  {
    cubes: settings.cubes,
    colors: settings.colors->Array.filter(profile => profile.id != id),
    activeCubeBySize: settings.activeCubeBySize,
    activeColorsId: settings.activeColorsId == id ? autoColorsId : settings.activeColorsId,
    autoMatchedColorsId: ?(
      settings.autoMatchedColorsId == Some(id) ? None : settings.autoMatchedColorsId
    ),
  }
}

// A cube setting read from an unknown value, if it is a valid one.
let parseCube = (value: Untrusted.t) =>
  switch (
    nonEmptyString(value, "id"),
    nonEmptyString(value, "name"),
    value->Untrusted.field("size")->Option.flatMap(Untrusted.number),
    value
    ->Untrusted.field("sampling")
    ->Option.flatMap(sampling => sampling->Untrusted.field("stickerCore"))
    ->Option.flatMap(Untrusted.number),
  ) {
  | (Some(id), Some(name), Some(size), Some(stickerCore))
    if name->String.trim != "" &&
    isInteger(size) &&
    cubeSizes->Array.includes(Float.toInt(size)) &&
    Float.isFinite(stickerCore) &&
    stickerCore > 0.0 &&
    stickerCore <= 1.0 =>
    Some({
      id,
      name: name->String.slice(~start=0, ~end=60),
      size: Float.toInt(size),
      sampling: {stickerCore: stickerCore},
    })
  | _ => None
  }

let parseColorProfile = (value: Untrusted.t): option<colorProfile> =>
  if !validColorProfile(value) {
    None
  } else {
    let text = key => value->Untrusted.field(key)->Option.flatMap(Untrusted.string)
    let colors: Dict.t<rgb> = Obj.magic(value->Untrusted.field("colors")->Option.getOrThrow)
    let base: colorProfile = {
      id: text("id")->Option.getOrThrow,
      name: text("name")->Option.getOrThrow->String.slice(~start=0, ~end=60),
      colors: colorPalette({colors: colors}),
      captures: value
      ->Untrusted.field("captures")
      ->Option.flatMap(Untrusted.number)
      ->Option.getOrThrow
      ->Float.toInt,
    }
    Some(
      switch text("updatedAt") {
      | Some(updatedAt) => {...base, updatedAt}
      | None => base
      },
    )
  }

let parseProfileSettings = (value: Untrusted.t) =>
  switch (
    value->Untrusted.field("cubes")->Option.flatMap(Untrusted.array),
    value->Untrusted.field("colors")->Option.flatMap(Untrusted.array),
  ) {
  | (Some(rawCubes), Some(rawColors)) =>
    let cubes = rawCubes->Array.filterMap(parseCube)->Array.filter(cube => !isBuiltinCube(cube.id))
    let colors =
      rawColors
      ->Array.filterMap(parseColorProfile)
      ->Array.filter(profile => !isBuiltinColorProfile(profile.id))
    let activeCubeBySize = Dict.make()
    value
    ->Untrusted.field("activeCubeBySize")
    ->Option.mapOr([], Untrusted.entries)
    ->Array.forEach(((key, id)) =>
      switch (Int.fromString(key), Untrusted.string(id)) {
      | (Some(size), Some(id))
        if cubeSizes->Array.includes(size) &&
        Int.toString(size) == key &&
        [...cubes, builtinCube(size)]->Array.some(cube => cube.id == id && cube.size == size) =>
        activeCubeBySize->Dict.set(key, id)
      | _ => ()
      }
    )
    let activeColorsId = switch value
    ->Untrusted.field("activeColorsId")
    ->Option.flatMap(Untrusted.string) {
    | Some(id) if isBuiltinColorProfile(id) || colors->Array.some(profile => profile.id == id) => id
    | _ => autoColorsId
    }
    let autoMatchedColorsId =
      value
      ->Untrusted.field("autoMatchedColorsId")
      ->Option.flatMap(Untrusted.string)
      ->Option.filter(id =>
        [...builtinColorProfileList, ...colors]->Array.some(profile => profile.id == id)
      )
    switch autoMatchedColorsId {
    | Some(id) if id != "" => {
        cubes,
        colors,
        activeCubeBySize,
        activeColorsId,
        autoMatchedColorsId: id,
      }
    | _ => {cubes, colors, activeCubeBySize, activeColorsId}
    }
  | _ => emptySettings
  }

// `saved` with each addition replacing the item with its id, or appended.
let replaceOrAdd = (saved, additions, id) => {
  let result = Array.copy(saved)
  additions->Array.forEach(item =>
    switch result->Array.findIndex(existing => id(existing) == id(item)) {
    | -1 => result->Array.push(item)
    | index => result->Array.setUnsafe(index, item)
    }
  )
  result
}

let mergeSettings = (current: profileSettings, imported: profileSettings) => {
  let activeCubeBySize = Dict.copy(current.activeCubeBySize)
  imported.activeCubeBySize->Dict.forEachWithKey((id, size) => activeCubeBySize->Dict.set(size, id))
  let merged = {
    cubes: replaceOrAdd(current.cubes, imported.cubes, (cube: cubeSetting) => cube.id),
    colors: replaceOrAdd(current.colors, imported.colors, (profile: colorProfile) => profile.id),
    activeCubeBySize,
    activeColorsId: imported.activeColorsId,
    autoMatchedColorsId: ?switch imported.autoMatchedColorsId {
    | Some(id) => Some(id)
    | None => current.autoMatchedColorsId
    },
  }
  parseProfileSettings(Untrusted.fromAny(merged))
}

// For TypeScript: any value, from storage or an imported file.
let parseProfileSettingsValue = value => parseProfileSettings(Untrusted.fromAny(value))
