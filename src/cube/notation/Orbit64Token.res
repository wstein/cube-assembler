// The Orbit64 state token of the app: V2, color model, framed pose, for cubes
// of size 2..15. A framed color token keeps the whole-cube orientation, so a
// cube read from the facelets round-trips with its orientation. Framed color
// tokens of sizes 2, 3, 4, 6 and 7 match the strings of the earlier format.
// Format:
// FORMAT-V2.md of flix-orbit64 (Apache-2.0); the codec is in Orbit64V2.res and
// Orbit64V2Facelets.res.

let minSize = 2
let maxSize = 15

let tokenPattern = RegExp.fromString("^[A-Za-z0-9_-]+$")

let sizeOfFacelets = text => {
  let compact = text->String.replaceAllRegExp(/\s+/g, "")
  let perFace = String.length(compact) / 6
  let n = perFace->Int.toFloat->Math.sqrt->Int.fromFloat
  String.length(compact) == 6 * perFace && n * n == perFace && n >= minSize && n <= maxSize
    ? Some(n)
    : None
}

let framedColorId = n =>
  Orbit64V2.entries
  ->Array.find(entry => entry.n == n && entry.model == Color && entry.pose == Framed)
  ->Option.map(entry => entry.id)

// True for a token of a registered V2 length.
@genType
let looksLikeToken = input => {
  let token = String.trim(input)
  tokenPattern->RegExp.test(token) &&
    Orbit64V2.entries->Array.some(entry => entry.length == String.length(token))
}

// The token of a cube given as facelets (six blocks in U R F D L B order,
// letters U R F D L B), or null when the facelets are no reachable cube.
@genType
let encodeState = facelets =>
  sizeOfFacelets(facelets)
  ->Option.flatMap(framedColorId)
  ->Option.flatMap(id =>
    Orbit64V2Facelets.encodeFacelets(id, facelets)->Result.mapOr(None, token => Some(token))
  )
  ->Null.fromOption

// The facelets a token shows, or null when it is no color-model V2 token.
@genType
let decodeState = token =>
  switch Orbit64V2Facelets.decodeFacelets(String.trim(token)) {
  | Ok({entry, facelets}) if entry.model == Color => Some(facelets)
  | _ => None
  }->Null.fromOption
