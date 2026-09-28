import type { CubeState, FaceKey } from '../cube/cubeAssembly'
import type { Axis } from '../cube/cubeGeometry'
import { builtinColorProfiles } from './profileSettings'
import {
  DEFAULT_STICKER_HEX,
  getFaceletColor,
  getFaceSeams,
  hexToRgb,
  rotateVec,
  type MeshData,
} from './cubeView3DState'

// Stickerless pieces are colored plastic. Use the built-in Matte capture
// palette rather than the brighter colors used to draw stickers and the net.
const mattePlasticColors = builtinColorProfiles().find(
  (profile) => profile.name === 'Matte',
)?.colors

export interface TurningLayer {
  face: FaceKey
  depth?: number
  // Layers turning together, ending at `depth`; 1 when omitted.
  width?: number
  angle: number // in radians
  // Lights up the layers, e.g. while a block is being picked.
  highlight?: boolean
}

interface CapExtents {
  uNeg: number
  uPos: number
  vNeg: number
  vPos: number
}

function getCapExtents(
  face: 'u' | 'd' | 'f' | 'b' | 'r' | 'l',
  x: number,
  y: number,
  z: number,
  last: number,
): CapExtents {
  const inner = 0.5
  const outer = 0.44

  switch (face) {
    case 'u':
      return {
        uNeg: x > 0 ? inner : outer,
        uPos: x < last ? inner : outer,
        vNeg: z < last ? inner : outer,
        vPos: z > 0 ? inner : outer,
      }
    case 'd':
      return {
        uNeg: x > 0 ? inner : outer,
        uPos: x < last ? inner : outer,
        vNeg: z > 0 ? inner : outer,
        vPos: z < last ? inner : outer,
      }
    case 'f':
      return {
        uNeg: x > 0 ? inner : outer,
        uPos: x < last ? inner : outer,
        vNeg: y > 0 ? inner : outer,
        vPos: y < last ? inner : outer,
      }
    case 'b':
      return {
        uNeg: x < last ? inner : outer,
        uPos: x > 0 ? inner : outer,
        vNeg: y > 0 ? inner : outer,
        vPos: y < last ? inner : outer,
      }
    case 'r':
      return {
        uNeg: z < last ? inner : outer,
        uPos: z > 0 ? inner : outer,
        vNeg: y > 0 ? inner : outer,
        vPos: y < last ? inner : outer,
      }
    case 'l':
      return {
        uNeg: z > 0 ? inner : outer,
        uPos: z < last ? inner : outer,
        vNeg: y > 0 ? inner : outer,
        vPos: y < last ? inner : outer,
      }
  }
}

