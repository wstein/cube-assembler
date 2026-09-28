let faceOrder = ["u", "r", "f", "d", "l", "b"]
let faceCrop = /^face-([urfdlb])\.(?:jpe?g|png)$/i
let jsonFile = /\.json$/i
let imageName = /\.(?:jpe?g|png|webp)$/i

type photoFile = {name: string, @as("type") type_: string, size: float}
type named = {name: string}

type uploadKind = | @as("fixture") Fixture | @as("photos") Photos

// Archives are expanded first. Metadata selects fixture loading; otherwise
// the files use the six-photo capture flow.
let uploadKind = (files: array<named>) =>
  files->Array.some(file => jsonFile->RegExp.test(file.name)) ? Fixture : Photos

let isNamedFaceCrop = name => faceCrop->RegExp.test(name)

type photoFrameMode = | @as("auto") Auto | @as("cropped") Cropped | @as("full") Full
type captureMode = | @as("cv") Cv | @as("guide") Guide
type readMode = | @as("aligned") Aligned | @as("fixed") Fixed | @as("cropped") CroppedRead

let photoReadModes = (name, mode, captureMode) => {
  let fullPhotoGeometry = captureMode == Guide ? Fixed : Aligned
  if mode == Cropped || (mode == Auto && isNamedFaceCrop(name)) {
    [CroppedRead]
  } else if mode == Full || captureMode == Guide {
    [fullPhotoGeometry]
  } else {
    [fullPhotoGeometry, CroppedRead]
  }
}

type order =
  | @as("ordered") Ordered({order: array<int>}) | @as("invalid") Invalid({message: string})

// A fixture's six face-*.jpg files have an unambiguous slot order: which
// file goes in each slot. Other photos keep the picker's order so the user
// can inspect and rearrange them.
let photoUploadOrder = (files: array<photoFile>) =>
  if Array.length(files) != 6 {
    Invalid({message: "Choose six photos, one per face."})
  } else if (
    files->Array.some(file =>
      file.size <= 0.0 ||
        !(
          file.type_ != ""
            ? file.type_->String.startsWith("image/")
            : imageName->RegExp.test(file.name)
        )
    )
  ) {
    Invalid({message: "Choose six nonempty images."})
  } else {
    let named = files->Array.map(file =>
      faceCrop
      ->RegExp.exec(file.name)
      ->Option.flatMap(result => RegExp.Result.matches(result)[0])
      ->Option.flatMap(face => face)
      ->Option.map(String.toLowerCase)
    )
    let distinct = named->Array.filterMap(face => face)->Set.fromArray->Set.size
    if named->Array.every(Option.isSome) && distinct == 6 {
      Ordered({order: faceOrder->Array.map(face => named->Array.findIndex(n => n == Some(face)))})
    } else {
      Ordered({order: [0, 1, 2, 3, 4, 5]})
    }
  }
