// Regression fixtures as zip files: what a saved capture's zip holds
// (meta.json and its 6 face photos) and a readable digest of it. Zipping,
// base64 decoding and files stay with the TypeScript caller.

// JavaScript's String(value) and truthiness, for reading meta.json the way
// the original did: any value can stand where a field was expected.
@val external jsString: JSON.t => string = "String"
let truthy = (value: option<JSON.t>) =>
  switch value {
  | None | Some(Null) | Some(Boolean(false)) | Some(String("")) => false
  | Some(Number(n)) => n != 0.0 && !Float.isNaN(n)
  | Some(_) => true
  }

let field = (value: option<JSON.t>, key) =>
  switch value {
  | Some(Object(dict)) => dict->Dict.get(key)
  | Some(String(s)) =>
    // The original indexed strings too (s[i]); only length matters here.
    key == "length" ? Some(Number(Int.toFloat(String.length(s)))) : None
  | _ => None
  }

type fixtureRequest = {
  name?: string,
  gridSize: float,
  // Human-verified colors of all 6 faces as one WRG facelets string in
  // U R F D L B order (each face row-major, as photographed).
  // `detectedURFDLB` is the same for what detection produced before any
  // hand correction.
  colorsURFDLB: JSON.t,
  detectedURFDLB?: JSON.t,
  // Each face's photo as a JPEG/PNG data URL; any other per-face fields
  // are informational and stored as-is.
  faces: Nullable.t<Dict.t<Dict.t<JSON.t>>>,
  // Informational capture context, stored as-is under `capture`.
  meta?: JSON.t,
}

type photoData = {file: string, base64: string}

// The fixture's directory name, its photos (still base64) and meta.json.
type fixtureLayout = {name: string, photos: array<photoData>, meta: JSON.t}

let requiredFaces = ["u", "r", "f", "d", "l", "b"]
let fixtureMetaSchemaUrl = "https://wstein.github.io/cube-assembler/schemas/fixture-meta-v1.schema.json"

let fail = message => JsError.throwWithMessage(message)

let photoPattern = RegExp.fromString("^data:image\\/(jpeg|jpg|png);base64,(.+)$")
let unsafeName = RegExp.fromString("[^a-zA-Z0-9_-]", ~flags="g")
let colons = RegExp.fromString(":", ~flags="g")

