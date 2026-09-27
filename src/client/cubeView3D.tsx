import { useEffect, useRef, useState } from 'preact/hooks'
import type { CubeState } from './cubeAssembly'

export const DEFAULT_STICKER_HEX: Record<string, string> = {
  W: '#f7f6f1',
  O: '#ff7a1a',
  G: '#1e9e57',
  R: '#cf2a3a',
  B: '#2459d6',
  Y: '#f2d21b',
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255
    const g = parseInt(clean[1] + clean[1], 16) / 255
    const b = parseInt(clean[2] + clean[2], 16) / 255
    return [r, g, b]
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255
  const g = parseInt(clean.substring(2, 4), 16) / 255
  const b = parseInt(clean.substring(4, 6), 16) / 255
  return [r, g, b]
}

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  indices: Uint16Array
  vertexCount: number
  indexCount: number
}

// Map facelet position to index in CubeState facelet arrays
export function getFaceletColor(
  cube: CubeState,
  n: number,
  face: 'u' | 'd' | 'f' | 'b' | 'r' | 'l',
  x: number,
  y: number,
  z: number,
): string {
  const last = n - 1
  switch (face) {
    case 'u':
      return cube.u[z * n + x] ?? 'W'
    case 'd':
      return cube.d[(last - z) * n + x] ?? 'Y'
    case 'f':
      return cube.f[(last - y) * n + x] ?? 'G'
    case 'b':
      return cube.b[(last - y) * n + (last - x)] ?? 'B'
    case 'r':
      return cube.r[(last - y) * n + (last - z)] ?? 'R'
    case 'l':
      return cube.l[(last - y) * n + z] ?? 'O'
  }
}

export function getFaceSeams(
  face: 'u' | 'd' | 'f' | 'b' | 'r' | 'l',
  x: number,
  y: number,
  z: number,
  n: number,
): { top: boolean; bot: boolean; rt: boolean; lt: boolean } {
  const last = n - 1
  switch (face) {
    case 'u':
      return { top: z > 0, bot: z < last, rt: x < last, lt: x > 0 }
    case 'd':
      return { top: z < last, bot: z > 0, rt: x < last, lt: x > 0 }
    case 'f':
      return { top: y < last, bot: y > 0, rt: x < last, lt: x > 0 }
    case 'b':
      return { top: y < last, bot: y > 0, rt: x > 0, lt: x < last }
    case 'r':
      return { top: y < last, bot: y > 0, rt: z > 0, lt: z < last }
    case 'l':
      return { top: y < last, bot: y > 0, rt: z < last, lt: z > 0 }
  }
}

