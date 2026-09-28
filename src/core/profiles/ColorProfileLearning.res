// When a reviewed capture's learned colors may create or update a color
// profile, how Automatic picks a saved profile, and how that is reported.
open StickerGeometry
open! ColorMath
open ProfileSettings

let colorKeys = ["W", "Y", "O", "R", "G", "B"]

type paletteEvidence = {
  reviewedValid: bool,
  cameraOnly: bool,
  recalibrated: bool,
  confidentFraction: float,
  correctedFraction?: float,
}

let canCreateProfileFromCapture = (evidence: paletteEvidence) =>
  evidence.reviewedValid &&
  evidence.cameraOnly &&
  evidence.recalibrated &&
  evidence.confidentFraction >= 0.8 &&
  evidence.correctedFraction->Option.getOr(0.0) <= 0.02

type assessment = {accepted: bool, distance: float, reason?: string}

let single = (key, colors: Dict.t<rgb>) =>
  Dict.fromArray(
    switch colors->Dict.get(key) {
    | Some(color) => [(key, color)]
    | None => []
    },
  )

// The saved fixture palettes overlap heavily across named cubes. The update
// limits catch large shifts; they never identify physical cube geometry.
let assessPalette = (profile: colorProfile, measured, evidence) => {
  let distance = Recalibration.paletteDistance(profile.colors, measured)
  if !canCreateProfileFromCapture(evidence) {
    {accepted: false, distance, reason: "Capture quality is too low to update colors"}
  } else if profile.captures == 0 {
    {accepted: true, distance}
  } else {
    let largest =
      colorKeys->Array.reduce(Float.Constants.negativeInfinity, (largest, key) =>
        Math.max(
          largest,
          Recalibration.paletteDistance(single(key, profile.colors), single(key, measured)),
        )
      )
    distance > 0.08 || largest > 0.14
      ? {accepted: false, distance, reason: "Measured colors are too far from this profile"}
      : {accepted: true, distance}
  }
}

let shouldBlendColorProfile = (profile: colorProfile, measured, evidence, automatic) =>
  !automatic &&
  !isBuiltinColorProfile(profile.id) &&
  assessPalette(profile, measured, evidence).accepted

let blendColorProfile = (profile: colorProfile, measured: Dict.t<rgb>, updatedAt): colorProfile => {
  if isBuiltinColorProfile(profile.id) {
    JsError.throwWithMessage("Cannot update built-in colors")
  }
  let weight = profile.captures == 0 ? 1.0 : Math.max(0.2, 1.0 /. Int.toFloat(profile.captures + 1))
  let colors = Dict.fromArray(
    colorKeys->Array.map(key => {
      let old = rgbToOklab(profile.colors->Dict.getUnsafe(key))
      let fresh = rgbToOklab(measured->Dict.getUnsafe(key))
      (
        key,
        oklabToRgb({
          l: old.l *. (1.0 -. weight) +. fresh.l *. weight,
          a: old.a *. (1.0 -. weight) +. fresh.a *. weight,
          b: old.b *. (1.0 -. weight) +. fresh.b *. weight,
        }),
      )
    }),
  )
  {...profile, colors, captures: profile.captures + 1, updatedAt}
}

// Called only by the explicit Update profile action for an Automatic match.
let updateProfileFromCapture = (profile: colorProfile, measured, evidence, updatedAt) =>
  !isBuiltinColorProfile(profile.id) && assessPalette(profile, measured, evidence).accepted
    ? Null.make(blendColorProfile(profile, measured, updatedAt))
    : Null.null

// Each color scaled per channel so White becomes a neutral grey at 90%
// linear brightness, in Oklab.
let balancedOklab = (colors: Dict.t<rgb>) => {
  let linear = (c: rgb) => [
    srgbChannelToLinear(c.r),
    srgbChannelToLinear(c.g),
    srgbChannelToLinear(c.b),
  ]
  let white = linear(colors->Dict.getUnsafe("W"))->Array.map(v => Math.max(v, 1e-4))
  Dict.fromArray(
    colors
    ->Dict.toArray
    ->Array.map(((key, color)) => {
      let scaled =
        linear(color)->Array.mapWithIndex((v, i) => v /. white->Array.getUnsafe(i) *. 0.9)
      (
        key,
        linearRgbToOklab(
          scaled->Array.getUnsafe(0),
          scaled->Array.getUnsafe(1),
          scaled->Array.getUnsafe(2),
        ),
      )
    }),
  )
}

