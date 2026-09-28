// The 3D cube's triangle mesh: every cubie's beveled faces, sticker tiles
// and the dark plastic caps a turn exposes, with a turning layer rotated in
// place.
open CubeViewState

type turningLayer = {
  face: CubeState.faceKey,
  depth?: int,
  // Layers turning together, ending at `depth`; 1 when omitted.
  width?: int,
  // In radians.
  angle: float,
  // Lights up the layers, e.g. while a block is being picked.
  highlight?: bool,
}

// Uint16Array or Uint32Array, whichever holds the vertex count.
type indices

type meshData = {
  positions: Float32Array.t,
  normals: Float32Array.t,
  colors: Float32Array.t,
  occlusion: Float32Array.t,
  indices: indices,
  vertexCount: int,
  indexCount: int,
}

external fromUint16: Uint16Array.t => indices = "%identity"
external fromUint32: Uint32Array.t => indices = "%identity"

type capExtents = {uNeg: float, uPos: float, vNeg: float, vPos: float}

let getCapExtents = (face, x, y, z, last) => {
  let inner = 0.5
  let outer = 0.44
  let pick = cond => cond ? inner : outer
  switch face {
  | U => {uNeg: pick(x > 0), uPos: pick(x < last), vNeg: pick(z < last), vPos: pick(z > 0)}
  | D => {uNeg: pick(x > 0), uPos: pick(x < last), vNeg: pick(z > 0), vPos: pick(z < last)}
  | F => {uNeg: pick(x > 0), uPos: pick(x < last), vNeg: pick(y > 0), vPos: pick(y < last)}
  | B => {uNeg: pick(x < last), uPos: pick(x > 0), vNeg: pick(y > 0), vPos: pick(y < last)}
  | R => {uNeg: pick(z < last), uPos: pick(z > 0), vNeg: pick(y > 0), vPos: pick(y < last)}
  | L => {uNeg: pick(z > 0), uPos: pick(z < last), vNeg: pick(y > 0), vPos: pick(y < last)}
  }
}

type axes = {u: vec3, v: vec3, n: vec3}

// Face coordinate axes, with u x v = n.
let uAxes = {u: (1.0, 0.0, 0.0), v: (0.0, 0.0, -1.0), n: (0.0, 1.0, 0.0)}
let dAxes = {u: (1.0, 0.0, 0.0), v: (0.0, 0.0, 1.0), n: (0.0, -1.0, 0.0)}
let fAxes = {u: (1.0, 0.0, 0.0), v: (0.0, 1.0, 0.0), n: (0.0, 0.0, 1.0)}
let bAxes = {u: (-1.0, 0.0, 0.0), v: (0.0, 1.0, 0.0), n: (0.0, 0.0, -1.0)}
let rAxes = {u: (0.0, 0.0, -1.0), v: (0.0, 1.0, 0.0), n: (1.0, 0.0, 0.0)}
let lAxes = {u: (0.0, 0.0, 1.0), v: (0.0, 1.0, 0.0), n: (-1.0, 0.0, 0.0)}

let faceAxes = face =>
  switch face {
  | U => uAxes
  | D => dAxes
  | F => fAxes
  | B => bAxes
  | R => rAxes
  | L => lAxes
  }

// One push per list and triangle, as a single call with all its values.
@send external push3: (array<'a>, 'a, 'a, 'a) => unit = "push"
@send external push9: (array<'a>, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a, 'a) => unit = "push"

// Stickerless pieces are colored plastic. Use the built-in Matte capture
// palette rather than the brighter colors used to draw stickers and the
// net.
let mattePlasticColors =
  ProfileSettings.builtinColorProfiles()
  ->Array.find(profile => profile.name == "Matte")
  ->Option.map(profile => profile.colors)

let allSeams = {top: true, bot: true, rt: true, lt: true}
let darkPlastic = (0.11, 0.11, 0.12)

