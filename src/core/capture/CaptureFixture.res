// What a saved capture fixture records: each face's photo and readings,
// and the capture's context in meta.json.
type rgb = StickerGeometry.rgb
type faceCaptureData = CaptureFlow.faceCaptureData

external json: 'a => JSON.t = "%identity"

// Everything a saved fixture records about a capture, besides its faces.
// Values recorded as they are carry JSON.t.
type captureFixtureInput = {
  capturedFaces: Dict.t<faceCaptureData>,
  puzzleSize: int,
  version: string,
  commit: string,
  userAgent: string,
  devicePixelRatio: float,
  mirrored: bool,
  cameraInfo: JSON.t,
  captureProfile: JSON.t,
  resolvedColorProfile: JSON.t,
  automaticResolution: Null.t<ColorProfileLearning.automaticResolution>,
  resolvedColorReference: JSON.t,
  guided: bool,
  cube: Null.t<CubeState.cubeState>,
  appliedBackgroundGains: Null.t<Dict.t<rgb>>,
  sampling: StickerGeometry.samplingGeometry,
  calibrationApplied: bool,
  learnedPalette: Null.t<Dict.t<rgb>>,
}

let faceOf = (faces, face) => faces->Dict.getUnsafe(face)

// Only a complete capture with all six photos can be saved.
let canSaveCaptureFixture = (capturedFaces: Dict.t<faceCaptureData>) =>
  CaptureSteps.faceOrder->Array.every(face =>
    switch capturedFaces->Dict.get(face) {
    | Some({croppedImage}) => croppedImage != ""
    | _ => false
    }
  )

let round1 = v => Math.round(v *. 10.0) /. 10.0
let rgbJson = ({r, g, b}: rgb) => JSON.Array([r, g, b]->Array.map(v => JSON.Number(round1(v))))

@send external toISOString: Date.t => string = "toISOString"

// One face as recorded: its photo, what the browser measured for each
// sticker (row-major, after the face's gain) and detection's confidence
// in it, 0-100 - lets the fixture test check its own JPEG decode reads the
// same - and where and how it was taken.
let faceRecord = (face: faceCaptureData) => {
  let record = Dict.make()
  let add = (key, value) =>
    switch value {
    | Some(value) => record->Dict.set(key, value)
    | None => ()
    }
  add("photo", face.croppedImage->Option.map(photo => JSON.String(photo)))
  add(
    "readings",
    face.cellColors->Option.map(grid => JSON.Array(grid->Array.flat->Array.map(rgbJson))),
  )
  add(
    "confidences",
    face.cellConfidences->Option.map(grid => JSON.Array(
      grid->Array.flat->Array.map(c => JSON.Number(Math.round(c *. 100.0))),
    )),
  )
  add("source", face.source->Option.map(json))
  add("capturedAt", Some(JSON.String(Date.fromTime(face.timestamp)->toISOString)))
  add("background", face.backgroundColor->Option.map(json))
  add("frame", face.frame->Option.map(json))
  add("crop", face.crop->Option.map(json))
  add("sharpness", face.sharpness->Option.map(sharpness => JSON.Number(round1(sharpness))))
  add("camera", face.cameraSettings->Option.map(json))
  add("previewColorProfile", face.previewColorProfile->Option.map(json))
  record
}

let nullable = (value, f) =>
  switch Null.toOption(value) {
  | Some(value) => f(value)
  | None => JSON.Null
  }

