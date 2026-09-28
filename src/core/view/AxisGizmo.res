// The 3D view's orientation gizmo, after regrip's: an X/Y/Z triad from the
// cube's center through its R, U and F faces, turned with the view and
// colored by the faces there now. It only shows which way the cube is
// held; two fingers on the cube turn it.
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
  // The face it points through, colored like that face.
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

// The color a face shows now: the most common one among its center
// stickers (every sticker on a 2x2), so a scrambled face still reads as
// the color it is being solved to. Ties go to the first seen.
let faceColor = (facelets: array<string>, n) => {
  let inner = n >= 3
  let counts = Dict.make()
  let order = []
  facelets->Array.forEachWithIndex((color, i) => {
    let row = i / n
    let col = mod(i, n)
    if !inner || (row > 0 && row < n - 1 && col > 0 && col < n - 1) {
      switch counts->Dict.get(color) {
      | Some(count) => counts->Dict.set(color, count + 1)
      | None =>
        counts->Dict.set(color, 1)
        order->Array.push(color)
      }
    }
  })
  order
  ->Array.reduce(None, (best, color) => {
    let count = counts->Dict.getUnsafe(color)
    switch best {
    | Some((_, bestCount)) if bestCount >= count => best
    | _ => Some((color, count))
    }
  })
  ->Option.mapOr("", ((color, _)) => color)
}

let gizmoFaceColors = (cube: cubeState, n) =>
  Dict.fromArray([
    ("U", faceColor(cube.u, n)),
    ("R", faceColor(cube.r, n)),
    ("F", faceColor(cube.f, n)),
    ("D", faceColor(cube.d, n)),
    ("L", faceColor(cube.l, n)),
    ("B", faceColor(cube.b, n)),
  ])