let buildCubeMesh = (cube, n, palette: Dict.t<string>, stickerless, turn: option<turningLayer>) => {
  let last = n - 1
  let lastF = Int.toFloat(last)
  let posList = []
  let normList = []
  let colList = []
  let occlusionList = []
  let idxList = []
  let addTri = ((p00, p01, p02), (p10, p11, p12), (p20, p21, p22), n0, n1, n2, col, occlusion) => {
    let base = Array.length(posList) / 3
    let (n00, n01, n02) = n0
    let (n10, n11, n12) = n1
    let (n20, n21, n22) = n2
    let (r, g, b) = col
    posList->push9(p00, p01, p02, p10, p11, p12, p20, p21, p22)
    normList->push9(n00, n01, n02, n10, n11, n12, n20, n21, n22)
    colList->push9(r, g, b, r, g, b, r, g, b)
    idxList->push3(base, base + 1, base + 2)
    occlusionList->push3(occlusion, occlusion, occlusion)
  }

  let addInteriorFace = ((c0, c1, c2), (u0, u1, u2), (v0, v1, v2), normal, extents) => {
    let depth = 0.495
    let (n0, n1, n2) = normal
    let point = (a, b) => {
      let uDist = a < 0.0 ? -.extents.uNeg : extents.uPos
      let vDist = b < 0.0 ? -.extents.vNeg : extents.vPos
      (
        c0 +. uDist *. u0 +. vDist *. v0 +. depth *. n0,
        c1 +. uDist *. u1 +. vDist *. v1 +. depth *. n1,
        c2 +. uDist *. u2 +. vDist *. v2 +. depth *. n2,
      )
    }
    let bottomLeft = point(-1.0, -1.0)
    let bottomRight = point(1.0, -1.0)
    let topRight = point(1.0, 1.0)
    let topLeft = point(-1.0, 1.0)
    addTri(bottomLeft, bottomRight, topRight, normal, normal, normal, darkPlastic, 1.0)
    addTri(bottomLeft, topRight, topLeft, normal, normal, normal, darkPlastic, 1.0)
  }

  // A rounded, beveled face with smoothed normals.
  let addBeveledFace = (cx, cy, cz, uAxis, vAxis, nAxis, h, r, col, elevation, seams) => {
    let (ua0, ua1, ua2) = uAxis
    let (va0, va1, va2) = vAxis
    let (na0, na1, na2) = nAxis
    let s = h -. r
    // Outer edge and corner 45 degree bevel midpoint (h - r/2).
    let miter = r *. 0.5
    // Spherical radius matching 45 degree edge chamfers.
    let miterApex = r *. (1.0 -. 1.0 /. Math.sqrt(6.0))
    let hNorm = h +. elevation
    let zOuter = hNorm -. r *. 0.65
    let zSkirt = hNorm -. 0.14
    let {top: seamTop, bot: seamBot, rt: seamRt, lt: seamLt} = seams

    let pt = (u, v, n) => (
      cx +. u *. ua0 +. v *. va0 +. n *. na0,
      cy +. u *. ua1 +. v *. va1 +. n *. na1,
      cz +. u *. ua2 +. v *. va2 +. n *. na2,
    )
    let norm = (nu, nv, nn) => {
      let hyp = Math.hypotMany([nu, nv, nn])
      // The original's `hypot || 1`: zero or NaN counts as 1.
      let len = hyp == 0.0 || Float.isNaN(hyp) ? 1.0 : hyp
      (
        (nu *. ua0 +. nv *. va0 +. nn *. na0) /. len,
        (nu *. ua1 +. nv *. va1 +. nn *. na1) /. len,
        (nu *. ua2 +. nv *. va2 +. nn *. na2) /. len,
      )
    }

    // Inner 4 vertices of the flat face.
    let c0 = pt(-.s, -.s, hNorm)
    let nc0 = norm(0.0, 0.0, 1.0)
    let c1 = pt(s, -.s, hNorm)
    let nc1 = norm(0.0, 0.0, 1.0)
    let c2 = pt(s, s, hNorm)
    let nc2 = norm(0.0, 0.0, 1.0)
    let c3 = pt(-.s, s, hNorm)
    let nc3 = norm(0.0, 0.0, 1.0)

    // Edge outer vertices: an internal seam reaches h at depth zOuter; an
    // outer cube edge meets the adjacent face of the same cubie at a 45
    // degree rounded miter.
    let vTop = seamTop ? h : h -. miter
    let zTop = seamTop ? zOuter : hNorm -. miter
    let eTop0 = pt(-.s, vTop, zTop)
    let neTop0 = norm(0.0, 0.7, 0.7)
    let eTop1 = pt(s, vTop, zTop)
    let neTop1 = norm(0.0, 0.7, 0.7)

    let vBot = seamBot ? -.h : -.(h -. miter)
    let zBot = seamBot ? zOuter : hNorm -. miter
    let eBot0 = pt(-.s, vBot, zBot)
    let neBot0 = norm(0.0, -0.7, 0.7)
    let eBot1 = pt(s, vBot, zBot)
    let neBot1 = norm(0.0, -0.7, 0.7)

    let uRt = seamRt ? h : h -. miter
    let zRt = seamRt ? zOuter : hNorm -. miter
    let eRt0 = pt(uRt, -.s, zRt)
    let neRt0 = norm(0.7, 0.0, 0.7)
    let eRt1 = pt(uRt, s, zRt)
    let neRt1 = norm(0.7, 0.0, 0.7)

    let uLt = seamLt ? -.h : -.(h -. miter)
    let zLt = seamLt ? zOuter : hNorm -. miter
    let eLt0 = pt(uLt, -.s, zLt)
    let neLt0 = norm(-0.7, 0.0, 0.7)
    let eLt1 = pt(uLt, s, zLt)
    let neLt1 = norm(-0.7, 0.0, 0.7)

    // Corner vertices.
    let (crnTR, ncrnTR) = if seamRt && seamTop {
      (pt(h, h, zOuter), norm(0.6, 0.6, 0.5))
    } else if !seamRt && !seamTop {
      (pt(h -. miterApex, h -. miterApex, hNorm -. miterApex), norm(0.57735, 0.57735, 0.57735))
    } else if seamRt && !seamTop {
      (pt(h, h -. miter, hNorm -. miter), norm(0.0, 0.7, 0.7))
    } else {
      (pt(h -. miter, h, hNorm -. miter), norm(0.7, 0.0, 0.7))
    }

    let (crnTL, ncrnTL) = if seamLt && seamTop {
      (pt(-.h, h, zOuter), norm(-0.6, 0.6, 0.5))
    } else if !seamLt && !seamTop {
      (pt(-.(h -. miterApex), h -. miterApex, hNorm -. miterApex), norm(-0.57735, 0.57735, 0.57735))
    } else if seamLt && !seamTop {
      (pt(-.h, h -. miter, hNorm -. miter), norm(0.0, 0.7, 0.7))
    } else {
      (pt(-.(h -. miter), h, hNorm -. miter), norm(-0.7, 0.0, 0.7))
    }

    let (crnBL, ncrnBL) = if seamLt && seamBot {
      (pt(-.h, -.h, zOuter), norm(-0.6, -0.6, 0.5))
    } else if !seamLt && !seamBot {
      (
        pt(-.(h -. miterApex), -.(h -. miterApex), hNorm -. miterApex),
        norm(-0.57735, -0.57735, 0.57735),
      )
    } else if seamLt && !seamBot {
      (pt(-.h, -.(h -. miter), hNorm -. miter), norm(0.0, -0.7, 0.7))
    } else {
      (pt(-.(h -. miter), -.h, hNorm -. miter), norm(-0.7, 0.0, 0.7))
    }

    let (crnBR, ncrnBR) = if seamRt && seamBot {
      (pt(h, -.h, zOuter), norm(0.6, -0.6, 0.5))
    } else if !seamRt && !seamBot {
      (pt(h -. miterApex, -.(h -. miterApex), hNorm -. miterApex), norm(0.57735, -0.57735, 0.57735))
    } else if seamRt && !seamBot {
      (pt(h, -.(h -. miter), hNorm -. miter), norm(0.0, -0.7, 0.7))
    } else {
      (pt(h -. miter, -.h, hNorm -. miter), norm(0.7, 0.0, 0.7))
    }

    let tri = (a, b, c, na, nb, nc) => addTri(a, b, c, na, nb, nc, col, 1.0)

    // 1. Center flat region.
    tri(c0, c1, c2, nc0, nc1, nc2)
    tri(c0, c2, c3, nc0, nc2, nc3)

    // 2. Edges.
    tri(c3, c2, eTop1, nc3, nc2, neTop1)
    tri(c3, eTop1, eTop0, nc3, neTop1, neTop0)

    tri(eBot0, eBot1, c1, neBot0, neBot1, nc1)
    tri(eBot0, c1, c0, neBot0, nc1, nc0)

    tri(c1, eRt0, eRt1, nc1, neRt0, neRt1)
    tri(c1, eRt1, c2, nc1, neRt1, nc2)

    tri(eLt0, c0, c3, neLt0, nc0, nc3)
    tri(eLt0, c3, eLt1, neLt0, nc3, neLt1)

    // 3. Corner transitions.
    if !seamRt && !seamTop {
      tri(c2, eRt1, eTop1, nc2, neRt1, neTop1)
      tri(eRt1, crnTR, eTop1, neRt1, ncrnTR, neTop1)
    } else {
      tri(c2, eRt1, crnTR, nc2, neRt1, ncrnTR)
      tri(c2, crnTR, eTop1, nc2, ncrnTR, neTop1)
    }

    if !seamLt && !seamTop {
      tri(c3, eTop0, eLt1, nc3, neTop0, neLt1)
      tri(eTop0, crnTL, eLt1, neTop0, ncrnTL, neLt1)
    } else {
      tri(c3, eTop0, crnTL, nc3, neTop0, ncrnTL)
      tri(c3, crnTL, eLt1, nc3, ncrnTL, neLt1)
    }

    if !seamLt && !seamBot {
      tri(c0, eLt0, eBot0, nc0, neLt0, neBot0)
      tri(eLt0, crnBL, eBot0, neLt0, ncrnBL, neBot0)
    } else {
      tri(c0, eLt0, crnBL, nc0, neLt0, ncrnBL)
      tri(c0, crnBL, eBot0, nc0, ncrnBL, neBot0)
    }

    if !seamRt && !seamBot {
      tri(c1, eBot1, eRt0, nc1, neBot1, neRt0)
      tri(eBot1, crnBR, eRt0, neBot1, ncrnBR, neRt0)
    } else {
      tri(c1, eBot1, crnBR, nc1, neBot1, ncrnBR)
      tri(c1, crnBR, eRt0, nc1, ncrnBR, neRt0)
    }

    let shaded = (a, b, c, normal) => addTri(a, b, c, normal, normal, normal, col, 0.58)

    // A triangle wound counter-clockwise as seen from `nOut`, so back-face
    // culling keeps it from that side.
    let addFacingTri = ((ax, ay, az) as a, (bx, by, bz) as b, (cx, cy, cz) as c, nOut) => {
      let (o0, o1, o2) = nOut
      let e10 = bx -. ax
      let e11 = by -. ay
      let e12 = bz -. az
      let e20 = cx -. ax
      let e21 = cy -. ay
      let e22 = cz -. az
      let facing =
        (e11 *. e22 -. e12 *. e21) *. o0 +.
        (e12 *. e20 -. e10 *. e22) *. o1 +.
        (e10 *. e21 -. e11 *. e20) *. o2
      facing > 0.0 ? shaded(a, b, c, nOut) : shaded(a, c, b, nOut)
    }

    // A wall from surface points a-b straight down to the skirt depth,
    // facing out along the face-local direction (ou, ov).
    let addWall = (a, b, ou, ov) => {
      let sink = ((px, py, pz)) => {
        let k = (px -. cx) *. na0 +. (py -. cy) *. na1 +. (pz -. cz) *. na2 -. zSkirt
        (px -. k *. na0, py -. k *. na1, pz -. k *. na2)
      }
      let nOut = norm(ou, ov, 0.0)
      addFacingTri(a, sink(a), sink(b), nOut)
      addFacingTri(a, sink(b), b, nOut)
    }

    // 4. Side skirts into internal seam grooves ONLY (matching cubie color).
    if seamTop {
      let sTop0 = pt(-.s, h, zSkirt)
      let nsTop = norm(0.0, 1.0, 0.0)
      let sTop1 = pt(s, h, zSkirt)
      shaded(eTop0, eTop1, sTop1, nsTop)
      shaded(eTop0, sTop1, sTop0, nsTop)
    }
    if seamBot {
      let sBot0 = pt(-.s, -.h, zSkirt)
      let nsBot = norm(0.0, -1.0, 0.0)
      let sBot1 = pt(s, -.h, zSkirt)
      shaded(eBot1, eBot0, sBot0, nsBot)
      shaded(eBot1, sBot0, sBot1, nsBot)
    }
    if seamRt {
      let sRt0 = pt(h, -.s, zSkirt)
      let nsRt = norm(1.0, 0.0, 0.0)
      let sRt1 = pt(h, s, zSkirt)
      shaded(eRt1, eRt0, sRt0, nsRt)
      shaded(eRt1, sRt0, sRt1, nsRt)
    }
    if seamLt {
      let sLt0 = pt(-.h, -.s, zSkirt)
      let nsLt = norm(-1.0, 0.0, 0.0)
      let sLt1 = pt(-.h, s, zSkirt)
      shaded(eLt0, eLt1, sLt1, nsLt)
      shaded(eLt0, sLt1, sLt0, nsLt)
    }

    // 5. The skirts span only the flat part of each side. Continue every
    // seam wall out to the corners, or the junctions of four cubies stay
    // open and the background shows through them.
    if seamTop {
      addWall(crnTL, eTop0, 0.0, 1.0)
      addWall(eTop1, crnTR, 0.0, 1.0)
    }
    if seamBot {
      addWall(crnBL, eBot0, 0.0, -1.0)
      addWall(eBot1, crnBR, 0.0, -1.0)
    }
    if seamRt {
      addWall(crnBR, eRt0, 1.0, 0.0)
      addWall(eRt1, crnTR, 1.0, 0.0)
    }
    if seamLt {
      addWall(crnBL, eLt0, -1.0, 0.0)
      addWall(eLt1, crnTL, -1.0, 0.0)
    }
  }

  let depth = switch turn {
  | Some({depth}) => depth
  | _ => 1
  }
  let width = switch turn {
  | Some({width}) => width
  | _ => 1
  }

  for z in 0 to n - 1 {
    for y in 0 to n - 1 {
      for x in 0 to n - 1 {
        let center = (
          Int.toFloat(x) -. lastF /. 2.0,
          Int.toFloat(y) -. lastF /. 2.0,
          Int.toFloat(z) -. lastF /. 2.0,
        )
        // This cubie's layer counted from the turning face, 1 outermost.
        let layer = switch turn {
        | None => 0
        | Some({face: U}) => last - y + 1
        | Some({face: D}) => y + 1
        | Some({face: R}) => last - x + 1
        | Some({face: L}) => x + 1
        | Some({face: F}) => last - z + 1
        | Some({face: B}) => z + 1
        }
        let isTurnCubie = layer <= depth && layer > depth - width
        let lit = isTurnCubie && turn->Option.flatMap(turn => turn.highlight) == Some(true)
        let stickerRgb = colorKey => {
          let matte = stickerless
            ? mattePlasticColors->Option.flatMap(colors => colors->Dict.get(colorKey))
            : None
          let (r, g, b) = switch matte {
          | Some(matte) => (matte.r /. 255.0, matte.g /. 255.0, matte.b /. 255.0)
          | None =>
            hexToRgb(
              palette
              ->Dict.get(colorKey)
              ->Option.orElse(defaultStickerHex->Dict.get(colorKey))
              ->Option.getOr("#888"),
            )
          }
          lit
            ? (r +. (1.0 -. r) *. 0.35, g +. (1.0 -. g) *. 0.35, b +. (1.0 -. b) *. 0.35)
            : (r, g, b)
        }

        let (center, getAxes) = switch turn {
        | Some(turn) if turn.angle != 0.0 && isTurnCubie =>
          let axis: CubeGeometry.axis = switch turn.face {
          | R | L => X
          | U | D => Y
          | F | B => Z
          }
          let sign = switch turn.face {
          | R | U | F => -1.0
          | _ => 1.0
          }
          let rotAngle = sign *. turn.angle
          (
            rotateVec(center, axis, rotAngle),
            face => {
              let a = faceAxes(face)
              {
                u: rotateVec(a.u, axis, rotAngle),
                v: rotateVec(a.v, axis, rotAngle),
                n: rotateVec(a.n, axis, rotAngle),
              }
            },
          )
        | _ => (center, faceAxes)
        }
        let (cx, cy, cz) = center

        let exterior = [
          (y == last, U),
          (y == 0, D),
          (z == last, F),
          (z == 0, B),
          (x == last, R),
          (x == 0, L),
        ]
        if stickerless {
          // Solid colored plastic speedcube: rounded edges, rounded
          // corners, no black lines.
          let h = 0.495
          let r = 0.058
          exterior->Array.forEach(((outside, face)) =>
            if outside {
              let rgb = stickerRgb(getFaceletColor(cube, n, face, x, y, z))
              let a = getAxes(face)
              addBeveledFace(
                cx,
                cy,
                cz,
                a.u,
                a.v,
                a.n,
                h,
                r,
                rgb,
                0.0,
                getFaceSeams(face, x, y, z, n),
              )
            }
          )
        } else {
          // Stickered: a black beveled body and a sticker tile on each
          // exterior face.
          let hBody = 0.495
          let rBody = 0.058
          let hStk = 0.43
          let rStk = 0.045
          let eps = 0.005
          exterior->Array.forEach(((outside, face)) =>
            if outside {
              let a = getAxes(face)
              let seams = getFaceSeams(face, x, y, z, n)
              addBeveledFace(cx, cy, cz, a.u, a.v, a.n, hBody, rBody, darkPlastic, 0.0, seams)
              let rgb = stickerRgb(getFaceletColor(cube, n, face, x, y, z))
              addBeveledFace(
                cx,
                cy,
                cz,
                a.u,
                a.v,
                a.n,
                hStk,
                rStk,
                rgb,
                hBody -. hStk +. eps,
                allSeams,
              )
            }
          )
        }

        // Each cubie (surface and interior) needs its cut-facing plastic
        // faces. A turn exposes both sides of its cut, including moving and
        // stationary slabs.
        exterior->Array.forEach(((outside, face)) =>
          if !outside {
            let a = getAxes(face)
            addInteriorFace(center, a.u, a.v, a.n, getCapExtents(face, x, y, z, last))
          }
        )
      }
    }
  }

  let vertexCount = Array.length(posList) / 3
  {
    positions: Float32Array.fromArray(posList),
    normals: Float32Array.fromArray(normList),
    colors: Float32Array.fromArray(colList),
    occlusion: Float32Array.fromArray(occlusionList),
    indices: vertexCount > 65535
      ? fromUint32(Uint32Array.fromArray(idxList))
      : fromUint16(Uint16Array.fromArray(idxList)),
    vertexCount,
    indexCount: Array.length(idxList),
  }
}
