// What the scanner's profile actions do to the saved settings: selecting
// the stored color choice, creating a color profile from a reviewed
// capture, updating the one it matched, and which profile reads a capture.
// Storage, cookies and files stay with the hook.
open ProfileSettings
type rgb = StickerGeometry.rgb

// The settings with the color profile a cookie remembers selected, when it
// still exists.
let withSelectedColors = (settings, selectedId: Null.t<string>) =>
  switch Null.toOption(selectedId) {
  | Some(id) if id != "" && allColorProfiles(settings)->Array.some(profile => profile.id == id) =>
    selectColorProfile(settings, id)
  | _ => settings
  }

let automatic = (settings: profileSettings) => settings.activeColorsId == autoColorsId

// What a reviewed capture may do to the color profiles: create one from its
// learned colors, or update the profile it matched.
type learningOffer = {
  colors: Dict.t<rgb>,
  evidence: ColorProfileLearning.paletteEvidence,
  matchedProfileId: Null.t<string>,
  updatedProfileName?: string,
}

// Saves the capture's colors as a new profile `id` named `name` (trimmed,
// at most 60 characters). Automatic stays selected and matches it.
let withNewColors = (settings: profileSettings, offer: learningOffer, id, name, now) => {
  let saved = saveColorProfile(
    settings,
    {
      id,
      name: name->String.trim->String.slice(~start=0, ~end=60),
      colors: offer.colors,
      captures: 1,
      updatedAt: now,
    },
  )
  automatic(settings)
    ? setAutoColorMatch(selectColorProfile(saved, autoColorsId), Null.make(id))
    : saved
}

let matchedProfile = (settings: profileSettings, offer: Null.t<learningOffer>) =>
  offer
  ->Null.toOption
  ->Option.flatMap(offer => offer.matchedProfileId->Null.toOption)
  ->Option.flatMap(id => settings.colors->Array.find(profile => profile.id == id))

// The saved profile the Update action would change, by name.
let updatableName = (settings, offer) =>
  matchedProfile(settings, offer)->Option.mapOr("detected", profile => profile.name)

type updated = {settings: profileSettings, offer: learningOffer}

// Updates the profile the capture matched, when its evidence allows. The
// current choice (or Automatic) stays selected; the offer then names the
// updated profile instead of offering the update again.
let withUpdatedColors = (settings: profileSettings, offer: Null.t<learningOffer>, now) =>
  switch (offer->Null.toOption, matchedProfile(settings, offer)) {
  | (Some(offer), Some(target)) =>
    switch ColorProfileLearning.updateProfileFromCapture(
      target,
      offer.colors,
      offer.evidence,
      now,
    )->Null.toOption {
    | Some(updated) =>
      // Saving would also select the profile; keep the current choice.
      let saved = {...saveColorProfile(settings, updated), activeColorsId: settings.activeColorsId}
      Null.make({
        settings: automatic(settings) ? setAutoColorMatch(saved, Null.make(updated.id)) : saved,
        offer: {...offer, matchedProfileId: Null.null, updatedProfileName: updated.name},
      })
    | None => Null.null
    }
  | _ => Null.null
  }

// Every profile Automatic compares a capture with: the built-in palettes,
// then the saved ones.
let autoColorProfiles = (settings: profileSettings) =>
  [...builtinColorProfiles(), ...settings.colors]

// Automatic's provisional pick from the stickers captured so far.
let provisionalColorProfile = (profiles, stickers) =>
  ColorProfileLearning.matchPartialColorProfile(profiles, stickers)

// The palette captures are classified against: Automatic's provisional
// pick, else the selected profile's colors.
let capturePalette = (settings, provisional: Null.t<colorProfile>) =>
  automatic(settings)
    ? provisional->Null.toOption->Option.map(profile => profile.colors)
    : ProfileSettings.capturePalette(settings)

type previewProfile = {id: string, name: string, colors: Dict.t<rgb>}

// The profile a capture is read with right now: Automatic's provisional
// choice, else the live worker's pick for the first face; the selected
// profile otherwise.
let previewProfile = (
  settings: profileSettings,
  provisional: Null.t<colorProfile>,
  profiles,
  liveId,
) => {
  let used = automatic(settings)
    ? switch Null.toOption(provisional) {
      | Some(profile) => Some(profile)
      | None =>
        liveId
        ->Null.toOption
        ->Option.flatMap(id => profiles->Array.find((profile: colorProfile) => profile.id == id))
      }
    : Some(activeColorProfile(settings))
  used->Option.map(used => {
    id: used.id,
    name: used.name,
    colors: colorPalette({colors: used.colors}),
  })
}