// The fixture directory for a capture, at the ISO time `now`; throws on an
// incomplete one.
let fixtureLayout = (request: fixtureRequest, now: string) => {
  let faceEntries =
    request.faces
    ->Nullable.toOption
    ->Option.getOr(Dict.make())
    ->Dict.toArray
    ->Array.map(((key, value)) => (String.toLowerCase(key), value))
  let faceKeys = faceEntries->Array.map(((key, _)) => key)
  if !(requiredFaces->Array.every(face => faceKeys->Array.includes(face))) {
    fail("Expected all 6 faces (U, R, F, D, L, B)")
  }
  let gridSize = request.gridSize
  if (
    !Float.isFinite(gridSize) ||
    Math.floor(gridSize) != gridSize ||
    gridSize < 2.0 ||
    gridSize > 7.0
  ) {
    fail("gridSize must be an integer between 2 and 7")
  }
  let size = Float.toString(gridSize)
  [
    ("colorsURFDLB", Some(request.colorsURFDLB)),
    ("detectedURFDLB", request.detectedURFDLB),
  ]->Array.forEach(((key, value)) =>
    switch value {
    | None if key == "detectedURFDLB" => ()
    | _ =>
      let rows = switch value {
      | Some(String(facelets)) =>
        NotationOutput.wrgFaceletsToGrids(facelets)
        ->Null.toOption
        ->Option.flatMap(grids => grids->Dict.get("U"))
        ->Option.map(Array.length)
      | _ => None
      }
      if rows != Some(Float.toInt(gridSize)) {
        fail(`${key} must be 6 space-separated ${size}x${size} faces of W/O/G/R/B/Y`)
      }
    }
  )

  // The zip's folder name, and so the fixture's directory name: whole UTC
  // seconds.
  let timestamp = now->String.slice(~start=0, ~end=19)->String.replaceRegExp(colons, "-")
  let rawName = request.name->Option.getOr(`cube-${size}x${size}-${timestamp}`)
  let name = rawName->String.replaceRegExp(unsafeName, "-")->String.slice(~start=0, ~end=80)
  if name == "" {
    fail("Invalid fixture name")
  }

  let photos = []
  let faces = Dict.make()
  faceEntries->Array.forEach(((faceKey, faceData)) => {
    let source = switch faceData->Dict.get("photo") {
    | Some(String(photo)) => photo
    | Some(Null) | None => ""
    | Some(other) => jsString(other)
    }
    switch photoPattern->RegExp.exec(source) {
    | Some(result) =>
      let groups = result->RegExp.Result.matches
      let format = groups[0]->Option.flatMap(x => x)->Option.getOr("")
      let base64 = groups[1]->Option.flatMap(x => x)->Option.getOr("")
      let file = `face-${faceKey}.${format == "png" ? "png" : "jpg"}`
      photos->Array.push({file, base64})
      let entry = Dict.fromArray([("photo", JSON.String(file))])
      faceData->Dict.forEachWithKey((value, key) =>
        if key != "photo" {
          entry->Dict.set(key, value)
        }
      )
      faces->Dict.set(faceKey, JSON.Object(entry))
    | None => fail(`Face ${String.toUpperCase(faceKey)}: photo must be a JPEG/PNG data URL`)
    }
  })
  let meta = Dict.fromArray([
    ("$schema", JSON.String(fixtureMetaSchemaUrl)),
    ("gridSize", JSON.Number(gridSize)),
    ("colorsURFDLB", request.colorsURFDLB),
  ])
  switch request.detectedURFDLB {
  | Some(detected) => meta->Dict.set("detectedURFDLB", detected)
  | None => ()
  }
  meta->Dict.set("faces", JSON.Object(faces))
  meta->Dict.set(
    "capture",
    switch request.meta {
    | None | Some(Null) => JSON.Object(Dict.make())
    | Some(meta) => meta
    },
  )
  {name, photos, meta: JSON.Object(meta)}
}

type photoRef = {face: string, file: string}

// What a fixture holds - its photos and a readable digest of meta.json -
// so the customer sees what they're about to save or share.
type summary = {photos: array<photoRef>, rows: array<(string, string)>}

let faceKeys = ["u", "r", "f", "d", "l", "b"]
let sourceNames = Dict.fromArray([
  ("camera", "camera"),
  ("image-file", "image files"),
  ("fixture", "an uploaded fixture"),
])

@send external toFixed: (float, int) => string = "toFixed"
@new external dateOf: JSON.t => Date.t = "Date"

let isNumber = value =>
  switch value {
  | Some(JSON.Number(n)) => Float.isFinite(n)
  | _ => false
  }

