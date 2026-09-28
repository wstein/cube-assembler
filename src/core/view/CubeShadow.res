// A soft floor shadow for the 3D cube, lit from straight above like a
// studio light: the outline of the rotated cube seen from above. The shader
// needs a fixed number of outline corners.
type vec3 = (float, float, float)
type floorPoint = (float, float)

let shadowOutlinePoints = 8

// Below the cube's bounding sphere, so no orientation reaches the floor.
let shadowFloorY = n => -.n *. 0.9

// The view's model matrix: rotate about X by the pitch after Y by the yaw.
let rotateModelPoint = ((px, py, pz): vec3, pitch, yaw): vec3 => {
  let cy = Math.cos(yaw)
  let sy = Math.sin(yaw)
  let x = px *. cy +. pz *. sy
  let z = -.px *. sy +. pz *. cy
  let cp = Math.cos(pitch)
  let sp = Math.sin(pitch)
  (x, py *. cp -. z *. sp, py *. sp +. z *. cp)
}

// Andrew's monotone chain; collinear and repeated points are dropped.
let convexHull = (points: array<floorPoint>) => {
  let sorted = points->Array.toSorted(((ax, az), (bx, bz)) => {
    // The original's `a[0] - b[0] || a[1] - b[1]`.
    let d = ax -. bx
    d != 0.0 && !Float.isNaN(d) ? d : az -. bz
  })
  let cross = ((ox, oz), (ax, az), (bx, bz)) => (ax -. ox) *. (bz -. oz) -. (az -. oz) *. (bx -. ox)
  let half = list => {
    let hull = []
    list->Array.forEach(p => {
      while (
        Array.length(hull) >= 2 &&
          cross(
            hull->Array.getUnsafe(Array.length(hull) - 2),
            hull->Array.getUnsafe(Array.length(hull) - 1),
            p,
          ) <= 1e-9
      ) {
        hull->Array.pop->ignore
      }
      hull->Array.push(p)
    })
    hull->Array.pop->ignore
    hull
  }
  [...half(sorted), ...half(sorted->Array.toReversed)]
}

// Counter-clockwise convex outline, in floor (x, z) coordinates, of the
// cube seen from above.
let shadowOutline = (n, pitch, yaw) => {
  let h = n /. 2.0
  let points = []
  [-.h, h]->Array.forEach(x =>
    [-.h, h]->Array.forEach(y =>
      [-.h, h]->Array.forEach(
        z => {
          let (rx, _, rz) = rotateModelPoint((x, y, z), pitch, yaw)
          points->Array.push((rx, rz))
        },
      )
    )
  )
  convexHull(points)
}

@new external makeF32: int => Float32Array.t = "Float32Array"
@set_index external setF32: (Float32Array.t, int, float) => unit = ""

let paddedOutline = (outline: array<floorPoint>) => {
  let out = makeF32(shadowOutlinePoints * 2)
  for i in 0 to shadowOutlinePoints - 1 {
    let (x, z) = outline->Array.getUnsafe(Math.Int.min(i, Array.length(outline) - 1))
    out->setF32(i * 2, x)
    out->setF32(i * 2 + 1, z)
  }
  out
}