// Packs a capture - each face's actual photo plus its (human-reviewed)
// color grid - into a fixture request: unzipped into test/fixtures/, it is
// a permanent regression fixture (see test/fixtures.test.ts).
let captureFixtureRequest = (input: captureFixtureInput): FixtureZip.fixtureRequest => {
  let {capturedFaces} = input
  let order = CaptureSteps.faceOrder
  let faces = Dict.fromArray(
    order->Array.map(face => (face, faceRecord(capturedFaces->faceOf(face)))),
  )
  let fromCamera = order->Array.some(face => (capturedFaces->faceOf(face)).source == Some(Camera))
  let meta = Dict.fromArray([
    ("capturedAt", JSON.String(Date.make()->toISOString)),
    (
      "app",
      JSON.Object(
        Dict.fromArray([
          ("version", JSON.String(input.version)),
          ("commit", JSON.String(input.commit)),
        ]),
      ),
    ),
    ("userAgent", JSON.String(input.userAgent)),
    ("devicePixelRatio", JSON.Number(input.devicePixelRatio)),
    (
      "photo",
      JSON.Object(
        Dict.fromArray([
          ("format", JSON.String("image/jpeg")),
          ("quality", JSON.Number(FaceSampling.cropJpegQuality)),
        ]),
      ),
    ),
    ("mirrored", JSON.Boolean(input.mirrored)),
    // Only meaningful when at least one face was shot with it - not for a
    // re-saved uploaded fixture or imported image files.
    ("camera", fromCamera ? input.cameraInfo : JSON.Null),
    // The cube profile the capture was taken with - same condition as
    // camera, since a re-saved upload wasn't shot with the current one.
    ("profile", fromCamera ? input.captureProfile : JSON.Null),
    // One resolved profile for the complete capture. The actual common
    // palette learned from all six photos is recorded below.
    ("colorProfile", input.resolvedColorProfile),
    // Why Automatic chose it: the reason and the nearest saved profiles.
    (
      "colorResolution",
      nullable(input.automaticResolution, resolution => JSON.Object(
        Dict.fromArray([
          ("reason", json(resolution.reason)),
          (
            "nearest",
            JSON.Array(
              resolution.nearest->Array.map(({profile, fit}) => JSON.Object(
                Dict.fromArray([
                  ("id", JSON.String(profile.id)),
                  ("name", JSON.String(profile.name)),
                  ("fit", JSON.Number(fit)),
                ]),
              )),
            ),
          ),
        ]),
      )),
    ),
    // A saved/manual profile acts as the six-face classification prior.
    // Automatic without a clear match uses only this capture's colors.
    ("colorReference", input.resolvedColorReference),
    // How the photos were taken (see CAPTURE_STEPS) and the cube they were
    // approved as - the fixture test puts the photos together again and
    // checks it gets that cube.
    ("protocol", input.guided ? JSON.String(CaptureSteps.guidedProtocol) : JSON.Null),
    // How the per-face `readings` were measured (see stickerColor).
    ("measurement", JSON.String(FaceSampling.stickerMeasurement)),
    (
      "assembledURFDLB",
      nullable(input.cube, cube => JSON.String(NotationOutput.toWRGFacelets(cube))),
    ),
    // Two corrections run after all 6 faces are in: each face's backdrop
    // brought to the median of all six (per-face gains, see
    // computeBackgroundGains), then the 6 colors learned from this
    // capture's own stickers (colorCalibration).
    ("backgroundWhiteBalance", nullable(input.appliedBackgroundGains, json)),
    (
      "backgroundWhiteBalanceMethod",
      nullable(input.appliedBackgroundGains, _ => JSON.String(FaceSampling.backgroundWbMethod)),
    ),
    // Face border and sticker gap used to sample every face - replayed by
    // the fixture test.
    ("sampling", json(input.sampling)),
    // The 6 colors learned from this capture's stickers, which every
    // sticker was classified against (null when there weren't enough
    // stickers to learn from and the canonical colors were used).
    (
      "colorCalibration",
      JSON.Object(
        Dict.fromArray([
          ("applied", JSON.Boolean(input.calibrationApplied)),
          (
            "learnedColors",
            nullable(input.learnedPalette, palette => JSON.Object(
              Dict.fromArray(
                palette->Dict.toArray->Array.map(((color, rgb)) => (color, rgbJson(rgb))),
              ),
            )),
          ),
        ]),
      ),
    ),
    // Per-color detected count/lightness/chroma/hue spread across all 6
    // faces at confirm time, for offline analysis of a reported detection
    // problem against this exact fixture.
    ("colorStats", json(ColorStats.computeColorStats(Obj.magic(capturedFaces), input.puzzleSize))),
  ])
  let grids = pick =>
    NotationOutput.gridsToWRGFacelets(
      Dict.fromArray(order->Array.map(face => (face, pick(capturedFaces->faceOf(face))))),
    )
  let request: FixtureZip.fixtureRequest = {
    gridSize: Int.toFloat(input.puzzleSize),
    colorsURFDLB: JSON.String(grids((face: faceCaptureData) => face.colors)),
    faces: Nullable.make(faces),
    meta: JSON.Object(meta),
  }
  // What detection said before any hand correction - the diff against
  // colorsURFDLB is exactly what a human had to fix.
  order->Array.every(face => (capturedFaces->faceOf(face)).detectedColors->Option.isSome)
    ? {
        ...request,
        detectedURFDLB: JSON.String(
          grids((face: faceCaptureData) => face.detectedColors->Option.getUnsafe),
        ),
      }
    : request
}

type recordedNearest = {id: string, name: string, fit: float}
type recordedResolution = {
  reason?: ColorProfileLearning.reason,
  nearest?: Nullable.t<array<recordedNearest>>,
}

// The reason Automatic chose its profile, as recorded in a fixture; the
// nearest profiles keep only their names and fit.
let recordedAutomaticResolution = (recorded: Nullable.t<recordedResolution>): Null.t<
  ColorProfileLearning.automaticResolution,
> =>
  switch Nullable.toOption(recorded) {
  | Some({reason: ?Some(reason), ?nearest}) =>
    Null.make({
      ColorProfileLearning.profile: Null.null,
      reason,
      nearest: nearest
      ->Option.flatMap(Nullable.toOption)
      ->Option.getOr([])
      ->Array.map(({id, name, fit}) => {
        ColorProfileLearning.profile: {id, name, colors: Dict.make(), captures: 0},
        fit,
      }),
    })
  | _ => Null.null
  }

let fixtureLoadedMessage = (mismatches, ignoreCorrections) => {
  let stickers = `${Int.toString(mismatches)} sticker${mismatches == 1 ? "" : "s"}`
  mismatches == 0
    ? "✓ Loaded fixture - detection matches all stickers."
    : ignoreCorrections
    ? `✓ Loaded fixture with detected colors only - dropped the saved choice on ${stickers}.`
    : `✓ Loaded fixture - detection differs on ${stickers} (marked in the review).`
}