export function buildCubeMesh(
  cube: CubeState,
  n: number,
  palette: Record<string, string> = DEFAULT_STICKER_HEX,
  stickerless = true,
): MeshData {
  const last = n - 1
  const posList: number[] = []
  const normList: number[] = []
  const colList: number[] = []
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
    const d = r * 0.4 // corner fillet for internal 4-way intersections
    const miter = r * 0.45 // outer edge and corner bevel miter
    const hNorm = H + elevation
    const zOuter = hNorm - r * 0.6
    const zSkirt = hNorm - 0.12
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
      crnTR = pt(H - d, H - d, zOuter)
      ncrnTR = norm(0.6, 0.6, 0.5)
    } else if (!seamRt && !seamTop) {
      crnTR = pt(H - miter, H - miter, hNorm - miter)
      ncrnTR = norm(0.577, 0.577, 0.577)
    } else if (seamRt && !seamTop) {
      crnTR = pt(H, H - miter, zOuter)
      ncrnTR = norm(0.5, 0.5, 0.7)
    } else {
      crnTR = pt(H - miter, H, zOuter)
      ncrnTR = norm(0.5, 0.5, 0.7)
    }

    // 2. Top-Left (TL)
    let crnTL: [number, number, number]
    let ncrnTL: [number, number, number]
    if (seamLt && seamTop) {
      crnTL = pt(-(H - d), H - d, zOuter)
      ncrnTL = norm(-0.6, 0.6, 0.5)
    } else if (!seamLt && !seamTop) {
      crnTL = pt(-(H - miter), H - miter, hNorm - miter)
      ncrnTL = norm(-0.577, 0.577, 0.577)
    } else if (seamLt && !seamTop) {
      crnTL = pt(-H, H - miter, zOuter)
      ncrnTL = norm(-0.5, 0.5, 0.7)
    } else {
      crnTL = pt(-(H - miter), H, zOuter)
      ncrnTL = norm(-0.5, 0.5, 0.7)
    }

    // 3. Bottom-Left (BL)
    let crnBL: [number, number, number]
    let ncrnBL: [number, number, number]
    if (seamLt && seamBot) {
      crnBL = pt(-(H - d), -(H - d), zOuter)
      ncrnBL = norm(-0.6, -0.6, 0.5)
    } else if (!seamLt && !seamBot) {
      crnBL = pt(-(H - miter), -(H - miter), hNorm - miter)
      ncrnBL = norm(-0.577, -0.577, 0.577)
    } else if (seamLt && !seamBot) {
      crnBL = pt(-H, -(H - miter), zOuter)
      ncrnBL = norm(-0.5, -0.5, 0.7)
    } else {
      crnBL = pt(-(H - miter), -H, zOuter)
      ncrnBL = norm(-0.5, -0.5, 0.7)
    }

    // 4. Bottom-Right (BR)
    let crnBR: [number, number, number]
    let ncrnBR: [number, number, number]
    if (seamRt && seamBot) {
      crnBR = pt(H - d, -(H - d), zOuter)
      ncrnBR = norm(0.6, -0.6, 0.5)
    } else if (!seamRt && !seamBot) {
      crnBR = pt(H - miter, -(H - miter), hNorm - miter)
      ncrnBR = norm(0.577, -0.577, 0.577)
    } else if (seamRt && !seamBot) {
      crnBR = pt(H, -(H - miter), zOuter)
      ncrnBR = norm(0.5, -0.5, 0.7)
    } else {
      crnBR = pt(H - miter, -H, zOuter)
      ncrnBR = norm(0.5, -0.5, 0.7)
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
    addTri(c2, eRt1, crnTR, nc2, neRt1, ncrnTR, col)
    addTri(c2, crnTR, eTop1, nc2, ncrnTR, neTop1, col)

    addTri(c3, eTop0, crnTL, nc3, neTop0, ncrnTL, col)
    addTri(c3, crnTL, eLt1, nc3, ncrnTL, neLt1, col)

    addTri(c0, eLt0, crnBL, nc0, neLt0, ncrnBL, col)
    addTri(c0, crnBL, eBot0, nc0, ncrnBL, neBot0, col)

    addTri(c1, eBot1, crnBR, nc1, neBot1, ncrnBR, col)
    addTri(c1, crnBR, eRt0, nc1, ncrnBR, neRt0, col)

    // 4. Side skirts into internal seam grooves ONLY (matching cubie color)
    if (seamTop) {
      const sTop0 = pt(-s, H, zSkirt),
        nsTop = norm(0, 1, 0)
      const sTop1 = pt(s, H, zSkirt)
      addTri(eTop0, eTop1, sTop1, nsTop, nsTop, nsTop, col)
      addTri(eTop0, sTop1, sTop0, nsTop, nsTop, nsTop, col)
    }

    if (seamBot) {
      const sBot0 = pt(-s, -H, zSkirt),
        nsBot = norm(0, -1, 0)
      const sBot1 = pt(s, -H, zSkirt)
      addTri(eBot1, eBot0, sBot0, nsBot, nsBot, nsBot, col)
      addTri(eBot1, sBot0, sBot1, nsBot, nsBot, nsBot, col)
    }

    if (seamRt) {
      const sRt0 = pt(H, -s, zSkirt),
        nsRt = norm(1, 0, 0)
      const sRt1 = pt(H, s, zSkirt)
      addTri(eRt1, eRt0, sRt0, nsRt, nsRt, nsRt, col)
      addTri(eRt1, sRt0, sRt1, nsRt, nsRt, nsRt, col)
    }

    if (seamLt) {
      const sLt0 = pt(-H, -s, zSkirt),
        nsLt = norm(-1, 0, 0)
      const sLt1 = pt(-H, s, zSkirt)
      addTri(eLt0, eLt1, sLt1, nsLt, nsLt, nsLt, col)
      addTri(eLt0, sLt1, sLt0, nsLt, nsLt, nsLt, col)
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
        // Only surface cubies
        if (
          x !== 0 &&
          x !== last &&
          y !== 0 &&
          y !== last &&
          z !== 0 &&
          z !== last
        ) {
          continue
        }

        const cx = x - last / 2
        const cy = y - last / 2
        const cz = z - last / 2

        if (stickerless) {
          // Solid colored plastic speedcube: rounded edges, rounded corners, no black lines
          const H = 0.495
          const r = 0.04
          if (y === last) {
            const colorKey = getFaceletColor(cube, n, 'u', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = FACE_AXES.u
            const seams = getFaceSeams('u', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (y === 0) {
            const colorKey = getFaceletColor(cube, n, 'd', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = FACE_AXES.d
            const seams = getFaceSeams('d', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (z === last) {
            const colorKey = getFaceletColor(cube, n, 'f', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = FACE_AXES.f
            const seams = getFaceSeams('f', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (z === 0) {
            const colorKey = getFaceletColor(cube, n, 'b', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = FACE_AXES.b
            const seams = getFaceSeams('b', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (x === last) {
            const colorKey = getFaceletColor(cube, n, 'r', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = FACE_AXES.r
            const seams = getFaceSeams('r', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (x === 0) {
            const colorKey = getFaceletColor(cube, n, 'l', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = FACE_AXES.l
            const seams = getFaceSeams('l', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
        } else {
          // Stickered mode:
          // 1. Black beveled plastic cubie body with reduced gap (0.010)
          const HBody = 0.495
          const rBody = 0.04
          for (const key of ['u', 'd', 'f', 'b', 'r', 'l'] as const) {
            const a = FACE_AXES[key]
            const seams = getFaceSeams(key, x, y, z, n)
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
          }

          // 2. Rounded sticker tiles on exterior faces
          const HStk = 0.445
          const rStk = 0.035
          const eps = 0.005

          if (y === last) {
            const colorKey = getFaceletColor(cube, n, 'u', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = FACE_AXES.u
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
          if (y === 0) {
            const colorKey = getFaceletColor(cube, n, 'd', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = FACE_AXES.d
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
          if (z === last) {
            const colorKey = getFaceletColor(cube, n, 'f', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = FACE_AXES.f
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
          if (z === 0) {
            const colorKey = getFaceletColor(cube, n, 'b', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = FACE_AXES.b
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
          if (x === last) {
            const colorKey = getFaceletColor(cube, n, 'r', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = FACE_AXES.r
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
          if (x === 0) {
            const colorKey = getFaceletColor(cube, n, 'l', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = FACE_AXES.l
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
        }
      }
    }
  }

  return {
    positions: new Float32Array(posList),
    normals: new Float32Array(normList),
    colors: new Float32Array(colList),
    indices: new Uint16Array(idxList),
    vertexCount: posList.length / 3,
    indexCount: idxList.length,
  }
}

// 4x4 matrix utilities
export function mat4Create(): Float32Array {
  const out = new Float32Array(16)
  out[0] = 1
  out[5] = 1
  out[10] = 1
  out[15] = 1
  return out
}

export function mat4Multiply(
  out: Float32Array,
  a: Float32Array,
  b: Float32Array,
): Float32Array {
  const a00 = a[0],
    a01 = a[1],
    a02 = a[2],
    a03 = a[3]
  const a10 = a[4],
    a11 = a[5],
    a12 = a[6],
    a13 = a[7]
  const a20 = a[8],
    a21 = a[9],
    a22 = a[10],
    a23 = a[11]
  const a30 = a[12],
    a31 = a[13],
    a32 = a[14],
    a33 = a[15]

  let b0 = b[0],
    b1 = b[1],
    b2 = b[2],
    b3 = b[3]
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  b0 = b[4]
  b1 = b[5]
  b2 = b[6]
  b3 = b[7]
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  b0 = b[8]
  b1 = b[9]
  b2 = b[10]
  b3 = b[11]
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  b0 = b[12]
  b1 = b[13]
  b2 = b[14]
  b3 = b[15]
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33

  return out
}

export function mat4Perspective(
  out: Float32Array,
  fovyRad: number,
  aspect: number,
  near: number,
  far: number,
): Float32Array {
  const f = 1.0 / Math.tan(fovyRad / 2)
  const nf = 1 / (near - far)

  out[0] = f / aspect
  out[1] = 0
  out[2] = 0
  out[3] = 0

  out[4] = 0
  out[5] = f
  out[6] = 0
  out[7] = 0

  out[8] = 0
  out[9] = 0
  out[10] = (far + near) * nf
  out[11] = -1

  out[12] = 0
  out[13] = 0
  out[14] = 2 * far * near * nf
  out[15] = 0

  return out
}

export function mat4RotateX(
  out: Float32Array,
  a: Float32Array,
  rad: number,
): Float32Array {
  const s = Math.sin(rad)
  const c = Math.cos(rad)
  const a10 = a[4],
    a11 = a[5],
    a12 = a[6],
    a13 = a[7]
  const a20 = a[8],
    a21 = a[9],
    a22 = a[10],
    a23 = a[11]

  if (a !== out) {
    out[0] = a[0]
    out[1] = a[1]
    out[2] = a[2]
    out[3] = a[3]
    out[12] = a[12]
    out[13] = a[13]
    out[14] = a[14]
    out[15] = a[15]
  }

  out[4] = a10 * c + a20 * s
  out[5] = a11 * c + a21 * s
  out[6] = a12 * c + a22 * s
  out[7] = a13 * c + a23 * s
  out[8] = a20 * c - a10 * s
  out[9] = a21 * c - a11 * s
  out[10] = a22 * c - a12 * s
  out[11] = a23 * c - a13 * s
  return out
}

export function mat4RotateY(
  out: Float32Array,
  a: Float32Array,
  rad: number,
): Float32Array {
  const s = Math.sin(rad)
  const c = Math.cos(rad)
  const a00 = a[0],
    a01 = a[1],
    a02 = a[2],
    a03 = a[3]
  const a20 = a[8],
    a21 = a[9],
    a22 = a[10],
    a23 = a[11]

  if (a !== out) {
    out[4] = a[4]
    out[5] = a[5]
    out[6] = a[6]
    out[7] = a[7]
    out[12] = a[12]
    out[13] = a[13]
    out[14] = a[14]
    out[15] = a[15]
  }

  out[0] = a00 * c - a20 * s
  out[1] = a01 * c - a21 * s
  out[2] = a02 * c - a22 * s
  out[3] = a03 * c - a23 * s
  out[8] = a00 * s + a20 * c
  out[9] = a01 * s + a21 * c
  out[10] = a02 * s + a22 * c
  out[11] = a03 * s + a23 * c
  return out
}

export function mat4Translate(
  out: Float32Array,
  a: Float32Array,
  v: [number, number, number],
): Float32Array {
  const x = v[0],
    y = v[1],
    z = v[2]
  if (a === out) {
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12]
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13]
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14]
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15]
  } else {
    out[0] = a[0]
    out[1] = a[1]
    out[2] = a[2]
    out[3] = a[3]
    out[4] = a[4]
    out[5] = a[5]
    out[6] = a[6]
    out[7] = a[7]
    out[8] = a[8]
    out[9] = a[9]
    out[10] = a[10]
    out[11] = a[11]
    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12]
    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13]
    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14]
    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15]
  }
  return out
}

const VS_SOURCE = `
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec3 a_color;

uniform mat4 u_mvp;
uniform mat4 u_model;

varying vec3 v_normal;
varying vec3 v_color;
varying vec3 v_pos;

void main() {
  v_color = a_color;
  v_normal = normalize(mat3(u_model[0].xyz, u_model[1].xyz, u_model[2].xyz) * a_normal);
  v_pos = (u_model * vec4(a_position, 1.0)).xyz;
  gl_Position = u_mvp * vec4(a_position, 1.0);
}
`

const FS_SOURCE = `
precision mediump float;

varying vec3 v_normal;
varying vec3 v_color;
varying vec3 v_pos;

uniform vec3 u_lightDir1;
uniform vec3 u_lightDir2;
uniform vec3 u_cameraPos;

void main() {
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_cameraPos - v_pos);

  // Key light: upper-right-front
  vec3 L1 = normalize(u_lightDir1);
  float diff1 = max(dot(N, L1), 0.0);
  vec3 H1 = normalize(L1 + V);
  float spec1 = pow(max(dot(N, H1), 0.0), 24.0) * 0.28;

  // Fill light: lower-left-rear
  vec3 L2 = normalize(u_lightDir2);
  float diff2 = max(dot(N, L2), 0.0) * 0.35;

  float ambient = 0.42;
  vec3 lit = v_color * (ambient + diff1 * 0.65 + diff2) + vec3(spec1);
  gl_FragColor = vec4(lit, 1.0);
}
`

function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function initProgram(gl: WebGLRenderingContext): WebGLProgram | null {
  const vs = createShader(gl, gl.VERTEX_SHADER, VS_SOURCE)
  const fs = createShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE)
  if (!vs || !fs) return null
  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

export interface CubeView3DProps {
  cube: CubeState
  puzzleSize: number
  palette?: Record<string, string>
  stickerless?: boolean
  onClose?: () => void
}

export function CubeView3D({
  cube,
  puzzleSize,
  palette = DEFAULT_STICKER_HEX,
  stickerless = true,
}: CubeView3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [pitch, setPitch] = useState<number>(0.42) // ~24 deg
  const [yaw, setYaw] = useState<number>(-0.62) // ~-35 deg
  const [zoom, setZoom] = useState<number>(puzzleSize * 2.8)
  const [isRotating, setIsRotating] = useState<boolean>(false)
  const [isSupported, setIsSupported] = useState<boolean>(true)
  const [isStickerless, setIsStickerless] = useState<boolean>(stickerless)

  const isDraggingRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const animFrameRef = useRef<number | null>(null)

  // Keep state accessible to render loop
  const stateRef = useRef({ pitch, yaw, zoom, isRotating })
  stateRef.current = { pitch, yaw, zoom, isRotating }

  // Reset to isometric view
  const resetView = () => {
    setPitch(0.42)
    setYaw(-0.62)
    setZoom(puzzleSize * 2.8)
  }

  // Preset face views
  const setPreset = (targetPitch: number, targetYaw: number) => {
    setPitch(targetPitch)
    setYaw(targetYaw)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', { antialias: true, alpha: false })
    if (!gl) {
      setIsSupported(false)
      return
    }

    const program = initProgram(gl)
    if (!program) {
      setIsSupported(false)
      return
    }

    gl.useProgram(program)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    gl.clearColor(0.08, 0.08, 0.1, 1.0)

    // Build geometry
    const mesh = buildCubeMesh(cube, puzzleSize, palette, isStickerless)

    const posBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW)

    const normBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW)

    const colBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW)

    const idxBuf = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)

    const aPos = gl.getAttribLocation(program, 'a_position')
    const aNorm = gl.getAttribLocation(program, 'a_normal')
    const aCol = gl.getAttribLocation(program, 'a_color')

    const uMvp = gl.getUniformLocation(program, 'u_mvp')
    const uModel = gl.getUniformLocation(program, 'u_model')
    const uLight1 = gl.getUniformLocation(program, 'u_lightDir1')
    const uLight2 = gl.getUniformLocation(program, 'u_lightDir2')
    const uCameraPos = gl.getUniformLocation(program, 'u_cameraPos')

    gl.uniform3f(uLight1, 1.5, 2.5, 2.0)
    gl.uniform3f(uLight2, -2.0, -1.0, -2.0)

    const render = () => {
      if (stateRef.current.isRotating) {
        setYaw((prev) => prev + 0.008)
      }

      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const width = Math.floor(rect.width * dpr)
      const height = Math.floor(rect.height * dpr)

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width || 400
        canvas.height = height || 400
        gl.viewport(0, 0, canvas.width, canvas.height)
      }

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

      const aspect = canvas.width / (canvas.height || 1)
      const proj = mat4Perspective(
        mat4Create(),
        (45 * Math.PI) / 180,
        aspect,
        0.1,
        100.0,
      )

      // Camera view matrix: translation back by zoom
      const currentZoom = stateRef.current.zoom
      const view = mat4Translate(mat4Create(), mat4Create(), [
        0,
        0,
        -currentZoom,
      ])

      // Model matrix: pitch and yaw rotations
      const model = mat4Create()
      mat4RotateX(model, model, stateRef.current.pitch)
      mat4RotateY(model, model, stateRef.current.yaw)

      // MVP = Proj * View * Model
      const mvp = mat4Create()
      const viewProj = mat4Create()
      mat4Multiply(viewProj, proj, view)
      mat4Multiply(mvp, viewProj, model)

      gl.uniformMatrix4fv(uMvp, false, mvp)
      gl.uniformMatrix4fv(uModel, false, model)
      gl.uniform3f(uCameraPos, 0, 0, currentZoom)

      // Bind attributes
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0)
      gl.enableVertexAttribArray(aPos)

      gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
      gl.vertexAttribPointer(aNorm, 3, gl.FLOAT, false, 0, 0)
      gl.enableVertexAttribArray(aNorm)

      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf)
      gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0)
      gl.enableVertexAttribArray(aCol)

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0)

      animFrameRef.current = requestAnimationFrame(render)
    }

    animFrameRef.current = requestAnimationFrame(render)

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }
      gl.deleteBuffer(posBuf)
      gl.deleteBuffer(normBuf)
      gl.deleteBuffer(colBuf)
      gl.deleteBuffer(idxBuf)
      gl.deleteProgram(program)
    }
  }, [cube, puzzleSize, palette, isStickerless])

  const handlePointerDown = (e: PointerEvent) => {
    isDraggingRef.current = true
    lastPointerRef.current = { x: e.clientX, y: e.clientY }
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const handlePointerMove = (e: PointerEvent) => {
    if (!isDraggingRef.current) return
    const dx = e.clientX - lastPointerRef.current.x
    const dy = e.clientY - lastPointerRef.current.y
    lastPointerRef.current = { x: e.clientX, y: e.clientY }

    const speed = 0.008
    setYaw((prev) => prev + dx * speed)
    setPitch((prev) => {
      const next = prev + dy * speed
      const limit = Math.PI / 2 - 0.05
      return Math.max(-limit, Math.min(limit, next))
    })
  }

  const handlePointerUp = (e: PointerEvent) => {
    isDraggingRef.current = false
    try {
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      // Ignore if pointer capture release fails
    }
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const zoomDelta = e.deltaY * 0.01
    setZoom((prev) => {
      const minZ = puzzleSize * 1.5
      const maxZ = puzzleSize * 6.0
      return Math.max(minZ, Math.min(maxZ, prev + zoomDelta))
    })
  }

  const limit = Math.PI / 2 - 0.05
  const step = 0.2

  const tiltUp = () => setPitch((p) => Math.min(limit, p + step))
  const tiltDown = () => setPitch((p) => Math.max(-limit, p - step))
  const rotateLeft = () => setYaw((y) => y + step)
  const rotateRight = () => setYaw((y) => y - step)

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        tiltUp()
        break
      case 'ArrowDown':
        e.preventDefault()
        tiltDown()
        break
      case 'ArrowLeft':
        e.preventDefault()
        rotateLeft()
        break
      case 'ArrowRight':
        e.preventDefault()
        rotateRight()
        break
      case 'u':
      case 'U':
        setPreset(Math.PI / 2 - 0.05, 0)
        break
      case 'd':
      case 'D':
        setPreset(-Math.PI / 2 + 0.05, 0)
        break
      case 'f':
      case 'F':
        setPreset(0, 0)
        break
      case 'b':
      case 'B':
        setPreset(0, Math.PI)
        break
      case 'l':
      case 'L':
        setPreset(0, Math.PI / 2)
        break
      case 'r':
      case 'R':
        setPreset(0, -Math.PI / 2)
        break
    }
  }

  return (
    <div class="cube-3d-container">
      {!isSupported ? (
        <div class="cube-3d-unsupported">
          <p>WebGL is not available in your browser.</p>
        </div>
      ) : (
        <>
          <div
            class="cube-3d-canvas-wrap"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            role="region"
            aria-label="3D Rubik's cube interactive canvas"
          >
            <canvas
              ref={canvasRef}
              class="cube-3d-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
              aria-label="Interactive 3D Rubik's Cube Viewer"
            />
            <div class="cube-3d-hint">
              Drag or use arrow keys &bull; Scroll to zoom
            </div>
          </div>
          <div class="cube-3d-toolbar">
            <div class="cube-3d-section">
              <span class="cube-3d-label">Faces:</span>
              <div class="cube-3d-presets">
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(Math.PI / 2 - 0.05, 0)}
                  title="Up face"
                >
                  Up (U)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(-Math.PI / 2 + 0.05, 0)}
                  title="Down face"
                >
                  Down (D)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(0, 0)}
                  title="Front face"
                >
                  Front (F)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(0, Math.PI)}
                  title="Back face"
                >
                  Back (B)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(0, Math.PI / 2)}
                  title="Left face"
                >
                  Left (L)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={() => setPreset(0, -Math.PI / 2)}
                  title="Right face"
                >
                  Right (R)
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={resetView}
                  title="Reset to Isometric view"
                >
                  Isometric
                </button>
              </div>
            </div>

            <div class="cube-3d-section">
              <span class="cube-3d-label">Tilt / Turn:</span>
              <div class="cube-3d-presets">
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={tiltUp}
                  title="Tilt Up"
                  aria-label="Tilt Up"
                >
                  ▲ Up
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={tiltDown}
                  title="Tilt Down"
                  aria-label="Tilt Down"
                >
                  ▼ Down
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={rotateLeft}
                  title="Rotate Left"
                  aria-label="Rotate Left"
                >
                  ◀ Left
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={rotateRight}
                  title="Rotate Right"
                  aria-label="Rotate Right"
                >
                  ▶ Right
                </button>
              </div>
            </div>

            <div class="cube-3d-actions">
              <button
                type="button"
                class="cube-3d-btn"
                onClick={() => setIsStickerless((v) => !v)}
                title="Toggle between stickerless and stickered appearance"
              >
                {isStickerless ? 'Stickerless' : 'Stickered'}
              </button>
              <button
                type="button"
                class={`cube-3d-btn ${isRotating ? 'cube-3d-btn-active' : ''}`}
                onClick={() => setIsRotating((v) => !v)}
              >
                {isRotating ? 'Pause' : 'Auto-rotate'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