export function buildCubeMesh(
  cube: CubeState,
  n: number,
  palette: Record<string, string> = DEFAULT_STICKER_HEX,
  stickerless = true,
  turn?: TurningLayer,
): MeshData {
  const last = n - 1
  const posList: number[] = []
  const normList: number[] = []
  const colList: number[] = []
  const occlusionList: number[] = []
  const idxList: number[] = []

  const darkPlastic: [number, number, number] = [0.11, 0.11, 0.12]

  function addTri(
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    n0: [number, number, number],
    n1: [number, number, number],
    n2: [number, number, number],
    col: [number, number, number],
    occlusion = 1,
  ) {
    const base = posList.length / 3
    posList.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2])
    normList.push(n0[0], n0[1], n0[2], n1[0], n1[1], n1[2], n2[0], n2[1], n2[2])
    colList.push(
      col[0],
      col[1],
      col[2],
      col[0],
      col[1],
      col[2],
      col[0],
      col[1],
      col[2],
    )
    idxList.push(base, base + 1, base + 2)
    occlusionList.push(occlusion, occlusion, occlusion)
  }

  function addInteriorFace(
    center: [number, number, number],
    u: [number, number, number],
    v: [number, number, number],
    normal: [number, number, number],
    extents: CapExtents,
  ) {
    const depth = 0.495
    const point = (a: number, b: number): [number, number, number] => {
      const uDist = a < 0 ? -extents.uNeg : extents.uPos
      const vDist = b < 0 ? -extents.vNeg : extents.vPos
      return [
        center[0] + uDist * u[0] + vDist * v[0] + depth * normal[0],
        center[1] + uDist * u[1] + vDist * v[1] + depth * normal[1],
        center[2] + uDist * u[2] + vDist * v[2] + depth * normal[2],
      ]
    }
    const bottomLeft = point(-1, -1)
    const bottomRight = point(1, -1)
    const topRight = point(1, 1)
    const topLeft = point(-1, 1)
    addTri(
      bottomLeft,
      bottomRight,
      topRight,
      normal,
      normal,
      normal,
      darkPlastic,
    )
    addTri(bottomLeft, topRight, topLeft, normal, normal, normal, darkPlastic)
  }

  // Generate a rounded, beveled face with smoothed normals
  function addBeveledFace(
    cx: number,
    cy: number,
    cz: number,
    uAxis: [number, number, number],
    vAxis: [number, number, number],
    nAxis: [number, number, number],
    H: number,
    r: number,
    col: [number, number, number],
    elevation = 0,
    seams: { top: boolean; bot: boolean; rt: boolean; lt: boolean } = {
      top: true,
      bot: true,
      rt: true,
      lt: true,
    },
  ) {
    const s = H - r
    const miter = r * 0.5 // outer edge and corner 45° bevel midpoint (H - r/2)
    const miterApex = r * (1 - 1 / Math.sqrt(6)) // spherical radius matching 45° edge chamfers
    const hNorm = H + elevation
    const zOuter = hNorm - r * 0.65
    const zSkirt = hNorm - 0.14
    const { top: seamTop, bot: seamBot, rt: seamRt, lt: seamLt } = seams

    function pt(u: number, v: number, n: number): [number, number, number] {
      return [
        cx + u * uAxis[0] + v * vAxis[0] + n * nAxis[0],
        cy + u * uAxis[1] + v * vAxis[1] + n * nAxis[1],
        cz + u * uAxis[2] + v * vAxis[2] + n * nAxis[2],
      ]
    }

    function norm(
      nu: number,
      nv: number,
      nn: number,
    ): [number, number, number] {
      const len = Math.hypot(nu, nv, nn) || 1
      return [
        (nu * uAxis[0] + nv * vAxis[0] + nn * nAxis[0]) / len,
        (nu * uAxis[1] + nv * vAxis[1] + nn * nAxis[1]) / len,
        (nu * uAxis[2] + nv * vAxis[2] + nn * nAxis[2]) / len,
      ]
    }

    // Inner 4 vertices of flat face
    const c0 = pt(-s, -s, hNorm),
      nc0 = norm(0, 0, 1)
    const c1 = pt(s, -s, hNorm),
      nc1 = norm(0, 0, 1)
    const c2 = pt(s, s, hNorm),
      nc2 = norm(0, 0, 1)
    const c3 = pt(-s, s, hNorm),
      nc3 = norm(0, 0, 1)

    // Edge outer vertices:
    // If internal seam: reaches H at depth zOuter
    // If outer cube edge: meets adjacent face of same cubie at 45° rounded miter
    const vTop = seamTop ? H : H - miter
    const zTop = seamTop ? zOuter : hNorm - miter
    const eTop0 = pt(-s, vTop, zTop),
      neTop0 = norm(0, 0.7, 0.7)
    const eTop1 = pt(s, vTop, zTop),
      neTop1 = norm(0, 0.7, 0.7)

    const vBot = seamBot ? -H : -(H - miter)
    const zBot = seamBot ? zOuter : hNorm - miter
    const eBot0 = pt(-s, vBot, zBot),
      neBot0 = norm(0, -0.7, 0.7)
    const eBot1 = pt(s, vBot, zBot),
      neBot1 = norm(0, -0.7, 0.7)

    const uRt = seamRt ? H : H - miter
    const zRt = seamRt ? zOuter : hNorm - miter
    const eRt0 = pt(uRt, -s, zRt),
      neRt0 = norm(0.7, 0, 0.7)
    const eRt1 = pt(uRt, s, zRt),
      neRt1 = norm(0.7, 0, 0.7)

    const uLt = seamLt ? -H : -(H - miter)
    const zLt = seamLt ? zOuter : hNorm - miter
    const eLt0 = pt(uLt, -s, zLt),
      neLt0 = norm(-0.7, 0, 0.7)
    const eLt1 = pt(uLt, s, zLt),
      neLt1 = norm(-0.7, 0, 0.7)

    // Corner vertices:
    // 1. Top-Right (TR)
    let crnTR: [number, number, number]
    let ncrnTR: [number, number, number]
    if (seamRt && seamTop) {
      crnTR = pt(H, H, zOuter)
      ncrnTR = norm(0.6, 0.6, 0.5)
    } else if (!seamRt && !seamTop) {
      crnTR = pt(H - miterApex, H - miterApex, hNorm - miterApex)
      ncrnTR = norm(0.57735, 0.57735, 0.57735)
    } else if (seamRt && !seamTop) {
      crnTR = pt(H, H - miter, hNorm - miter)
      ncrnTR = norm(0, 0.7, 0.7)
    } else {
      crnTR = pt(H - miter, H, hNorm - miter)
      ncrnTR = norm(0.7, 0, 0.7)
    }

    // 2. Top-Left (TL)
    let crnTL: [number, number, number]
    let ncrnTL: [number, number, number]
    if (seamLt && seamTop) {
      crnTL = pt(-H, H, zOuter)
      ncrnTL = norm(-0.6, 0.6, 0.5)
    } else if (!seamLt && !seamTop) {
      crnTL = pt(-(H - miterApex), H - miterApex, hNorm - miterApex)
      ncrnTL = norm(-0.57735, 0.57735, 0.57735)
    } else if (seamLt && !seamTop) {
      crnTL = pt(-H, H - miter, hNorm - miter)
      ncrnTL = norm(0, 0.7, 0.7)
    } else {
      crnTL = pt(-(H - miter), H, hNorm - miter)
      ncrnTL = norm(-0.7, 0, 0.7)
    }

    // 3. Bottom-Left (BL)
    let crnBL: [number, number, number]
    let ncrnBL: [number, number, number]
    if (seamLt && seamBot) {
      crnBL = pt(-H, -H, zOuter)
      ncrnBL = norm(-0.6, -0.6, 0.5)
    } else if (!seamLt && !seamBot) {
      crnBL = pt(-(H - miterApex), -(H - miterApex), hNorm - miterApex)
      ncrnBL = norm(-0.57735, -0.57735, 0.57735)
    } else if (seamLt && !seamBot) {
      crnBL = pt(-H, -(H - miter), hNorm - miter)
      ncrnBL = norm(0, -0.7, 0.7)
    } else {
      crnBL = pt(-(H - miter), -H, hNorm - miter)
      ncrnBL = norm(-0.7, 0, 0.7)
    }

    // 4. Bottom-Right (BR)
    let crnBR: [number, number, number]
    let ncrnBR: [number, number, number]
    if (seamRt && seamBot) {
      crnBR = pt(H, -H, zOuter)
      ncrnBR = norm(0.6, -0.6, 0.5)
    } else if (!seamRt && !seamBot) {
      crnBR = pt(H - miterApex, -(H - miterApex), hNorm - miterApex)
      ncrnBR = norm(0.57735, -0.57735, 0.57735)
    } else if (seamRt && !seamBot) {
      crnBR = pt(H, -(H - miter), hNorm - miter)
      ncrnBR = norm(0, -0.7, 0.7)
    } else {
      crnBR = pt(H - miter, -H, hNorm - miter)
      ncrnBR = norm(0.7, 0, 0.7)
    }

    // 1. Center flat region
    addTri(c0, c1, c2, nc0, nc1, nc2, col)
    addTri(c0, c2, c3, nc0, nc2, nc3, col)

    // 2. Edges
    addTri(c3, c2, eTop1, nc3, nc2, neTop1, col)
    addTri(c3, eTop1, eTop0, nc3, neTop1, neTop0, col)

    addTri(eBot0, eBot1, c1, neBot0, neBot1, nc1, col)
    addTri(eBot0, c1, c0, neBot0, nc1, nc0, col)

    addTri(c1, eRt0, eRt1, nc1, neRt0, neRt1, col)
    addTri(c1, eRt1, c2, nc1, neRt1, nc2, col)

    addTri(eLt0, c0, c3, neLt0, nc0, nc3, col)
    addTri(eLt0, c3, eLt1, neLt0, nc3, neLt1, col)

    // 3. Corner transitions
    if (!seamRt && !seamTop) {
      addTri(c2, eRt1, eTop1, nc2, neRt1, neTop1, col)
      addTri(eRt1, crnTR, eTop1, neRt1, ncrnTR, neTop1, col)
    } else {
      addTri(c2, eRt1, crnTR, nc2, neRt1, ncrnTR, col)
      addTri(c2, crnTR, eTop1, nc2, ncrnTR, neTop1, col)
    }

    if (!seamLt && !seamTop) {
      addTri(c3, eTop0, eLt1, nc3, neTop0, neLt1, col)
      addTri(eTop0, crnTL, eLt1, neTop0, ncrnTL, neLt1, col)
    } else {
      addTri(c3, eTop0, crnTL, nc3, neTop0, ncrnTL, col)
      addTri(c3, crnTL, eLt1, nc3, ncrnTL, neLt1, col)
    }

    if (!seamLt && !seamBot) {
      addTri(c0, eLt0, eBot0, nc0, neLt0, neBot0, col)
      addTri(eLt0, crnBL, eBot0, neLt0, ncrnBL, neBot0, col)
    } else {
      addTri(c0, eLt0, crnBL, nc0, neLt0, ncrnBL, col)
      addTri(c0, crnBL, eBot0, nc0, ncrnBL, neBot0, col)
    }

    if (!seamRt && !seamBot) {
      addTri(c1, eBot1, eRt0, nc1, neBot1, neRt0, col)
      addTri(eBot1, crnBR, eRt0, neBot1, ncrnBR, neRt0, col)
    } else {
      addTri(c1, eBot1, crnBR, nc1, neBot1, ncrnBR, col)
      addTri(c1, crnBR, eRt0, nc1, ncrnBR, neRt0, col)
    }

    // A triangle wound counter-clockwise as seen from `nOut`, so back-face
    // culling keeps it from that side.
    function addFacingTri(
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
      nOut: [number, number, number],
    ) {
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const facing =
        (e1[1] * e2[2] - e1[2] * e2[1]) * nOut[0] +
        (e1[2] * e2[0] - e1[0] * e2[2]) * nOut[1] +
        (e1[0] * e2[1] - e1[1] * e2[0]) * nOut[2]
      if (facing > 0) addTri(a, b, c, nOut, nOut, nOut, col, 0.58)
      else addTri(a, c, b, nOut, nOut, nOut, col, 0.58)
    }

    // A wall from surface points a-b straight down to the skirt depth, facing
    // out along the face-local direction (ou, ov).
    function addWall(
      a: [number, number, number],
      b: [number, number, number],
      ou: number,
      ov: number,
    ) {
      const sink = (p: [number, number, number]): [number, number, number] => {
        const k =
          (p[0] - cx) * nAxis[0] +
          (p[1] - cy) * nAxis[1] +
          (p[2] - cz) * nAxis[2] -
          zSkirt
        return [p[0] - k * nAxis[0], p[1] - k * nAxis[1], p[2] - k * nAxis[2]]
      }
      const nOut = norm(ou, ov, 0)
      addFacingTri(a, sink(a), sink(b), nOut)
      addFacingTri(a, sink(b), b, nOut)
    }

    // 4. Side skirts into internal seam grooves ONLY (matching cubie color)
    if (seamTop) {
      const sTop0 = pt(-s, H, zSkirt),
        nsTop = norm(0, 1, 0)
      const sTop1 = pt(s, H, zSkirt)
      addTri(eTop0, eTop1, sTop1, nsTop, nsTop, nsTop, col, 0.58)
      addTri(eTop0, sTop1, sTop0, nsTop, nsTop, nsTop, col, 0.58)
    }

    if (seamBot) {
      const sBot0 = pt(-s, -H, zSkirt),
        nsBot = norm(0, -1, 0)
      const sBot1 = pt(s, -H, zSkirt)
      addTri(eBot1, eBot0, sBot0, nsBot, nsBot, nsBot, col, 0.58)
      addTri(eBot1, sBot0, sBot1, nsBot, nsBot, nsBot, col, 0.58)
    }

    if (seamRt) {
      const sRt0 = pt(H, -s, zSkirt),
        nsRt = norm(1, 0, 0)
      const sRt1 = pt(H, s, zSkirt)
      addTri(eRt1, eRt0, sRt0, nsRt, nsRt, nsRt, col, 0.58)
      addTri(eRt1, sRt0, sRt1, nsRt, nsRt, nsRt, col, 0.58)
    }

    if (seamLt) {
      const sLt0 = pt(-H, -s, zSkirt),
        nsLt = norm(-1, 0, 0)
      const sLt1 = pt(-H, s, zSkirt)
      addTri(eLt0, eLt1, sLt1, nsLt, nsLt, nsLt, col, 0.58)
      addTri(eLt0, sLt1, sLt0, nsLt, nsLt, nsLt, col, 0.58)
    }

    // 5. The skirts span only the flat part of each side. Continue every seam
    // wall out to the corners, or the junctions of four cubies stay open and
    // the background shows through them.
    if (seamTop) {
      addWall(crnTL, eTop0, 0, 1)
      addWall(eTop1, crnTR, 0, 1)
    }
    if (seamBot) {
      addWall(crnBL, eBot0, 0, -1)
      addWall(eBot1, crnBR, 0, -1)
    }
    if (seamRt) {
      addWall(crnBR, eRt0, 1, 0)
      addWall(eRt1, crnTR, 1, 0)
    }
    if (seamLt) {
      addWall(crnBL, eLt0, -1, 0)
      addWall(eLt1, crnTL, -1, 0)
    }
  }

  // Face coordinate axes: [uAxis, vAxis, nAxis] with u x v = n
  const FACE_AXES: Record<
    string,
    {
      u: [number, number, number]
      v: [number, number, number]
      n: [number, number, number]
    }
  > = {
    u: { u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] },
    d: { u: [1, 0, 0], v: [0, 0, 1], n: [0, -1, 0] },
    f: { u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
    b: { u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, -1] },
    r: { u: [0, 0, -1], v: [0, 1, 0], n: [1, 0, 0] },
    l: { u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0] },
  }

  for (let z = 0; z < n; z++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        let cx = x - last / 2
        let cy = y - last / 2
        let cz = z - last / 2
        let getAxes = (faceKey: string) => FACE_AXES[faceKey]

        // This cubie's layer counted from the turning face, 1 outermost.
        const layer = !turn
          ? 0
          : turn.face === 'U'
            ? last - y + 1
            : turn.face === 'D'
              ? y + 1
              : turn.face === 'R'
                ? last - x + 1
                : turn.face === 'L'
                  ? x + 1
                  : turn.face === 'F'
                    ? last - z + 1
                    : z + 1
        const depth = turn?.depth ?? 1
        const isTurnCubie = layer <= depth && layer > depth - (turn?.width ?? 1)
        const lit = isTurnCubie && turn?.highlight === true
        const stickerRgb = (colorKey: string): [number, number, number] => {
          const matte = stickerless ? mattePlasticColors?.[colorKey] : undefined
          const rgb: [number, number, number] = matte
            ? [matte.r / 255, matte.g / 255, matte.b / 255]
            : hexToRgb(
                palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
              )
          return lit
            ? [
                rgb[0] + (1 - rgb[0]) * 0.35,
                rgb[1] + (1 - rgb[1]) * 0.35,
                rgb[2] + (1 - rgb[2]) * 0.35,
              ]
            : rgb
        }

        if (turn && turn.angle !== 0) {
          if (isTurnCubie) {
            const axis: Axis =
              turn.face === 'R' || turn.face === 'L'
                ? 'x'
                : turn.face === 'U' || turn.face === 'D'
                  ? 'y'
                  : 'z'
            const sign =
              turn.face === 'R' || turn.face === 'U' || turn.face === 'F'
                ? -1
                : 1
            const rotAngle = sign * turn.angle
            const rotated = rotateVec([cx, cy, cz], axis, rotAngle)
            cx = rotated[0]
            cy = rotated[1]
            cz = rotated[2]

            getAxes = (faceKey: string) => {
              const a = FACE_AXES[faceKey]
              return {
                u: rotateVec(a.u, axis, rotAngle),
                v: rotateVec(a.v, axis, rotAngle),
                n: rotateVec(a.n, axis, rotAngle),
              }
            }
          }
        }

        if (stickerless) {
          // Solid colored plastic speedcube: rounded edges, rounded corners, no black lines
          const H = 0.495
          const r = 0.058
          if (y === last) {
            const colorKey = getFaceletColor(cube, n, 'u', x, y, z)
            const rgb = stickerRgb(colorKey)
            const a = getAxes('u')
            const seams = getFaceSeams('u', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (y === 0) {
            const colorKey = getFaceletColor(cube, n, 'd', x, y, z)
            const rgb = stickerRgb(colorKey)
            const a = getAxes('d')
            const seams = getFaceSeams('d', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (z === last) {
            const colorKey = getFaceletColor(cube, n, 'f', x, y, z)
            const rgb = stickerRgb(colorKey)
            const a = getAxes('f')
            const seams = getFaceSeams('f', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (z === 0) {
            const colorKey = getFaceletColor(cube, n, 'b', x, y, z)
            const rgb = stickerRgb(colorKey)
            const a = getAxes('b')
            const seams = getFaceSeams('b', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (x === last) {
            const colorKey = getFaceletColor(cube, n, 'r', x, y, z)
            const rgb = stickerRgb(colorKey)
            const a = getAxes('r')
            const seams = getFaceSeams('r', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (x === 0) {
            const colorKey = getFaceletColor(cube, n, 'l', x, y, z)
            const rgb = stickerRgb(colorKey)
            const a = getAxes('l')
            const seams = getFaceSeams('l', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
        } else {
          // Stickered mode:
          // Draw black beveled body and sticker tile only on exterior faces
          const HBody = 0.495
          const rBody = 0.058
          const HStk = 0.43
          const rStk = 0.045
          const eps = 0.005

          const addFaceWithSticker = (
            faceKey: 'u' | 'd' | 'f' | 'b' | 'r' | 'l',
          ) => {
            const a = getAxes(faceKey)
            const seams = getFaceSeams(faceKey, x, y, z, n)
            // 1. Black beveled plastic cubie body
            addBeveledFace(
              cx,
              cy,
              cz,
              a.u,
              a.v,
              a.n,
              HBody,
              rBody,
              darkPlastic,
              0,
              seams,
            )
            // 2. Rounded sticker tile on exterior face
            const colorKey = getFaceletColor(cube, n, faceKey, x, y, z)
            const rgb = stickerRgb(colorKey)
            addBeveledFace(
              cx,
              cy,
              cz,
              a.u,
              a.v,
              a.n,
              HStk,
              rStk,
              rgb,
              HBody - HStk + eps,
            )
          }

          if (y === last) addFaceWithSticker('u')
          if (y === 0) addFaceWithSticker('d')
          if (z === last) addFaceWithSticker('f')
          if (z === 0) addFaceWithSticker('b')
          if (x === last) addFaceWithSticker('r')
          if (x === 0) addFaceWithSticker('l')
        }

        // Each cubie (surface and interior) needs its cut-facing plastic faces.
        // A turn exposes both sides of its cut, including moving and stationary slabs.
        const center: [number, number, number] = [cx, cy, cz]
        const cap = (face: 'u' | 'd' | 'f' | 'b' | 'r' | 'l') => {
          const axes = getAxes(face)
          const extents = getCapExtents(face, x, y, z, last)
          addInteriorFace(center, axes.u, axes.v, axes.n, extents)
        }
        if (y !== last) cap('u')
        if (y !== 0) cap('d')
        if (z !== last) cap('f')
        if (z !== 0) cap('b')
        if (x !== last) cap('r')
        if (x !== 0) cap('l')
      }
    }
  }

  const vertexCount = posList.length / 3
  const use32Bit = vertexCount > 65535
  const indices = use32Bit ? new Uint32Array(idxList) : new Uint16Array(idxList)

  return {
    positions: new Float32Array(posList),
    normals: new Float32Array(normList),
    colors: new Float32Array(colList),
    occlusion: new Float32Array(occlusionList),
    indices,
    vertexCount,
    indexCount: idxList.length,
  }
}
