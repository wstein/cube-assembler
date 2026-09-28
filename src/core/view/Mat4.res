// 4x4 column-major matrices for the 3D view, written into Float32Arrays as
// WebGL takes them.
@new external make: int => Float32Array.t = "Float32Array"
@get_index external get: (Float32Array.t, int) => float = ""
@set_index external set: (Float32Array.t, int, float) => unit = ""

let mat4Create = () => {
  let out = make(16)
  out->set(0, 1.0)
  out->set(5, 1.0)
  out->set(10, 1.0)
  out->set(15, 1.0)
  out
}

let mat4Multiply = (out, a, b) => {
  let a00 = a->get(0)
  let a01 = a->get(1)
  let a02 = a->get(2)
  let a03 = a->get(3)
  let a10 = a->get(4)
  let a11 = a->get(5)
  let a12 = a->get(6)
  let a13 = a->get(7)
  let a20 = a->get(8)
  let a21 = a->get(9)
  let a22 = a->get(10)
  let a23 = a->get(11)
  let a30 = a->get(12)
  let a31 = a->get(13)
  let a32 = a->get(14)
  let a33 = a->get(15)
  for column in 0 to 3 {
    let base = column * 4
    let b0 = b->get(base)
    let b1 = b->get(base + 1)
    let b2 = b->get(base + 2)
    let b3 = b->get(base + 3)
    out->set(base, b0 *. a00 +. b1 *. a10 +. b2 *. a20 +. b3 *. a30)
    out->set(base + 1, b0 *. a01 +. b1 *. a11 +. b2 *. a21 +. b3 *. a31)
    out->set(base + 2, b0 *. a02 +. b1 *. a12 +. b2 *. a22 +. b3 *. a32)
    out->set(base + 3, b0 *. a03 +. b1 *. a13 +. b2 *. a23 +. b3 *. a33)
  }
  out
}

let mat4Perspective = (out, fovyRad, aspect, near, far) => {
  let f = 1.0 /. Math.tan(fovyRad /. 2.0)
  let nf = 1.0 /. (near -. far)
  out->set(0, f /. aspect)
  out->set(1, 0.0)
  out->set(2, 0.0)
  out->set(3, 0.0)
  out->set(4, 0.0)
  out->set(5, f)
  out->set(6, 0.0)
  out->set(7, 0.0)
  out->set(8, 0.0)
  out->set(9, 0.0)
  out->set(10, (far +. near) *. nf)
  out->set(11, -1.0)
  out->set(12, 0.0)
  out->set(13, 0.0)
  out->set(14, 2.0 *. far *. near *. nf)
  out->set(15, 0.0)
  out
}

let copy = (out, a, indexes) => indexes->Array.forEach(i => out->set(i, a->get(i)))

let mat4RotateX = (out, a, rad) => {
  let s = Math.sin(rad)
  let c = Math.cos(rad)
  let a10 = a->get(4)
  let a11 = a->get(5)
  let a12 = a->get(6)
  let a13 = a->get(7)
  let a20 = a->get(8)
  let a21 = a->get(9)
  let a22 = a->get(10)
  let a23 = a->get(11)
  if a !== out {
    copy(out, a, [0, 1, 2, 3, 12, 13, 14, 15])
  }
  out->set(4, a10 *. c +. a20 *. s)
  out->set(5, a11 *. c +. a21 *. s)
  out->set(6, a12 *. c +. a22 *. s)
  out->set(7, a13 *. c +. a23 *. s)
  out->set(8, a20 *. c -. a10 *. s)
  out->set(9, a21 *. c -. a11 *. s)
  out->set(10, a22 *. c -. a12 *. s)
  out->set(11, a23 *. c -. a13 *. s)
  out
}

let mat4RotateY = (out, a, rad) => {
  let s = Math.sin(rad)
  let c = Math.cos(rad)
  let a00 = a->get(0)
  let a01 = a->get(1)
  let a02 = a->get(2)
  let a03 = a->get(3)
  let a20 = a->get(8)
  let a21 = a->get(9)
  let a22 = a->get(10)
  let a23 = a->get(11)
  if a !== out {
    copy(out, a, [4, 5, 6, 7, 12, 13, 14, 15])
  }
  out->set(0, a00 *. c -. a20 *. s)
  out->set(1, a01 *. c -. a21 *. s)
  out->set(2, a02 *. c -. a22 *. s)
  out->set(3, a03 *. c -. a23 *. s)
  out->set(8, a00 *. s +. a20 *. c)
  out->set(9, a01 *. s +. a21 *. c)
  out->set(10, a02 *. s +. a22 *. c)
  out->set(11, a03 *. s +. a23 *. c)
  out
}

let mat4Translate = (out, a, (x, y, z)) => {
  if a !== out {
    copy(out, a, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  }
  // Read from `a` before writing: when `a` is `out`, column 3 is the only
  // one written and the reads above it are unchanged.
  let column = i => a->get(i) *. x +. a->get(i + 4) *. y +. a->get(i + 8) *. z +. a->get(i + 12)
  let c0 = column(0)
  let c1 = column(1)
  let c2 = column(2)
  let c3 = column(3)
  out->set(12, c0)
  out->set(13, c1)
  out->set(14, c2)
  out->set(15, c3)
  out
}
