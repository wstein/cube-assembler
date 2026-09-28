// Reviewing saved color profiles side by side. Captures are white balanced
// before colors are learned, so two profiles that differ only by the room
// light describe the same stickers. Balancing each profile on its own White
// (von Kries, in linear light) takes that light out before comparing, and
// profiles that stay close can be merged into one.
open StickerGeometry
open! ColorMath
open ProfileSettings

let colorKeys = ["W", "Y", "O", "R", "G", "B"]
// White is equal after balancing, so only these tell profiles apart.
let huedKeys = ["Y", "O", "R", "G", "B"]
// Balanced White: a neutral grey at 90% of full linear brightness.
let balancedWhite = 0.9

type level = | @as("ok") Ok | @as("warn") Warn | @as("bad") Bad

// Labels for one A/B sticker swatch, kept separate from the stricter merge
// gate.
let splitColorLevel = deltaE =>
  deltaE < 3.0 ? (Ok, "same") : deltaE < 12.0 ? (Warn, "slightly different") : (Bad, "different")

let toLinear = (c: rgb) => [
  srgbChannelToLinear(c.r),
  srgbChannelToLinear(c.g),
  srgbChannelToLinear(c.b),
]
let luminance = linear =>
  0.2126 *. linear->Array.getUnsafe(0) +.
  0.7152 *. linear->Array.getUnsafe(1) +.
  0.0722 *. linear->Array.getUnsafe(2)

let fromLinear = channels => {
  r: linearChannelToSrgb(channels->Array.getUnsafe(0)),
  g: linearChannelToSrgb(channels->Array.getUnsafe(1)),
  b: linearChannelToSrgb(channels->Array.getUnsafe(2)),
}

// `colors` scaled per channel in linear light from white `from` to white
// `to`.
let rescaled = (colors: Dict.t<rgb>, to) => {
  let from = toLinear(colors->Dict.getUnsafe("W"))->Array.map(v => Math.max(v, 1e-4))
  Dict.fromArray(
    colors
    ->Dict.toArray
    ->Array.map(((key, color)) => (
      key,
      fromLinear(
        toLinear(color)->Array.mapWithIndex((v, i) =>
          v /. from->Array.getUnsafe(i) *. to->Array.getUnsafe(i)
        ),
      ),
    )),
  )
}

// `colors` scaled per channel so White becomes a neutral grey of linear
// brightness `white`; every other color keeps its relation to White.
let whiteBalancedColors = (colors, white) => rescaled(colors, [white, white, white])

// The reverse: `colors` as they look under `white`.
let colorsUnderWhite = (colors, white) => rescaled(colors, toLinear(white))

let difference = (x: rgb, y: rgb) => {
  let p = rgbToOklab(x)
  let q = rgbToOklab(y)
  100.0 *. Math.hypotMany([p.l -. q.l, p.a -. q.a, p.b -. q.b])
}

// OKLab distance x 100 per colored sticker once both profiles are balanced
// on their own White.
let colorDifferences = (a, b) => {
  let p = whiteBalancedColors(a, balancedWhite)
  let q = whiteBalancedColors(b, balancedWhite)
  Dict.fromArray(
    huedKeys->Array.map(key => (key, difference(p->Dict.getUnsafe(key), q->Dict.getUnsafe(key)))),
  )
}

let mean = values =>
  values->Array.reduce(0.0, (sum, v) => sum +. v) /. Int.toFloat(Array.length(values))
let maximum = values => values->Array.reduce(Float.Constants.negativeInfinity, Math.max)

// Mean difference of the five colored stickers: under 5 is hard to tell
// apart.
let profileDistance = (a, b) => colorDifferences(a, b)->Dict.valuesToArray->mean

// Two profiles may be merged when no colored sticker differs by more than
// `limit`, and their average stays within this share of it: one far color
// must not hide behind four close ones, and five colors all just under the
// limit still make a different set of stickers.
let averageLimitFraction = 2.0 /. 3.0