let summarizeMeta = (meta: JSON.t) => {
  let meta = Some(meta)
  let capture = switch field(meta, "capture") {
  | None | Some(Null) => Some(JSON.Object(Dict.make()))
  | capture => capture
  }
  let faces = field(meta, "faces")
  let face = key => field(faces, key)
  let photos =
    faceKeys
    ->Array.filter(key => truthy(face(key)))
    ->Array.map(key => {
      face: key,
      file: field(face(key), "photo")->Option.mapOr("undefined", jsString),
    })
  let show = value => value->Option.mapOr("undefined", jsString)
  let size = show(field(meta, "gridSize"))
  let rows = [("Cube", `${size}×${size}`)]
  let detected = field(meta, "detectedURFDLB")
  if truthy(detected) {
    let colors = show(field(meta, "colorsURFDLB"))
    let detectedChars = show(detected)->String.split("")
    let fixed =
      colors
      ->String.split("")
      ->Array.filterWithIndex((c, i) => Some(c) != detectedChars[i])
      ->Array.length
    rows->Array.push((
      "Fixed by hand",
      fixed == 0
        ? "nothing - detection was right"
        : `${Int.toString(fixed)} sticker${fixed == 1 ? "" : "s"}`,
    ))
  } else {
    rows->Array.push(("Fixed by hand", "not recorded"))
  }
  rows->Array.push((
    "Capture",
    truthy(field(capture, "protocol")) ? "guided (4 sides, then top and bottom)" : "free order",
  ))
  let sources = []
  faceKeys->Array.forEach(key => {
    let source = field(face(key), "source")
    if truthy(source) && !(sources->Array.some(seen => seen == source)) {
      sources->Array.push(source)
    }
  })
  if Array.length(sources) > 0 {
    rows->Array.push((
      "Photos from",
      sources
      ->Array.map(source =>
        switch source {
        | Some(String(name)) => sourceNames->Dict.get(name)->Option.getOr(name)
        | other => show(other)
        }
      )
      ->Array.join(", "),
    ))
  }
  let camera = field(capture, "camera")
  if truthy(camera) {
    let granted = field(camera, "granted")
    let width = field(granted, "width")
    let height = field(granted, "height")
    rows->Array.push((
      "Camera",
      `${show(field(camera, "label"))}${truthy(width) && truthy(height)
          ? `, ${show(width)}×${show(height)}`
          : ""}`,
    ))
  }
  let profileName = field(field(capture, "profile"), "name")
  if truthy(profileName) {
    rows->Array.push(("Cube profile", show(profileName)))
  }
  let used = field(capture, "colorProfile")
  if truthy(field(used, "name")) {
    let automatic = field(used, "selection") == Some(String("automatic"))
    rows->Array.push((
      "Sticker colors",
      `${automatic ? "Automatic → " : ""}${show(field(used, "name"))}`,
    ))
    let fit = field(used, "colorFitPercent")
    if isNumber(fit) {
      rows->Array.push(("Profile color fit", `${show(fit)}%`))
    }
    let rgb = ["W", "Y", "O", "R", "G", "B"]->Array.filterMap(color => {
      let value = field(field(used, "colors"), color)
      let channels = [field(value, "r"), field(value, "g"), field(value, "b")]
      truthy(value) && channels->Array.every(isNumber)
        ? Some(`${color} ${channels->Array.map(show)->Array.join(",")}`)
        : None
    })
    if Array.length(rgb) > 0 {
      rows->Array.push(("Sticker RGB", rgb->Array.join(" · ")))
    }
  }
  switch capture {
  | Some(Object(dict)) if dict->Dict.keysToArray->Array.includes("backgroundWhiteBalance") =>
    // Object.values of the gains, as the original read them.
    let gains = switch dict->Dict.get("backgroundWhiteBalance") {
    | Some(Object(gains)) => gains->Dict.valuesToArray
    | Some(Array(gains)) => gains
    | _ => []
    }
    let channel = (gain, key) =>
      switch field(Some(gain), key) {
      | Some(Number(n)) => n
      | _ => Float.Constants.nan
      }
    let largest = gains->Array.reduce(1.0, (largest, gain) =>
      ["r", "g", "b"]->Array.reduce(largest, (largest, key) => {
        let v = channel(gain, key)
        Math.max(largest, Math.max(v, 1.0 /. v))
      })
    )
    rows->Array.push((
      "Backdrop balance",
      Array.length(gains) == 0
        ? "not applied"
        : largest < 1.005
        ? "sides already matched"
        : `sides matched, largest correction ×${largest->toFixed(2)}`,
    ))
  | _ => ()
  }
  let calibration = field(capture, "colorCalibration")
  if truthy(calibration) {
    rows->Array.push((
      "Colors learned",
      truthy(field(calibration, "learnedColors"))
        ? "from this capture"
        : "no - standard colors used",
    ))
  }
  let app = field(capture, "app")
  if truthy(app) {
    let version = switch field(app, "version") {
    | None | Some(Null) => "?"
    | version => show(version)
    }
    let commit = field(app, "commit")
    rows->Array.push(("App", `${version}${truthy(commit) ? ` (${show(commit)})` : ""}`))
  }
  switch field(capture, "capturedAt") {
  | Some(capturedAt) if truthy(Some(capturedAt)) =>
    rows->Array.push(("Saved", dateOf(capturedAt)->Date.toLocaleString))
  | _ => ()
  }
  {photos, rows}
}