// How far a saved profile is from a capture's colors, both balanced on their
// own White first, as the profiles page compares them: a merged profile has
// a grey White while captures keep the room's tint. The mean over the five
// colored stickers, balanced in linear light without clamping (under a
// bluish White an orange's red runs past full scale).
let balancedPaletteDistance = (profile, measured) => {
  let p = balancedOklab(profile)
  let q = balancedOklab(measured)
  let hued =
    colorKeys->Array.filter(key =>
      key != "W" && p->Dict.get(key)->Option.isSome && q->Dict.get(key)->Option.isSome
    )
  Array.length(hued) == 0
    ? Float.Constants.positiveInfinity
    : hued->Array.reduce(0.0, (sum, key) =>
        sum +. clusterOklabDistance(p->Dict.getUnsafe(key), q->Dict.getUnsafe(key))
      ) /. Int.toFloat(Array.length(hued))
}

// Saved profiles by distance to the capture, nearest first.
let rankProfiles = (profiles: array<colorProfile>, measured) =>
  profiles
  ->Array.filter(profile => profile.captures > 0)
  ->Array.map(profile => (profile, balancedPaletteDistance(profile.colors, measured)))
  ->Array.toSorted(((_, a), (_, b)) => a -. b)

let matchColorProfileOption = (profiles, measured) => {
  let ranked = rankProfiles(profiles, measured)
  switch ranked[0] {
  | None => None
  | Some((best, distance)) =>
    let second = ranked[1]->Option.mapOr(Float.Constants.positiveInfinity, ((_, d)) => d)
    // A ten-point lead on the displayed 0.08 fit scale is also a clear lead;
    // barely crossing the 0.04 close-match boundary must not turn an almost
    // tie into a clear match.
    let clear =
      distance <= (Array.length(ranked) == 1 ? 0.025 : 0.04) &&
        (distance < second *. 0.65 || second -. distance >= 0.008)
    clear ? Some(best) : None
  }
}

let matchColorProfile = (profiles, measured) =>
  Null.fromOption(matchColorProfileOption(profiles, measured))

// A partial scan may show only two or three of the six colors: each
// captured sticker is compared with its closest available centroid, not
// trusting its first-pass label. Equal fits keep the first profile listed.
let matchPartialColorProfile = (profiles: array<colorProfile>, samples: array<rgb>) =>
  if Array.length(samples) == 0 {
    Null.null
  } else {
    profiles
    ->Array.filter(profile => profile.captures > 0 || isBuiltinColorProfile(profile.id))
    ->Array.map(profile => {
      let distance =
        samples->Array.reduce(0.0, (sum, sample) =>
          sum +.
          colorKeys->Array.reduce(
            Float.Constants.positiveInfinity,
            (nearest, key) =>
              Math.min(
                nearest,
                profile.colors
                ->Dict.get(key)
                ->Option.mapOr(
                  Float.Constants.positiveInfinity,
                  color => clusterDistance(sample, color),
                ),
              ),
          )
        ) /. Int.toFloat(Array.length(samples))
      (profile, distance)
    })
    ->Array.toSorted(((_, a), (_, b)) => a -. b)
    ->Array.get(0)
    ->Option.map(((profile, _)) => profile)
    ->Null.fromOption
  }

// A descriptive 0-100 color-similarity score, not a probability that the
// cube is a particular brand; 0.08 is the largest mean distance allowed
// when updating a saved profile.
let profileColorFitPercent = (profile, measured) =>
  Math.round(
    100.0 *.
    Math.max(0.0, Math.min(1.0, 1.0 -. balancedPaletteDistance(profile, measured) /. 0.08)),
  )

// Largest mean distance at which a saved profile still counts as close.
let closeProfileDistance = 0.04

type reason =
  | @as("clear") Clear
  | @as("preview") Preview
  | @as("nearest") Nearest
  | @as("tie") Tie
  | @as("far") Far
  | @as("none") NoProfiles

type nearestProfile = {profile: colorProfile, fit: float}

type automaticResolution = {
  profile: Null.t<colorProfile>,
  // clear: a strong lead. preview: the nearest close profile also drove the
  // latest live preview. nearest: another close profile won after six
  // faces. tie: kept for older fixtures that fell back to captured colors.
  // far: no saved profile is close. none: no saved profiles.
  reason: reason,
  // The nearest saved profiles with their fit, best first.
  nearest: array<nearestProfile>,
}

