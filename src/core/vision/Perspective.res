// Straightening a cube face seen at an angle. Held a little turned toward
// the camera, a face images as a quadrilateral, not a square; a rotation
// alone leaves one side taller than the other. A homography maps the face's
// four corners onto a square, and the face is resampled through it.
type point = (float, float)

// 3x3, row-major, h[8] = 1.
type homography = array<float>

// The homography taking each of `from` onto the matching point of `to`
// (four points each, no three in a line).
let homography = (from: array<point>, to: array<point>): homography => {
  // Eight equations in h0..h7: u = (h0 x + h1 y + h2) / (h6 x + h7 y + 1),
  // same for v.
  let rows = []
  for i in 0 to 3 {
    let (x, y) = from->Array.getUnsafe(i)
    let (u, v) = to->Array.getUnsafe(i)
    rows->Array.push([x, y, 1.0, 0.0, 0.0, 0.0, -.u *. x, -.u *. y, u])
    rows->Array.push([0.0, 0.0, 0.0, x, y, 1.0, -.v *. x, -.v *. y, v])
  }
  let at = (r, c) => rows->Array.getUnsafe(r)->Array.getUnsafe(c)
  // Gaussian elimination with partial pivoting.
  for col in 0 to 7 {
    let pivot = ref(col)
    for r in col + 1 to 7 {
      if Math.abs(at(r, col)) > Math.abs(at(pivot.contents, col)) {
        pivot := r
      }
    }
    let swap = rows->Array.getUnsafe(col)
    rows->Array.setUnsafe(col, rows->Array.getUnsafe(pivot.contents))
    rows->Array.setUnsafe(pivot.contents, swap)
    if Math.abs(at(col, col)) < 1e-12 {
      JsError.throwWithMessage("Corners are degenerate")
    }
    let pivotRow = rows->Array.getUnsafe(col)
    for r in 0 to 7 {
      if r != col {
        let row = rows->Array.getUnsafe(r)
        let f = row->Array.getUnsafe(col) /. pivotRow->Array.getUnsafe(col)
        for c in col to 8 {
          row->Array.setUnsafe(c, row->Array.getUnsafe(c) -. f *. pivotRow->Array.getUnsafe(c))
        }
      }
    }
  }
  [...rows->Array.mapWithIndex((row, i) => row->Array.getUnsafe(8) /. row->Array.getUnsafe(i)), 1.0]
}

let applyHomography = (h: homography, (x, y): point): point => {
  let h = i => h->Array.getUnsafe(i)
  let w = h(6) *. x +. h(7) *. y +. h(8)
  ((h(0) *. x +. h(1) *. y +. h(2)) /. w, (h(3) *. x +. h(4) *. y +. h(5)) /. w)
}

// The face inside `corners` (top-left, top-right, bottom-right, bottom-left
// in `frame`'s pixels) resampled into a size x size square, bilinearly -
// the perspective counterpart of reading a turned square upright.
let warpQuadToSquare = (frame, width, height, corners, size) => {
  let side = Int.toFloat(size)
  let toFrame = homography([(0.0, 0.0), (side, 0.0), (side, side), (0.0, side)], corners)
  let out = Pixels.make(size * size * 4)
  let at = (x, y, c) =>
    Int.toFloat(
      frame->Pixels.get(
        (Math.Int.min(height - 1, Math.Int.max(0, y)) * width +
          Math.Int.min(width - 1, Math.Int.max(0, x))) * 4 + c,
      ),
    )
  for y in 0 to size - 1 {
    for x in 0 to size - 1 {
      let (sx, sy) = applyHomography(toFrame, (Int.toFloat(x) +. 0.5, Int.toFloat(y) +. 0.5))
      let fx = sx -. 0.5
      let fy = sy -. 0.5
      let x0f = Math.floor(fx)
      let y0f = Math.floor(fy)
      let tx = fx -. x0f
      let ty = fy -. y0f
      let x0 = Float.toInt(x0f)
      let y0 = Float.toInt(y0f)
      let to = (y * size + x) * 4
      for c in 0 to 2 {
        out->Pixels.setFloat(
          to + c,
          (at(x0, y0, c) *. (1.0 -. tx) +. at(x0 + 1, y0, c) *. tx) *. (1.0 -. ty) +.
            (at(x0, y0 + 1, c) *. (1.0 -. tx) +. at(x0 + 1, y0 + 1, c) *. tx) *. ty,
        )
      }
      out->Pixels.set(to + 3, 255)
    }
  }
  out
}