let withinMergeLimit = (differences: Dict.t<float>, limit) => {
  let values = differences->Dict.valuesToArray
  maximum(values) <= limit +. 1e-9 && mean(values) <= limit *. averageLimitFraction +. 1e-9
}

type comparable = {id: string, colors: Dict.t<rgb>}

// Groups in which every pair of profiles is within the merge limit
// (complete linkage), closest pairs by worst color first - so a chain of
// near neighbours never pulls two different cubes together. As indexes.
let groupSimilarProfileIndexes = (profiles: array<comparable>, limit) => {
  let cache = Dict.make()
  let between = (i, j) => {
    let a = profiles->Array.getUnsafe(i)
    let b = profiles->Array.getUnsafe(j)
    let key = a.id < b.id ? `${a.id}\n${b.id}` : `${b.id}\n${a.id}`
    switch cache->Dict.get(key) {
    | Some(pair) => pair
    | None =>
      let differences = colorDifferences(a.colors, b.colors)
      let pair = (withinMergeLimit(differences, limit), maximum(differences->Dict.valuesToArray))
      cache->Dict.set(key, pair)
      pair
    }
  }
  let groups = profiles->Array.mapWithIndex((_, i) => [i])
  let merging = ref(true)
  while merging.contents {
    let best = ref(None)
    for i in 0 to Array.length(groups) - 1 {
      for j in i + 1 to Array.length(groups) - 1 {
        let worst = ref(0.0)
        let fits = ref(true)
        groups
        ->Array.getUnsafe(i)
        ->Array.forEach(a =>
          groups
          ->Array.getUnsafe(j)
          ->Array.forEach(b => {
            let (pairFits, pairWorst) = between(a, b)
            fits := fits.contents && pairFits
            worst := Math.max(worst.contents, pairWorst)
          })
        )
        let better = switch best.contents {
        | Some((bestWorst, _, _)) => worst.contents < bestWorst
        | None => true
        }
        if fits.contents && better {
          best := Some((worst.contents, i, j))
        }
      }
    }
    switch best.contents {
    | None => merging := false
    | Some((_, i, j)) =>
      groups->Array.getUnsafe(i)->Array.pushMany(groups->Array.getUnsafe(j))
      groups->Array.splice(~start=j, ~remove=1, ~insert=[])
    }
  }
  groups
}

type worstColor = {color: string, value: float}
type groupSummary = {byColor: Dict.t<float>, worst: worstColor, average: float}

// A group's largest difference per colored sticker over all pairs, its
// worst color, and its largest average difference.
let groupDifferences = (profiles: array<withColors>) => {
  let byColor = Dict.fromArray(huedKeys->Array.map(key => (key, 0.0)))
  let average = ref(0.0)
  profiles->Array.forEachWithIndex((a, i) =>
    profiles->Array.forEachWithIndex((b, j) =>
      if j > i {
        let differences = colorDifferences(a.colors, b.colors)
        huedKeys->Array.forEach(
          key =>
            byColor->Dict.set(
              key,
              Math.max(byColor->Dict.getUnsafe(key), differences->Dict.getUnsafe(key)),
            ),
        )
        average := Math.max(average.contents, differences->Dict.valuesToArray->mean)
      }
    )
  )
  let color =
    huedKeys->Array.reduce("Y", (worst, key) =>
      byColor->Dict.getUnsafe(key) > byColor->Dict.getUnsafe(worst) ? key : worst
    )
  {byColor, worst: {color, value: byColor->Dict.getUnsafe(color)}, average: average.contents}
}

// The members balanced to their mean White brightness and averaged in
// linear light: the merged profile keeps the exposure its captures had.
let mergedColors = (profiles: array<withColors>) => {
  let white =
    profiles->Array.map(profile => luminance(toLinear(profile.colors->Dict.getUnsafe("W"))))->mean
  let balanced = profiles->Array.map(profile => whiteBalancedColors(profile.colors, white))
  Dict.fromArray(
    colorKeys->Array.map(key => (
      key,
      fromLinear(
        [0, 1, 2]->Array.map(i =>
          balanced
          ->Array.map(colors => toLinear(colors->Dict.getUnsafe(key))->Array.getUnsafe(i))
          ->mean
        ),
      ),
    )),
  )
}

