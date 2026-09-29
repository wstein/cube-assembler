// The 3D view's orientation gizmo: an X/Y/Z triad from the cube's center
// through its R, U and F faces. Its separate color frame follows regrips,
// while camera motion only changes the arrows' screen positions.
open CubeState

// Far enough that the arrows and their labels stay inside from any view.
let gizmoZoom = 3.4
let tipLength = 0.9
let labelLength = 1.15

let gizmoCamera = (width, height, pitch, yaw): CubeGesture.camera => {
  width,
  height,
  zoom: gizmoZoom,
  pitch,
  yaw,
  size: 1.0,
}

let scale = ((x, y, z), k) => (x *. k, y *. k, z *. k)

type axisName = | @as("x") X | @as("y") Y | @as("z") Z

type gizmoAxis = {
  name: axisName,
  // The face it points through, colored by the virtual reference frame.
  face: faceKey,
  center: (float, float),
  tip: (float, float),
  label: (float, float),
  // Pointing toward the viewer rather than away.
  front: bool,
}

// The three arrows, farthest first.
let gizmoAxes = (camera: CubeGesture.camera) =>
  [(X, R, (1.0, 0.0, 0.0)), (Y, U, (0.0, 1.0, 0.0)), (Z, F, (0.0, 0.0, 1.0))]
  ->Array.map(((name, face, direction)) => {
    let (_, _, depth) = CubeGesture.viewPoint(direction, camera)
    (
      depth,
      {
        name,
        face,
        center: CubeGesture.screenPoint((0.0, 0.0, 0.0), camera),
        tip: CubeGesture.screenPoint(scale(direction, tipLength), camera),
        label: CubeGesture.screenPoint(scale(direction, labelLength), camera),
        front: depth > 0.0,
      },
    )
  })
  ->Array.toSorted(((a, _), (b, _)) => a -. b)
  ->Array.map(((_, axis)) => axis)

// The color assignment belongs to an invisible reference frame, not to
// today's center stickers. Even cubes cannot reveal an absolute frame from
// their centers; their accepted U/R/F labels use the standard color scheme.
// Odd cubes start from their fixed centers so a rotated imported cube keeps
// its displayed orientation.
type colorFrame = {u: string, r: string, f: string, d: string, l: string, b: string}

let initialColorFrame = (cube: cubeState, n): colorFrame => {
  if mod(n, 2) == 1 {
    let mid = n * n / 2
    {
      u: cube.u->Array.getUnsafe(mid),
      r: cube.r->Array.getUnsafe(mid),
      f: cube.f->Array.getUnsafe(mid),
      d: cube.d->Array.getUnsafe(mid),
      l: cube.l->Array.getUnsafe(mid),
      b: cube.b->Array.getUnsafe(mid),
    }
  } else {
    {
      u: CubePieces.solvedColor(U),
      r: CubePieces.solvedColor(R),
      f: CubePieces.solvedColor(F),
      d: CubePieces.solvedColor(D),
      l: CubePieces.solvedColor(L),
      b: CubePieces.solvedColor(B),
    }
  }
}

let rotateColorFrame = (frame: colorFrame, axis, turns): colorFrame => {
  let faces = Dict.fromArray([
    ("U", [[frame.u]]),
    ("R", [[frame.r]]),
    ("F", [[frame.f]]),
    ("D", [[frame.d]]),
    ("L", [[frame.l]]),
    ("B", [[frame.b]]),
  ])
  let rotated = CubeGeometry.rotateCube(faces, axis, turns)
  let color = face => rotated->CubeGeometry.faceGrid(face)->Array.getUnsafe(0)->Array.getUnsafe(0)
  {u: color("U"), r: color("R"), f: color("F"), d: color("D"), l: color("L"), b: color("B")}
}

// Only a whole-cube move regrips an even cube. On odd cubes, any block
// containing the fixed middle slice still changes the gizmo like x/y/z.
let advanceColorFrame = (frame: colorFrame, size, face: faceKey, depth, turns, width) => {
  let middle = (size + 1) / 2
  let containsMiddle = depth - width + 1 <= middle && depth >= middle
  let whole = width == size && depth == size
  if (
    turns == 0 ||
    depth < 1 ||
    depth > size ||
    width < 1 ||
    depth - width + 1 < 1 ||
    !(whole || (mod(size, 2) == 1 && containsMiddle))
  ) {
    frame
  } else {
    let (axis, sign): (CubeGeometry.axis, int) = switch face {
    | R => (X, 1)
    | L => (X, -1)
    | U => (Y, 1)
    | D => (Y, -1)
    | F => (Z, 1)
    | B => (Z, -1)
    }
    rotateColorFrame(frame, axis, turns * sign)
  }
}