// The saved palette Automatic settles on for a complete capture. The final
// six-face distance outranks a partial live preview, and a close nearest
// palette is used even when several saved palettes resemble one another.
let resolveAutomaticProfile = (profiles, measured, previewId: Null.t<string>) => {
  let ranked = rankProfiles(profiles, measured)
  let nearest =
    ranked
    ->Array.slice(~start=0, ~end=3)
    ->Array.map(((profile, _)) => {profile, fit: profileColorFitPercent(profile.colors, measured)})
  switch ranked[0] {
  | None => {profile: Null.null, reason: NoProfiles, nearest}
  | Some((best, distance)) =>
    switch matchColorProfileOption(profiles, measured) {
    | Some(clear) => {profile: Null.make(clear), reason: Clear, nearest}
    | None =>
      if distance > closeProfileDistance {
        {profile: Null.null, reason: Far, nearest}
      } else if Some(best.id) == Null.toOption(previewId) {
        {profile: Null.make(best), reason: Preview, nearest}
      } else {
        {profile: Null.make(best), reason: Nearest, nearest}
      }
    }
  }
}

// "Plastic 2 (faces 2-6), Classic (face 1)": which profile previewed each
// face, in capture order; null when no face recorded one.
let summarizePreviewProfiles = (names: array<Nullable.t<string>>) => {
  let faces: array<(string, array<int>)> = []
  names->Array.forEachWithIndex((name, i) =>
    switch Nullable.toOption(name) {
    | Some(name) if name != "" =>
      switch faces->Array.find(((n, _)) => n == name) {
      | Some((_, numbers)) => numbers->Array.push(i + 1)
      | None => faces->Array.push((name, [i + 1]))
      }
    | _ => ()
    }
  )
  let spans = numbers => {
    let parts = []
    let i = ref(0)
    while i.contents < Array.length(numbers) {
      let j = ref(i.contents)
      while (
        j.contents + 1 < Array.length(numbers) &&
          numbers->Array.getUnsafe(j.contents + 1) == numbers->Array.getUnsafe(j.contents) + 1
      ) {
        j := j.contents + 1
      }
      let first = Int.toString(numbers->Array.getUnsafe(i.contents))
      parts->Array.push(
        i.contents == j.contents
          ? first
          : `${first}–${Int.toString(numbers->Array.getUnsafe(j.contents))}`,
      )
      i := j.contents + 1
    }
    parts->Array.join(", ")
  }
  Array.length(faces) == 0
    ? Null.null
    : Null.make(
        faces
        ->Array.map(((name, numbers)) =>
          `${name} (${Array.length(numbers) == 1 ? "face" : "faces"} ${spans(numbers)})`
        )
        ->Array.join(", "),
      )
}

// The status already names the final profile. Mention previews only when
// they differed; otherwise report a failed automatic selection, if any.
let captureProfileFinding = (
  previewNames: array<Nullable.t<string>>,
  resolvedName,
  reason: Null.t<reason>,
) =>
  switch Null.toOption(reason) {
  | Some(Tie) => Null.make("Saved profiles matched equally; colors from this capture were used")
  | Some(Far) => Null.make("No saved color profile was close enough")
  | _ =>
    if (
      Array.length(previewNames) == 0 ||
        previewNames->Array.every(name => Nullable.toOption(name) == Some(resolvedName))
    ) {
      Null.null
    } else {
      switch Null.toOption(summarizePreviewProfiles(previewNames)) {
      | Some(preview) => Null.make(`Preview used ${preview}`)
      | None => Null.null
      }
    }
  }

type updateChoice = {automatic: bool, resolvedId: Null.t<string>, selectedId: string}

// The saved profile a reviewed capture may update, offered as an explicit
// Update action: the one Automatic resolved to, or the hand-selected one.
// Needs a valid, camera-only, recalibrated capture close enough in color;
// never Generic or Automatic.
let profileToUpdate = (
  profiles: array<colorProfile>,
  choice: updateChoice,
  measured,
  evidence: paletteEvidence,
) =>
  if !evidence.reviewedValid || !evidence.cameraOnly || !evidence.recalibrated {
    Null.null
  } else {
    let targetId = choice.automatic ? Null.toOption(choice.resolvedId) : Some(choice.selectedId)
    switch profiles->Array.find(profile => Some(profile.id) == targetId) {
    | Some(target) if shouldBlendColorProfile(target, measured, evidence, false) =>
      Null.make(target)
    | _ => Null.null
    }
  }