let unique = ids => {
  let seen = []
  ids->Array.forEach(id =>
    if !(seen->Array.includes(id)) {
      seen->Array.push(id)
    }
  )
  seen
}

type merged = {settings: profileSettings, profile: colorProfile}

// Replaces the profiles `ids` with one merged profile named `name`, placed
// where the first of them was. The selection and the automatic match move
// to it when they pointed at a merged profile.
let mergeColorProfiles = (settings: profileSettings, ids, name, updatedAt) => {
  let ids = unique(ids)
  if Array.length(ids) < 2 {
    JsError.throwWithMessage("Pick at least two color profiles")
  }
  if ids->Array.some(isBuiltinColorProfile) {
    JsError.throwWithMessage("Cannot merge built-in colors")
  }
  let members = ids->Array.map(id => settings.colors->Array.find(profile => profile.id == id))
  if members->Array.some(Option.isNone) {
    JsError.throwWithMessage("Unknown color profile")
  }
  let members = members->Array.filterMap(member => member)
  let trimmed = name->String.trim->String.slice(~start=0, ~end=60)
  if trimmed == "" {
    JsError.throwWithMessage("Color profile name required")
  }
  let gone = id => ids->Array.includes(id)
  let id = freshId("colors", id => settings.colors->Array.some(profile => profile.id == id))
  let profile: colorProfile = {
    id,
    name: trimmed,
    colors: mergedColors(members->Array.map(member => {colors: member.colors})),
    captures: members->Array.reduce(0, (sum, member) => sum + member.captures),
    updatedAt,
  }
  let colors = settings.colors->Array.filter(profile => !gone(profile.id))
  colors->Array.splice(
    ~start=settings.colors->Array.findIndex(profile => gone(profile.id)),
    ~remove=0,
    ~insert=[profile],
  )
  let moved = current => gone(current) ? id : current
  let base = {
    cubes: settings.cubes,
    colors,
    activeCubeBySize: settings.activeCubeBySize,
    activeColorsId: moved(settings.activeColorsId),
  }
  {
    settings: switch settings.autoMatchedColorsId->Option.map(moved) {
    | Some(autoMatchedColorsId) if autoMatchedColorsId != "" => {...base, autoMatchedColorsId}
    | _ => base
    },
    profile,
  }
}

// Deletes the saved color profiles `ids`: a deleted selection goes back to
// Automatic, a deleted automatic match is cleared.
let deleteColorProfiles = (settings: profileSettings, ids) => {
  let ids = unique(ids)
  if ids->Array.some(isBuiltinColorProfile) {
    JsError.throwWithMessage("Cannot delete built-in colors")
  }
  if ids->Array.some(id => !(settings.colors->Array.some(profile => profile.id == id))) {
    JsError.throwWithMessage("Unknown color profile")
  }
  let next = ids->Array.reduce(settings, deleteColorProfile)
  switch next.autoMatchedColorsId {
  | Some(_) => next
  | None => {
      cubes: next.cubes,
      colors: next.colors,
      activeCubeBySize: next.activeCubeBySize,
      activeColorsId: next.activeColorsId,
    }
  }
}

// What deleting `ids` changes for the selected and the automatic colors.
let colorDeletionEffects = (settings: profileSettings, ids) => {
  let gone = id => ids->Array.includes(id)
  [
    ...gone(settings.activeColorsId) ? ["Colors switch to Automatic"] : [],
    ...settings.autoMatchedColorsId->Option.mapOr(false, id => id != "" && gone(id))
      ? ["Automatic looks for a new match"]
      : [],
  ]
}

// Saved color profiles that are neither selected nor the automatic match.
let unusedColorProfiles = (settings: profileSettings) =>
  settings.colors
  ->Array.filter(profile =>
    profile.id != settings.activeColorsId && Some(profile.id) != settings.autoMatchedColorsId
  )
  ->Array.map(profile => profile.id)
