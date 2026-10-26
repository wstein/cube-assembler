// The fixture request for a cube state with no camera behind it: its six
// faces rendered as photos (see SyntheticFace), named, tagged and described
// as synthetic so people and tests can tell them from real captures.

type input = {
  // The cube's colors, six space-separated WRG face blocks in U R F D L B
  // order.
  colors: string,
  size: int,
  preset: string,
  seed: int,
  // What it takes to render the photos again: the seed of each face's photo
  // (u, r, f, d, l, b), their side in pixels and the generator options (see
  // SyntheticFace) as plain data.
  seeds: Dict.t<int>,
  photoSize: int,
  options: JSON.t,
  // Why the state is no cube, when it is none; it is saved all the same.
  invalid?: string,
  version: string,
  commit: string,
  // Each face's photo (u, r, f, d, l, b) as a JPEG/PNG data URL.
  photos: Dict.t<string>,
  // The time of saving, as an ISO string.
  now: string,
}

let renderer = "parametric/v1"

// What one photo says about itself (see PhotoMetadata): how it was rendered,
// by which app version, as JSON text. No commit: like the Rust generator's
// fingerprint, it only names the version, so the same input renders to the
// same bytes.
type fingerprintInput = {
  preset: string,
  // The seed of this face's photo.
  seed: int,
  face: string,
  size: int,
  options: JSON.t,
  version: string,
}

let fingerprintJson = (input: fingerprintInput) =>
  JSON.stringify(
    JSON.Object(
      Dict.fromArray([
        ("v", JSON.Number(1.0)),
        ("renderer", JSON.String(renderer)),
        ("preset", JSON.String(input.preset)),
        ("seed", JSON.Number(Int.toFloat(input.seed))),
        ("face", JSON.String(input.face)),
        ("size", JSON.Number(Int.toFloat(input.size))),
        ("options", input.options),
        ("app", JSON.Object(Dict.fromArray([("version", JSON.String(input.version))]))),
      ]),
    ),
  )
let colons = RegExp.fromString(":", ~flags="g")

let syntheticRequest = (input: input): FixtureZip.fixtureRequest => {
  let size = Int.toString(input.size)
  let synthetic = Dict.fromArray([
    ("renderer", JSON.String(renderer)),
    ("preset", JSON.String(input.preset)),
    ("seed", JSON.Number(Int.toFloat(input.seed))),
    ("size", JSON.Number(Int.toFloat(input.photoSize))),
    ("seeds", JSON.Object(input.seeds->Dict.mapValues(seed => JSON.Number(Int.toFloat(seed))))),
    ("options", input.options),
  ])
  switch input.invalid {
  | Some(reason) => synthetic->Dict.set("invalid", JSON.String(reason))
  | None => ()
  }
  let capture = Dict.fromArray([
    ("capturedAt", JSON.String(input.now)),
    (
      "app",
      JSON.Object(
        Dict.fromArray([
          ("version", JSON.String(input.version)),
          ("commit", JSON.String(input.commit)),
        ]),
      ),
    ),
    ("synthetic", JSON.Object(synthetic)),
  ])
  let faces = Dict.make()
  input.photos->Dict.forEachWithKey((photo, face) =>
    faces->Dict.set(
      face,
      Dict.fromArray([("photo", JSON.String(photo)), ("source", JSON.String("synthetic"))]),
    )
  )
  let tags = ["synthetic", "software-rendered", `preset:${input.preset}`]
  {
    name: `synt-${size}x${size}-${input.now
      ->String.slice(~start=0, ~end=19)
      ->String.replaceRegExp(colons, "-")}`,
    gridSize: Int.toFloat(input.size),
    colorsURFDLB: JSON.String(input.colors),
    tags: input.invalid->Option.isSome ? Array.concat(tags, ["invalid-state"]) : tags,
    faces: Nullable.make(faces),
    meta: JSON.Object(capture),
  }
}
