// Slot tables of one cube size, as lists of facelets (`face * n^2 + row * n +
// col` over U R F D L B). A corner, midge or wing lists the facelets of its
// slot, reference sticker first; a center slot is one facelet. `wings` holds
// one list per depth, outermost first. `fixed` holds the fixed centers of an
// odd cube, one per face.
@genType
type slots = {
  corners: array<array<int>>,
  midges: array<array<int>>,
  wings: array<array<array<int>>>,
  centers: array<array<int>>,
  fixed: array<int>,
}

// The slot tables of an n x n x n cube, n = 2..15, derived like the reference
// (a fresh copy on every call).
@genType let slotTables: int => option<slots>

// The physical faces in slots U R F D L B of each of the 24 whole-cube frames,
// in the rank order of Orbit64 frames, as letters such as "URFDLB".
@genType let frameFaces: array<string>

// The facelet string of a cube state of the type (n, model, pose): six face
// fields in the order U R F D L B, a space between fields. A canonical cube is
// written in its reference pose; a framed cube of an odd size is that picture
// rotated by its frame. The color model writes the letters U R F D L B; the
// picture model (n = 3..15) writes one base64url symbol per facelet, the
// sticker's index within its class, with the rotation of a fixed center in the
// symbol of an odd cube. A cube that is no state of the type is an Error.
@genType
let toFacelets: (int, Orbit64V2.model, Orbit64V2.pose, Orbit64V2.cube) => result<string, string>

// The cube state a facelet string shows, in the pose of the type. Spaces are
// ignored; every other character must be one of U R F D L B (color model) or a
// base64url symbol (picture model). A canonical read turns the cube so that its
// reference is home first (the fixed centers of an odd cube, the DBL corner of
// an even one) and so accepts any whole-cube orientation. A framed read of an
// odd cube keeps the orientation as `frame`; of an even cube, in its corners.
// Anything that is no reachable cube is an Error with its reason, never an
// exception. The checks run in the order of FORMAT-V2.md, so the reason is the
// reference's.
@genType
let fromFacelets: (int, Orbit64V2.model, Orbit64V2.pose, string) => result<Orbit64V2.cube, string>

@genType
type decodedFacelets = {entry: Orbit64V2.entry, facelets: string}

// The V2 token of the cube a facelet string shows, for registry entry `id`.
@genType let encodeFacelets: (int, string) => result<string, string>

// The registry entry of a token and the facelet string of its state.
@genType let decodeFacelets: string => result<decodedFacelets, string>
