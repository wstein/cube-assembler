// The mini cube in a corner of the 3D view: a small cube turned with the
// view, its faces colored as the real cube's faces are now, and a regrip
// style X/Y/Z triad through its R, U and F faces. Swiping one of its faces
// turns the whole cube; it uses the same projection as the big cube's hit
// testing, so the gizmo's pointer handling can pick it with
// pickCubeSurface on a 1x1 cube.
open CubeState

// Far enough that the cube, the arrows and their labels stay inside the
// gizmo from any angle.
let miniZoom = 4.2
let half = 0.5
let tipLength = 0.95
let labelLength = 1.12

// The mini cube is only about 60 units across: following the pointer as a
// big cube's sticker does would spin it three quarter turns in a short
// swipe. Its angle is scaled so a quarter turn takes about half the gizmo.
let miniTurnScale = 0.3

let miniCamera = (width, height, pitch, yaw): CubeGesture.camera => {
  width,
  height,
  zoom: miniZoom,
  pitch,
  yaw,
  size: 1.0,
}

// Each face's outward normal and its corners, in order around it.
let faceGeometry = (face: faceKey) => {
  let h = half
  switch face {
  | R => ((1.0, 0.0, 0.0), [(h, -.h, -.h), (h, h, -.h), (h, h, h), (h, -.h, h)])
  | L => ((-1.0, 0.0, 0.0), [(-.h, -.h, -.h), (-.h, -.h, h), (-.h, h, h), (-.h, h, -.h)])
  | U => ((0.0, 1.0, 0.0), [(-.h, h, -.h), (-.h, h, h), (h, h, h), (h, h, -.h)])
  | D => ((0.0, -1.0, 0.0), [(-.h, -.h, -.h), (h, -.h, -.h), (h, -.h, h), (-.h, -.h, h)])
  | F => ((0.0, 0.0, 1.0), [(-.h, -.h, h), (h, -.h, h), (h, h, h), (-.h, h, h)])
  | B => ((0.0, 0.0, -1.0), [(-.h, -.h, -.h), (-.h, h, -.h), (h, h, -.h), (h, -.h, -.h)])
  }
}

let scale = ((x, y, z), k) => (x *. k, y *. k, z *. k)

type miniFace = {face: faceKey, points: array<(float, float)>}

// The faces turned toward the camera, farthest first, as screen polygons.
let miniCubeFaces = (camera: CubeGesture.camera) =>
  CubeTypes.faceKeys
  ->Array.filterMap(face => {
    let (normal, corners) = faceGeometry(face)
    let (cx, cy, cz) = CubeGesture.viewPoint(scale(normal, half), camera)
    let (nx, ny, nz) = CubeGesture.viewPoint(normal, camera)
    // Seen from the camera at (0, 0, zoom) in view space.
    let facing = -.cx *. nx -. cy *. ny +. (camera.zoom -. cz) *. nz
    facing > 1e-9
      ? Some((cz, {face, points: corners->Array.map(p => CubeGesture.screenPoint(p, camera))}))
      : None
  })
  ->Array.toSorted(((a, _), (b, _)) => a -. b)
  ->Array.map(((_, face)) => face)

type axisName = | @as("x") X | @as("y") Y | @as("z") Z

type miniAxis = {
  name: axisName,
  // The face it points through, colored like that face.
  face: faceKey,
  center: (float, float),
  tip: (float, float),
  label: (float, float),
  // Pointing toward the viewer rather than away.
  front: bool,
}

// The X/Y/Z arrows from the cube's center through R, U and F, farthest
// first.
let miniCubeAxes = (camera: CubeGesture.camera) =>
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

let miniCubeFaceColors = (cube: cubeState, n) =>
  Dict.fromArray([
    ("U", faceColor(cube.u, n)),
    ("R", faceColor(cube.r, n)),
    ("F", faceColor(cube.f, n)),
    ("D", faceColor(cube.d, n)),
    ("L", faceColor(cube.l, n)),
    ("B", faceColor(cube.b, n)),
  ])
