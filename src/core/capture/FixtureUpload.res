// Reading an uploaded fixture's meta.json: whether it is a saved fixture at
// all, which selected photo belongs to which face, and the capture record
// each face starts from. Reading the files stays with the TypeScript
// caller; the app applies its current color analysis afterwards.

// JavaScript's truthiness and Date.parse, for reading meta.json the way the
// original did: any value can stand where a field was expected.
@val external dateParse: JSON.t => float = "Date.parse"
let truthy = FixtureZip.truthy
let field = FixtureZip.field

type facePlan = {
  // The capture slot, U..B.
  face: string,
  // The selected file holding its photo.
  photo: string,
  colors: array<array<string>>,
  timestamp: float,
  backgroundColor?: JSON.t,
  previewColorProfile?: JSON.t,
}

@tag("ok")
type plan =
  | @as(true) Ready({faces: array<facePlan>})
  | @as(false) Rejected({message: string})

let planFixtureUpload = (meta: JSON.t, metaName, photoNames: array<string>, now) => {
  let colorGrids = FixtureFormat.readFixtureColors(meta)->Null.toOption->Option.map(c => c.colors)
  let gridSize = switch field(Some(meta), "gridSize") {
  | Some(Number(size)) => Some(size)
  | _ => None
  }
  switch (field(Some(meta), "faces"), gridSize, colorGrids) {
  | (faces, Some(gridSize), Some(colorGrids)) if truthy(faces) =>
    let entries = switch faces {
    | Some(Object(faces)) => faces->Dict.toArray
    | _ => []
    }
    let missing = []
    let planned = entries->Array.filterMap(((key, faceData)) => {
      let face = String.toUpperCase(key)
      let faceData = Some(faceData)
      let photo = switch field(faceData, "photo") {
      | Some(String(photo)) if photoNames->Array.includes(photo) => Some(photo)
      | _ => None
      }
      let colors = colorGrids->Dict.get(face)
      let size = Float.toInt(gridSize)
      switch (photo, colors) {
      | (Some(photo), Some(colors))
        if Int.toFloat(size) == gridSize && CapturedFaceMatching.validateFaceColors(colors, size) =>
        let capturedAt = field(faceData, "capturedAt")
        let timestamp = switch capturedAt {
        | Some(value) if truthy(capturedAt) =>
          let parsed = dateParse(value)
          // The original's `Date.parse(...) || Date.now()`.
          parsed == 0.0 || Float.isNaN(parsed) ? now : parsed
        | _ => now
        }
        let plan = {face, photo, colors, timestamp}
        let background = field(faceData, "background")
        let plan = switch background {
        | Some(background) if truthy(Some(background)) => {...plan, backgroundColor: background}
        | _ => plan
        }
        let preview = field(faceData, "previewColorProfile")
        let plan =
          truthy(field(preview, "id")) &&
          truthy(field(preview, "name")) &&
          truthy(field(preview, "colors"))
            ? {...plan, previewColorProfile: preview->Option.getUnsafe}
            : plan
        Some(plan)
      | _ =>
        missing->Array.push(face)
        None
      }
    })
    Array.length(missing) > 0
      ? Rejected({
          message: `❌ Missing or invalid photo/colors for face${Array.length(missing) == 1
              ? ""
              : "s"} ${missing->Array.join(
              ", ",
            )} - make sure all 6 face-*.jpg files named in ${metaName} are selected too.`,
        })
      : Ready({faces: planned})
  | _ =>
    Rejected({
      message: `❌ ${metaName} doesn't look like a saved fixture (missing gridSize, faces or their colors).`,
    })
  }
}
