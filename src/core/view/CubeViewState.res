// The 3D view's shared helpers: sticker colors, facelet lookup, seams and
// rotations of the cubies drawn by CubeMesh.
type vec3 = (float, float, float)

type face =
  | @as("u") U
  | @as("d") D
  | @as("f") F
  | @as("b") B
  | @as("r") R
  | @as("l") L

let defaultStickerHex = Dict.fromArray([
  ("W", "#f7f6f1"),
  ("O", "#ff7a1a"),
  ("G", "#1e9e57"),
  ("R", "#cf2a3a"),
  ("B", "#2459d6"),
  ("Y", "#f2d21b"),
])

let autoRotateResumeDelayMs = 1500.0
let autoRotateRadiansPerMs = 0.008 /. (1000.0 /. 60.0)
// The isometric view the 3D cube starts in and resets to.
let isometricPitch = 0.52
let isometricYaw = -0.74

let hexToRgb = (hex: string): vec3 => {
  let clean = hex->String.replace("#", "")
  let channel = digits => Float.parseInt(digits, ~radix=16) /. 255.0
  let char = i => clean->String.charAt(i)
  if String.length(clean) == 3 {
    (channel(char(0) ++ char(0)), channel(char(1) ++ char(1)), channel(char(2) ++ char(2)))
  } else {
    (
      channel(clean->String.substring(~start=0, ~end=2)),
      channel(clean->String.substring(~start=2, ~end=4)),
      channel(clean->String.substring(~start=4, ~end=6)),
    )
  }
}

// Map facelet position to index in CubeState facelet arrays.
let getFaceletColor = (cube: CubeState.cubeState, n, face, x, y, z) => {
  let last = n - 1
  let (facelets, index, fallback) = switch face {
  | U => (cube.u, z * n + x, "W")
  | D => (cube.d, (last - z) * n + x, "Y")
  | F => (cube.f, (last - y) * n + x, "G")
  | B => (cube.b, (last - y) * n + (last - x), "B")
  | R => (cube.r, (last - y) * n + (last - z), "R")
  | L => (cube.l, (last - y) * n + z, "O")
  }
  facelets[index]->Option.getOr(fallback)
}

// Default camera zoom: sublinear scaling so larger cubes (5x5, 6x6, 7x7)
// scale less and stay prominent.
let getDefaultZoom = puzzleSize => 3.0 +. puzzleSize *. 1.8

type seams = {top: bool, bot: bool, rt: bool, lt: bool}

let getFaceSeams = (face, x, y, z, n) => {
  let last = n - 1
  switch face {
  | U => {top: z > 0, bot: z < last, rt: x < last, lt: x > 0}
  | D => {top: z < last, bot: z > 0, rt: x < last, lt: x > 0}
  | F => {top: y < last, bot: y > 0, rt: x < last, lt: x > 0}
  | B => {top: y < last, bot: y > 0, rt: x > 0, lt: x < last}
  | R => {top: y < last, bot: y > 0, rt: z > 0, lt: z < last}
  | L => {top: y < last, bot: y > 0, rt: z < last, lt: z > 0}
  }
}

let rotateVec = ((x, y, z): vec3, axis: CubeGeometry.axis, angle): vec3 => {
  let cos = Math.cos(angle)
  let sin = Math.sin(angle)
  switch axis {
  | X => (x, y *. cos -. z *. sin, y *. sin +. z *. cos)
  | Y => (x *. cos +. z *. sin, y, -.x *. sin +. z *. cos)
  | Z => (x *. cos -. y *. sin, x *. sin +. y *. cos, z)
  }
}
