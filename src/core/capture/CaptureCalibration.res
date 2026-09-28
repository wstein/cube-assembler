// What the six-face calibration of the current capture found, as one
// reducer: the colors it learned, the backdrop gains it applied, the color
// profile it resolved and why, and the faces and colors to warn about in
// the review. The hook holds the state with useReducer.
type rgb = StickerGeometry.rgb

type captureProfile = {id?: string, name: string}

type state = {
  // The 6 colors as learned from this capture's own stickers (null when
  // the cross-face recalibration didn't run) - what the color-fix picker
  // scores each alternative against.
  learnedPalette: Null.t<Dict.t<rgb>>,
  // Learned colors whose cluster mixed two colors (see mixedUpClusters).
  mixedUpColors: array<string>,
  // Learned colors waiting for the review to approve the cube before they
  // may create or update a color profile.
  pendingPalette: Null.t<CaptureFinalization.pendingPalette>,
  // The cube geometry and colors selected when this capture was taken.
  captureProfile: Null.t<captureProfile>,
  resolvedColorProfile: Null.t<ProfileSettings.usedColorProfile>,
  resolvedColorReference: Null.t<Dict.t<rgb>>,
  // Why Automatic settled on its six-face profile (or on none).
  automaticResolution: Null.t<ColorProfileLearning.automaticResolution>,
  globalWhiteBalanceNote: Null.t<string>,
  // Faces with glare-washed stickers, when enough to warn.
  glareFaces: array<string>,
  // The per-face background-derived gains actually applied this capture -
  // recorded in saved fixtures, which replay them.
  appliedBackgroundGains: Null.t<Dict.t<rgb>>,
}

let initialCalibration = () => {
  learnedPalette: Null.null,
  mixedUpColors: [],
  pendingPalette: Null.null,
  captureProfile: Null.null,
  resolvedColorProfile: Null.null,
  resolvedColorReference: Null.null,
  automaticResolution: Null.null,
  globalWhiteBalanceNote: Null.null,
  glareFaces: [],
  appliedBackgroundGains: Null.null,
}

let calibrationNote = "Colors double-checked by comparing all 6 sides."

// What an uploaded fixture recorded about how its colors were resolved.
type recordedProfile = {id?: string, name?: string}
type recordedColorProfile = {name?: string, colors?: Dict.t<rgb>}
type recordedCapture = {
  profile?: Nullable.t<recordedProfile>,
  colorProfile?: Nullable.t<recordedColorProfile>,
  colorResolution?: Nullable.t<CaptureFixture.recordedResolution>,
  colorReference?: Nullable.t<Dict.t<rgb>>,
}

@tag("kind")
type action =
  // A cube typed in or picked as solved was read with no color profile.
  | @as("forgetResolvedProfile") ForgetResolvedProfile
  | @as("clear") Clear
  // Opening the camera drops the last calibration's findings; the
  // resolved profile only goes when the capture starts over.
  | @as("startCapture") StartCapture({startOver: bool})
  // Before recalibrating six faces: a selected profile is known already,
  // Automatic's is not.
  | @as("startRecalibration")
  StartRecalibration({
      selected: Null.t<ProfileSettings.usedColorProfile>,
    })
  | @as("applyRecalibration")
  ApplyRecalibration({
      result: CaptureFinalization.recalibration,
      profile: captureProfile,
    })
  | @as("failRecalibration") FailRecalibration
  // An uploaded fixture brings the profiles and reasons it recorded; its
  // colors are learned again from its photos.
  | @as("applyFixtureCalibration")
  ApplyFixtureCalibration({
      capture: Nullable.t<recordedCapture>,
      classified: Recalibration.classified,
      recordedGains: Null.t<Dict.t<rgb>>,
    })
  | @as("setPendingPalette")
  SetPendingPalette({
      palette: Null.t<CaptureFinalization.pendingPalette>,
    })
  | @as("setAppliedBackgroundGains") SetAppliedBackgroundGains({gains: Null.t<Dict.t<rgb>>})

let forgetResolvedProfile = state => {
  ...state,
  resolvedColorProfile: Null.null,
  automaticResolution: Null.null,
}

// A field the fixture recorded, when it did (neither missing nor null).
let recorded = (capture: option<recordedCapture>, get) =>
  capture->Option.flatMap(get)->Option.flatMap(Nullable.toOption)

let nonEmpty = value =>
  switch value {
  | Some(text) => text != ""
  | None => false
  }

let calibrationReducer = (state: state, action) =>
  switch action {
  | ForgetResolvedProfile => forgetResolvedProfile(state)
  | Clear => initialCalibration()
  | StartCapture({startOver}) => {
      ...startOver ? forgetResolvedProfile(state) : state,
      globalWhiteBalanceNote: Null.null,
      glareFaces: [],
      appliedBackgroundGains: Null.null,
      resolvedColorReference: Null.null,
    }
  | StartRecalibration({selected}) => {
      ...state,
      pendingPalette: Null.null,
      resolvedColorProfile: selected,
      automaticResolution: Null.null,
      resolvedColorReference: Null.null,
    }
  | ApplyRecalibration({result, profile}) => {
      ...state,
      automaticResolution: result.resolution,
      resolvedColorReference: result.reference,
      resolvedColorProfile: result.resolvedProfile,
      learnedPalette: result.learnedPalette,
      mixedUpColors: result.mixedUp,
      pendingPalette: result.pendingPalette,
      captureProfile: Null.make(profile),
      globalWhiteBalanceNote: result.applied ? Null.make(calibrationNote) : Null.null,
      glareFaces: result.glare,
    }
  | FailRecalibration => {
      ...state,
      globalWhiteBalanceNote: Null.null,
      glareFaces: [],
      learnedPalette: Null.null,
      mixedUpColors: [],
      pendingPalette: Null.null,
    }
  | ApplyFixtureCalibration({capture, classified, recordedGains}) =>
    let capture = Nullable.toOption(capture)
    {
      pendingPalette: Null.null,
      captureProfile: switch recorded(capture, capture => capture.profile) {
      | Some({?id, name: ?Some(name)}) if name != "" => Null.make(({?id, name}: captureProfile))
      | _ => Null.null
      },
      resolvedColorProfile: switch recorded(capture, capture => capture.colorProfile) {
      | Some({?name, colors: ?Some(_)} as colorProfile) if nonEmpty(name) =>
        // Recorded as saved: a used color profile from the fixture's JSON.
        Null.make((Obj.magic(colorProfile): ProfileSettings.usedColorProfile))
      | _ => Null.null
      },
      // The recorded reason for it, where the fixture has one.
      automaticResolution: CaptureFixture.recordedAutomaticResolution(
        recorded(capture, capture => capture.colorResolution)->Nullable.fromOption,
      ),
      resolvedColorReference: recorded(capture, capture => capture.colorReference)->Null.fromOption,
      appliedBackgroundGains: recordedGains,
      glareFaces: CaptureSteps.glareFacesToWarn(
        classified.glare->Array.map(({face}) => {CaptureSteps.face: face}),
      ),
      globalWhiteBalanceNote: classified.applied ? Null.make(calibrationNote) : Null.null,
      learnedPalette: classified.learned->Null.map(learned => learned.colors),
      mixedUpColors: classified.learned
      ->Null.toOption
      ->Option.mapOr([], learned => learned.mixedUpColors),
    }
  | SetPendingPalette({palette}) => {...state, pendingPalette: palette}
  | SetAppliedBackgroundGains({gains}) => {...state, appliedBackgroundGains: gains}
  }
