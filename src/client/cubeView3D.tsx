import { useEffect, useRef, useState } from 'preact/hooks'
import { createShadowRenderer } from './cubeShadow'
import {
  clampZoom,
  gestureAfterPointerUp,
  gestureForPointerDown,
  gestureWhenSwipeTurnsNothing,
  pickCubeSurface,
  pickSwipeLayer,
  releasedQuarterTurns,
  swipeLayerAngle,
  twoFingerLock,
  twoFingerMotion,
  wheelGesture,
  type CubeGesture,
  type TwoFingerLock,
  type CubeSurfaceHit,
  type CubeGestureCamera,
  type SwipeLayer,
} from './cubeGesture'
import { stepDragInertia } from './dragInertia'
import { magneticEase, playTurnClick, turnClickGain } from './turnFeel'
import {
  AUTO_ROTATE_COOKIE,
  SOUND_COOKIE,
  STICKERLESS_COOKIE,
  preferenceCookie,
  readPreference,
} from './preferences'
import type { CubeState, FaceKey } from '../cube/cubeAssembly'
import { turnFace, type Faces, type Axis } from '../cube/cubeGeometry'

export const DEFAULT_STICKER_HEX: Record<string, string> = {
  W: '#f7f6f1',
  O: '#ff7a1a',
  G: '#1e9e57',
  R: '#cf2a3a',
  B: '#2459d6',
  Y: '#f2d21b',
}

const AUTO_ROTATE_RESUME_DELAY_MS = 1500
const AUTO_ROTATE_RADIANS_PER_MS = 0.008 / (1000 / 60)

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
  occlusion: Float32Array
  indices: Uint16Array | Uint32Array
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

// Compute default camera zoom: sublinear scaling so larger cubes (5x5, 6x6, 7x7) scale less and stay prominent
export function getDefaultZoom(puzzleSize: number): number {
  return 3.0 + puzzleSize * 1.8
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

export function rotateVec(
  v: [number, number, number],
  axis: Axis,
  angle: number,
): [number, number, number] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const [x, y, z] = v
  switch (axis) {
    case 'x':
      return [x, y * cos - z * sin, y * sin + z * cos]
    case 'y':
      return [x * cos + z * sin, y, -x * sin + z * cos]
    case 'z':
      return [x * cos - y * sin, x * sin + y * cos, z]
  }
}

export function cubeStateToFaces(cube: CubeState, n: number): Faces {
  const getGrid = (arr: string[]): string[][] =>
    Array.from({ length: n }, (_, r) => arr.slice(r * n, (r + 1) * n))
  return {
    U: getGrid(cube.u),
    R: getGrid(cube.r),
    F: getGrid(cube.f),
    D: getGrid(cube.d),
    L: getGrid(cube.l),
    B: getGrid(cube.b),
  }
}

export function facesToCubeState(faces: Faces): CubeState {
  return {
    u: faces.U.flat(),
    r: faces.R.flat(),
    f: faces.F.flat(),
    d: faces.D.flat(),
    l: faces.L.flat(),
    b: faces.B.flat(),
  }
}

export function applyCubeMove(
  cube: CubeState,
  n: number,
  face: FaceKey,
  quarterTurns = 1,
): CubeState {
  const faces = cubeStateToFaces(cube, n)
  const turned = turnFace(faces, face, quarterTurns)
  return facesToCubeState(turned)
}

export function applyCubeLayerMove(
  cube: CubeState,
  n: number,
  face: FaceKey,
  depth: number,
  quarterTurns = 1,
): CubeState {
  if (depth < 1 || depth > n) return cube
  if (depth === 1) return applyCubeMove(cube, n, face, quarterTurns)
  const faces = cubeStateToFaces(cube, n)
  const throughLayer = turnFace(faces, face, quarterTurns, depth)
  return facesToCubeState(
    turnFace(throughLayer, face, -quarterTurns, depth - 1),
  )
}

export interface CubeTurn {
  face: FaceKey
  depth: number
  turns: number
}

export function formatCubeTurn({ face, depth, turns }: CubeTurn): string {
  return `${depth > 1 ? depth : ''}${face}${Math.abs(turns) === 2 ? '2' : turns < 0 ? "'" : ''}`
}

// Adds a finished turn to the history as its shortest form. A turn that
// reverses the last one, like swiping a layer back, undoes it instead.
export function recordTurn(moves: CubeTurn[], turn: CubeTurn): CubeTurn[] {
  const quarter = ((turn.turns % 4) + 4) % 4
  if (quarter === 0) return moves
  const turns = quarter === 3 ? -1 : quarter
  const last = moves.at(-1)
  if (
    last &&
    last.face === turn.face &&
    last.depth === turn.depth &&
    (last.turns + turns) % 4 === 0
  )
    return moves.slice(0, -1)
  return [...moves, { face: turn.face, depth: turn.depth, turns }]
}

const SCRAMBLE_FACES: FaceKey[] = ['U', 'D', 'L', 'R', 'F', 'B']
const SCRAMBLE_LENGTHS = [11, 20, 40, 60, 80, 100]

function turnAxis(face: FaceKey): 'x' | 'y' | 'z' {
  return face === 'R' || face === 'L'
    ? 'x'
    : face === 'U' || face === 'D'
      ? 'y'
      : 'z'
}

export function generateScrambleMoves(size: number): CubeTurn[] {
  const length = SCRAMBLE_LENGTHS[size - 2] ?? 20
  // Odd cubes keep the exact middle slice fixed during a scramble.
  const maxDepth = Math.floor(size / 2)
  const moves: CubeTurn[] = []
  let lastAxis: 'x' | 'y' | 'z' | null = null
  for (let i = 0; i < length; i++) {
    const allowed = SCRAMBLE_FACES.filter((f) => turnAxis(f) !== lastAxis)
    const face = allowed[Math.floor(Math.random() * allowed.length)]
    lastAxis = turnAxis(face)
    const turns = [1, -1, 2][Math.floor(Math.random() * 3)]
    const depth =
      i === 0 && size >= 4 ? 2 : 1 + Math.floor(Math.random() * maxDepth)
    moves.push({ face, depth, turns })
  }
  return moves
}

export interface TurningLayer {
  face: FaceKey
  depth?: number
  angle: number // in radians
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
  ) {
    const depth = 0.495
    // The cut face sits below the rounded outer shell. A full-width square
    // would poke out at the rounded corners, especially on a 2x2.
    const half = 0.435
    const point = (a: number, b: number): [number, number, number] => [
      center[0] + half * (a * u[0] + b * v[0]) + depth * normal[0],
      center[1] + half * (a * u[1] + b * v[1]) + depth * normal[1],
      center[2] + half * (a * u[2] + b * v[2]) + depth * normal[2],
    ]
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

        let cx = x - last / 2
        let cy = y - last / 2
        let cz = z - last / 2
        let getAxes = (faceKey: string) => FACE_AXES[faceKey]

        if (turn && turn.angle !== 0) {
          const depth = turn.depth ?? 1
          const isTurnCubie =
            (turn.face === 'U' && y === last - depth + 1) ||
            (turn.face === 'D' && y === depth - 1) ||
            (turn.face === 'R' && x === last - depth + 1) ||
            (turn.face === 'L' && x === depth - 1) ||
            (turn.face === 'F' && z === last - depth + 1) ||
            (turn.face === 'B' && z === depth - 1)

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
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = getAxes('u')
            const seams = getFaceSeams('u', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (y === 0) {
            const colorKey = getFaceletColor(cube, n, 'd', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = getAxes('d')
            const seams = getFaceSeams('d', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (z === last) {
            const colorKey = getFaceletColor(cube, n, 'f', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = getAxes('f')
            const seams = getFaceSeams('f', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (z === 0) {
            const colorKey = getFaceletColor(cube, n, 'b', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = getAxes('b')
            const seams = getFaceSeams('b', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (x === last) {
            const colorKey = getFaceletColor(cube, n, 'r', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
            const a = getAxes('r')
            const seams = getFaceSeams('r', x, y, z, n)
            addBeveledFace(cx, cy, cz, a.u, a.v, a.n, H, r, rgb, 0, seams)
          }
          if (x === 0) {
            const colorKey = getFaceletColor(cube, n, 'l', x, y, z)
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
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
            const rgb = hexToRgb(
              palette[colorKey] ?? DEFAULT_STICKER_HEX[colorKey] ?? '#888',
            )
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

        // Each visible cubie needs its hidden plastic faces too. A turn exposes
        // both sides of its cut, including the backs of the moving pieces.
        const center: [number, number, number] = [cx, cy, cz]
        const cap = (face: 'u' | 'd' | 'f' | 'b' | 'r' | 'l') => {
          const axes = getAxes(face)
          addInteriorFace(center, axes.u, axes.v, axes.n)
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

  // Surface cubies alone leave a hollow opening behind inner-slice cuts.
  // Keep this shield fixed while the outer pieces turn, and build it in both
  // static and animated meshes so their vertex counts remain identical.
  if (n >= 4) {
    const radius = n / 2 - 1.02
    const latitudeSteps = 8
    const longitudeSteps = 16
    const point = (
      latitude: number,
      longitude: number,
    ): [number, number, number] => {
      const phi = (Math.PI * latitude) / latitudeSteps
      const theta = (2 * Math.PI * longitude) / longitudeSteps
      return [
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta),
      ]
    }
    const addCoreTri = (
      a: [number, number, number],
      b: [number, number, number],
      c: [number, number, number],
    ) => {
      const normal = (
        p: [number, number, number],
      ): [number, number, number] => [
        p[0] / radius,
        p[1] / radius,
        p[2] / radius,
      ]
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const facing =
        (ab[1] * ac[2] - ab[2] * ac[1]) * a[0] +
        (ab[2] * ac[0] - ab[0] * ac[2]) * a[1] +
        (ab[0] * ac[1] - ab[1] * ac[0]) * a[2]
      if (facing >= 0)
        addTri(a, b, c, normal(a), normal(b), normal(c), darkPlastic)
      else addTri(a, c, b, normal(a), normal(c), normal(b), darkPlastic)
    }
    for (let latitude = 0; latitude < latitudeSteps; latitude++) {
      for (let longitude = 0; longitude < longitudeSteps; longitude++) {
        const upperLeft = point(latitude, longitude)
        const upperRight = point(latitude, longitude + 1)
        const lowerLeft = point(latitude + 1, longitude)
        const lowerRight = point(latitude + 1, longitude + 1)
        if (latitude > 0) addCoreTri(upperLeft, lowerLeft, upperRight)
        if (latitude < latitudeSteps - 1)
          addCoreTri(upperRight, lowerLeft, lowerRight)
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
attribute float a_occlusion;

uniform mat4 u_mvp;
uniform mat4 u_model;

varying vec3 v_normal;
varying vec3 v_color;
varying vec3 v_pos;
varying float v_occlusion;

void main() {
  v_color = a_color;
  v_occlusion = a_occlusion;
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
varying float v_occlusion;

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
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 lit = v_color * (ambient + diff1 * 0.65 + diff2) * v_occlusion;
  lit += vec3(spec1 * v_occlusion) + v_color * fresnel * 0.10;
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
  initialCube?: CubeState
  initialMoves?: CubeTurn[]
  onTurnStateChange?: (cube: CubeState, moves: CubeTurn[]) => void
  puzzleSize: number
  palette?: Record<string, string>
  stickerless?: boolean
  onClose?: () => void
}

export function CubeView3D({
  cube,
  initialCube = cube,
  initialMoves = [],
  onTurnStateChange,
  puzzleSize,
  palette = DEFAULT_STICKER_HEX,
  stickerless = true,
}: CubeView3DProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [currentCube, setCurrentCube] = useState<CubeState>(initialCube)
  const [moves, setMoves] = useState<CubeTurn[]>(initialMoves)
  const [pitch, setPitch] = useState<number>(0.42) // ~24 deg
  const [yaw, setYaw] = useState<number>(-0.62) // ~-35 deg
  const [zoom, setZoom] = useState<number>(getDefaultZoom(puzzleSize))
  const [isRotating, setIsRotating] = useState<boolean>(() =>
    readPreference(document.cookie, AUTO_ROTATE_COOKIE),
  )
  const [isSupported, setIsSupported] = useState<boolean>(true)
  const [isStickerless, setIsStickerless] = useState<boolean>(() =>
    readPreference(document.cookie, STICKERLESS_COOKIE, stickerless),
  )
  const [isScrambling, setIsScrambling] = useState<boolean>(false)
  const [isTurning, setIsTurning] = useState(false)

  const currentCubeRef = useRef<CubeState>(initialCube)
  currentCubeRef.current = currentCube
  const movesRef = useRef(initialMoves)
  movesRef.current = moves
  const onTurnStateChangeRef = useRef(onTurnStateChange)
  onTurnStateChangeRef.current = onTurnStateChange
  const sourceCubeRef = useRef(cube)

  useEffect(() => {
    if (sourceCubeRef.current === cube) return
    sourceCubeRef.current = cube
    setCurrentCube(cube)
    currentCubeRef.current = cube
    movesRef.current = []
    setMoves([])
    turnQueueRef.current = []
    currentTurnRef.current = null
    dragTurnRef.current = null
    setIsScrambling(false)
    setIsTurning(false)
    forceUpdateMeshRef.current = true
  }, [cube])

  const turnQueueRef = useRef<
    Array<{
      face: FaceKey
      depth?: number
      turns: number
      from?: number
      duration?: number
      undo?: boolean
    }>
  >([])
  const currentTurnRef = useRef<{
    face: FaceKey
    depth?: number
    turns: number
    // A released drag settles from where the finger left the layer.
    from?: number
    startTime: number
    duration: number
    undo?: boolean
  } | null>(null)
  // The layer a sticker drag is turning, following the finger until release.
  const dragTurnRef = useRef<{
    layer: SwipeLayer
    angle: number
    velocity: number
    time: number
    drawn: number | null
  } | null>(null)
  const forceUpdateMeshRef = useRef(false)

  useEffect(() => {
    document.cookie = preferenceCookie(AUTO_ROTATE_COOKIE, isRotating)
  }, [isRotating])
  useEffect(() => {
    document.cookie = preferenceCookie(STICKERLESS_COOKIE, isStickerless)
  }, [isStickerless])

  const isDraggingRef = useRef(false)
  const gestureRef = useRef<{
    x: number
    y: number
    hit: CubeSurfaceHit | null
    mode: CubeGesture
    pointerType: string
  } | null>(null)
  // Fingers on the canvas, and where the two tilting fingers were last.
  const touchesRef = useRef(new Map<number, [number, number]>())
  const tiltFromRef = useRef<[[number, number], [number, number]] | null>(null)
  // Where two fingers landed (spread and midpoint), and whether the gesture
  // has locked to tilting or pinching.
  const pinchRef = useRef<{
    start: number
    midpoint: [number, number]
    lock: TwoFingerLock
  }>({ start: 0, midpoint: [0, 0], lock: 'undecided' })
  const [coarsePointer] = useState(
    () => window.matchMedia?.('(pointer: coarse)').matches ?? false,
  )
  const resumeAutoAtRef = useRef(0)
  const lastPointerRef = useRef({ x: 0, y: 0, time: 0 })
  const inertiaRef = useRef({ yaw: 0, pitch: 0 })
  const lastFrameTimeRef = useRef<number | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // Keep state accessible to render loop
  const stateRef = useRef({ pitch, yaw, zoom, isRotating })
  stateRef.current = { pitch, yaw, zoom, isRotating }

  // Auto-scale zoom when puzzleSize changes
  useEffect(() => {
    setZoom(getDefaultZoom(puzzleSize))
  }, [puzzleSize])

  const pauseAutoRotation = () => {
    inertiaRef.current = { yaw: 0, pitch: 0 }
    resumeAutoAtRef.current = performance.now() + AUTO_ROTATE_RESUME_DELAY_MS
  }

  // Reset to isometric view
  const resetView = () => {
    pauseAutoRotation()
    setPitch(0.42)
    setYaw(-0.62)
    setZoom(getDefaultZoom(puzzleSize))
  }

  // Preset face views
  const setPreset = (targetPitch: number, targetYaw: number) => {
    pauseAutoRotation()
    setPitch(targetPitch)
    setYaw(targetYaw)
  }

  const triggerTurn = (
    face: FaceKey,
    turns: number,
    depth = 1,
    undo = false,
  ) => {
    pauseAutoRotation()
    turnQueueRef.current.push({ face, depth, turns, duration: 160, undo })
    setIsTurning(true)
  }

  const toggleScramble = () => {
    pauseAutoRotation()
    if (isScrambling) {
      turnQueueRef.current = []
      setIsScrambling(false)
      if (!currentTurnRef.current) setIsTurning(false)
    } else {
      setIsScrambling(true)
      setIsTurning(true)
      const moves = generateScrambleMoves(puzzleSize)
      turnQueueRef.current = moves.map((m) => ({ ...m, duration: 85 }))
    }
  }

  const resetCube = () => {
    turnQueueRef.current = []
    currentTurnRef.current = null
    dragTurnRef.current = null
    setIsScrambling(false)
    setIsTurning(false)
    currentCubeRef.current = cube
    setCurrentCube(cube)
    movesRef.current = []
    setMoves([])
    onTurnStateChangeRef.current?.(cube, [])
    forceUpdateMeshRef.current = true
  }

  const undoLastTurn = () => {
    if (isTurning) return
    const last = movesRef.current.at(-1)
    if (last) triggerTurn(last.face, -last.turns, last.depth, true)
  }

  const isInitialCube =
    currentCube === cube ||
    (['u', 'r', 'f', 'd', 'l', 'b'] as const).every((k) =>
      currentCube[k].every((v, i) => v === cube[k][i]),
    )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl =
      (canvas.getContext('webgl2', {
        antialias: true,
        alpha: true,
      }) as WebGL2RenderingContext | null) ||
      (canvas.getContext('webgl', {
        antialias: true,
        alpha: true,
      }) as WebGLRenderingContext | null)
    if (!gl) {
      setIsSupported(false)
      return
    }

    gl.getExtension('OES_element_index_uint')

    const program = initProgram(gl)
    if (!program) {
      setIsSupported(false)
      return
    }

    const shadow = createShadowRenderer(gl)
    // Shadow strength comes from the backdrop's CSS so it follows the theme.
    let shadowAlpha = 0.3
    const readShadowAlpha = () => {
      const value = Number.parseFloat(
        getComputedStyle(canvas).getPropertyValue('--cube-3d-shadow'),
      )
      shadowAlpha = Number.isFinite(value) ? value : 0.3
    }
    readShadowAlpha()
    const colorScheme = window.matchMedia?.('(prefers-color-scheme: dark)')
    colorScheme?.addEventListener('change', readShadowAlpha)

    gl.useProgram(program)
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    gl.clearColor(0, 0, 0, 0)

    // Build geometry
    const mesh = buildCubeMesh(
      currentCubeRef.current,
      puzzleSize,
      palette,
      isStickerless,
    )

    const posBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.DYNAMIC_DRAW)

    const normBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.DYNAMIC_DRAW)

    const colBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, colBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.DYNAMIC_DRAW)

    const occlusionBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, occlusionBuf)
    gl.bufferData(gl.ARRAY_BUFFER, mesh.occlusion, gl.STATIC_DRAW)

    const idxBuf = gl.createBuffer()
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)

    const aPos = gl.getAttribLocation(program, 'a_position')
    const aNorm = gl.getAttribLocation(program, 'a_normal')
    const aCol = gl.getAttribLocation(program, 'a_color')
    const aOcclusion = gl.getAttribLocation(program, 'a_occlusion')

    const uMvp = gl.getUniformLocation(program, 'u_mvp')
    const uModel = gl.getUniformLocation(program, 'u_model')
    const uLight1 = gl.getUniformLocation(program, 'u_lightDir1')
    const uLight2 = gl.getUniformLocation(program, 'u_lightDir2')
    const uCameraPos = gl.getUniformLocation(program, 'u_cameraPos')

    gl.uniform3f(uLight1, 1.5, 2.5, 2.0)
    gl.uniform3f(uLight2, -2.0, -1.0, -2.0)

    const render = (time: number) => {
      const elapsed = Math.min(time - (lastFrameTimeRef.current ?? time), 50)
      lastFrameTimeRef.current = time

      // Handle layer turn animation & mesh updates
      if (forceUpdateMeshRef.current) {
        forceUpdateMeshRef.current = false
        const updatedMesh = buildCubeMesh(
          currentCubeRef.current,
          puzzleSize,
          palette,
          isStickerless,
        )
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, updatedMesh.positions)
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, updatedMesh.normals)
        gl.bindBuffer(gl.ARRAY_BUFFER, colBuf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, updatedMesh.colors)
      } else if (currentTurnRef.current) {
        const anim = currentTurnRef.current
        const turnElapsed = time - anim.startTime
        const progress = Math.min(1, Math.max(0, turnElapsed / anim.duration))
        const ease = magneticEase(progress)
        const from = anim.from ?? 0
        const targetAngle = anim.turns * (Math.PI / 2)
        const currentAngle = from + ease * (targetAngle - from)

        const turnMesh = buildCubeMesh(
          currentCubeRef.current,
          puzzleSize,
          palette,
          isStickerless,
          { face: anim.face, depth: anim.depth, angle: currentAngle },
        )
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, turnMesh.positions)
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, turnMesh.normals)

        if (progress >= 1) {
          // A drag released short of a quarter turn springs back silently.
          if (anim.turns !== 0) {
            playTurnClick(
              turnClickGain(
                anim.duration,
                readPreference(document.cookie, SOUND_COOKIE),
              ),
            )
            const nextCube = applyCubeLayerMove(
              currentCubeRef.current,
              puzzleSize,
              anim.face,
              anim.depth ?? 1,
              anim.turns,
            )
            currentCubeRef.current = nextCube
            setCurrentCube(nextCube)
            const nextMoves = anim.undo
              ? movesRef.current.slice(0, -1)
              : recordTurn(movesRef.current, {
                  face: anim.face,
                  depth: anim.depth ?? 1,
                  turns: anim.turns,
                })
            movesRef.current = nextMoves
            setMoves(nextMoves)
            onTurnStateChangeRef.current?.(nextCube, nextMoves)
          }

          const finalMesh = buildCubeMesh(
            currentCubeRef.current,
            puzzleSize,
            palette,
            isStickerless,
          )
          gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, finalMesh.positions)
          gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, finalMesh.normals)
          gl.bindBuffer(gl.ARRAY_BUFFER, colBuf)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, finalMesh.colors)

          if (turnQueueRef.current.length > 0) {
            const next = turnQueueRef.current.shift()!
            currentTurnRef.current = {
              face: next.face,
              depth: next.depth,
              turns: next.turns,
              from: next.from,
              startTime: time,
              duration: next.duration ?? 90,
              undo: next.undo,
            }
          } else {
            currentTurnRef.current = null
            setIsScrambling(false)
            setIsTurning(false)
          }
        }
      } else if (dragTurnRef.current) {
        // Queued turns wait until the finger lets go of the layer.
        const drag = dragTurnRef.current
        if (drag.drawn !== drag.angle) {
          drag.drawn = drag.angle
          const dragMesh = buildCubeMesh(
            currentCubeRef.current,
            puzzleSize,
            palette,
            isStickerless,
            {
              face: drag.layer.face,
              depth: drag.layer.depth,
              angle: drag.angle,
            },
          )
          gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, dragMesh.positions)
          gl.bindBuffer(gl.ARRAY_BUFFER, normBuf)
          gl.bufferSubData(gl.ARRAY_BUFFER, 0, dragMesh.normals)
        }
      } else if (turnQueueRef.current.length > 0) {
        const next = turnQueueRef.current.shift()!
        currentTurnRef.current = {
          face: next.face,
          depth: next.depth,
          turns: next.turns,
          from: next.from,
          startTime: time,
          duration: next.duration ?? 160,
          undo: next.undo,
        }
      }
      if (!isDraggingRef.current) {
        const yawStep = stepDragInertia(inertiaRef.current.yaw, elapsed)
        const pitchStep = stepDragInertia(inertiaRef.current.pitch, elapsed)
        inertiaRef.current = {
          yaw: yawStep.velocity,
          pitch: pitchStep.velocity,
        }
        if (yawStep.delta) setYaw((prev) => prev + yawStep.delta)
        if (pitchStep.delta) {
          setPitch((prev) =>
            Math.max(
              -Math.PI / 2 + 0.05,
              Math.min(Math.PI / 2 - 0.05, prev + pitchStep.delta),
            ),
          )
        }
      }
      if (
        stateRef.current.isRotating &&
        !isDraggingRef.current &&
        time >= resumeAutoAtRef.current &&
        inertiaRef.current.yaw === 0 &&
        inertiaRef.current.pitch === 0
      ) {
        setYaw((prev) => prev + elapsed * AUTO_ROTATE_RADIANS_PER_MS)
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

      shadow?.draw(
        viewProj,
        puzzleSize,
        stateRef.current.pitch,
        stateRef.current.yaw,
        shadowAlpha,
      )
      gl.useProgram(program)
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

      gl.bindBuffer(gl.ARRAY_BUFFER, occlusionBuf)
      gl.vertexAttribPointer(aOcclusion, 1, gl.FLOAT, false, 0, 0)
      gl.enableVertexAttribArray(aOcclusion)

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf)
      const indexType =
        mesh.indices instanceof Uint32Array
          ? gl.UNSIGNED_INT
          : gl.UNSIGNED_SHORT
      gl.drawElements(gl.TRIANGLES, mesh.indexCount, indexType, 0)

      animFrameRef.current = requestAnimationFrame(render)
    }

    animFrameRef.current = requestAnimationFrame(render)

    return () => {
      lastFrameTimeRef.current = null
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }
      gl.deleteBuffer(posBuf)
      gl.deleteBuffer(normBuf)
      gl.deleteBuffer(colBuf)
      gl.deleteBuffer(occlusionBuf)
      gl.deleteBuffer(idxBuf)
      gl.deleteProgram(program)
      shadow?.dispose()
      colorScheme?.removeEventListener('change', readShadowAlpha)
    }
  }, [cube, puzzleSize, palette, isStickerless])

  const spreadOf = ([a, b]: [[number, number], [number, number]]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1])
  const midpointOf = ([a, b]: [[number, number], [number, number]]): [
    number,
    number,
  ] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

  const startTilt = () => {
    const touches = twoTouches()
    tiltFromRef.current = touches
    pinchRef.current = {
      start: touches ? spreadOf(touches) : 0,
      midpoint: touches ? midpointOf(touches) : [0, 0],
      lock: 'undecided',
    }
  }

  const twoTouches = (): [[number, number], [number, number]] | null => {
    const points = [...touchesRef.current.values()]
    return points.length >= 2 ? [points[0], points[1]] : null
  }

  const rotateView = (dx: number, dy: number, timeStamp: number) => {
    const elapsed = Math.max(timeStamp - lastPointerRef.current.time, 8)
    lastPointerRef.current = {
      x: lastPointerRef.current.x + dx,
      y: lastPointerRef.current.y + dy,
      time: timeStamp,
    }
    const speed = 0.008
    inertiaRef.current = {
      yaw: Math.max(-0.006, Math.min(0.006, (dx * speed) / elapsed)),
      pitch: Math.max(-0.006, Math.min(0.006, (dy * speed) / elapsed)),
    }
    setYaw((prev) => prev + dx * speed)
    setPitch((prev) => {
      const next = prev + dy * speed
      const limit = Math.PI / 2 - 0.05
      return Math.max(-limit, Math.min(limit, next))
    })
  }

  const gestureCamera = (rect: DOMRect): CubeGestureCamera => ({
    width: rect.width,
    height: rect.height,
    zoom: stateRef.current.zoom,
    pitch: stateRef.current.pitch,
    yaw: stateRef.current.yaw,
    size: puzzleSize,
  })

  // Hands a released drag to the turn animation, which settles the layer on
  // whole quarter turns from where the finger left it.
  const settleDrag = (turns: number) => {
    const drag = dragTurnRef.current
    if (!drag) return
    dragTurnRef.current = null
    const quarter = Math.PI / 2
    const distance = Math.abs(turns * quarter - drag.angle) / quarter
    turnQueueRef.current.unshift({
      face: drag.layer.face,
      depth: drag.layer.depth,
      turns,
      from: drag.angle,
      duration: Math.max(120, Math.min(240, 160 * distance)),
    })
  }

  const handlePointerDown = (e: PointerEvent) => {
    const touch = e.pointerType === 'touch'
    if (touch) touchesRef.current.set(e.pointerId, [e.clientX, e.clientY])
    const touches = touch ? touchesRef.current.size : 1
    try {
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    } catch {
      // Capture is only a convenience; the gesture works without it.
    }
    isDraggingRef.current = true
    resumeAutoAtRef.current = Number.POSITIVE_INFINITY
    inertiaRef.current = { yaw: 0, pitch: 0 }
    if (touches > 1) {
      // A second finger switches to tilting, whatever the first one did.
      const gesture = gestureRef.current
      const mode = gestureForPointerDown(
        'touch',
        touches,
        null,
        gesture?.mode ?? null,
      )
      if (gesture) gesture.mode = mode
      if (mode === 'tilt') {
        // A second finger lets go of a dragged layer.
        settleDrag(0)
        startTilt()
        lastPointerRef.current = {
          ...lastPointerRef.current,
          time: e.timeStamp,
        }
      }
      return
    }
    lastPointerRef.current = { x: e.clientX, y: e.clientY, time: e.timeStamp }
    const rect = canvasRef.current?.getBoundingClientRect()
    const hit =
      rect &&
      !currentTurnRef.current &&
      !dragTurnRef.current &&
      turnQueueRef.current.length === 0
        ? pickCubeSurface(
            e.clientX - rect.left,
            e.clientY - rect.top,
            gestureCamera(rect),
          )
        : null
    gestureRef.current = {
      x: e.clientX,
      y: e.clientY,
      hit,
      mode: gestureForPointerDown(e.pointerType, 1, hit, null),
      pointerType: e.pointerType,
    }
  }

  const handlePointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && touchesRef.current.has(e.pointerId))
      touchesRef.current.set(e.pointerId, [e.clientX, e.clientY])
    if (!isDraggingRef.current) return
    const gesture = gestureRef.current
    if (!gesture) return
    if (gesture.mode === 'tilt') {
      const from = tiltFromRef.current
      const to = twoTouches()
      if (!from || !to) return
      tiltFromRef.current = to
      const [mx, my] = midpointOf(to)
      const [sx, sy] = pinchRef.current.midpoint
      const lock = twoFingerLock(
        pinchRef.current.start,
        spreadOf(to),
        Math.hypot(mx - sx, my - sy),
        pinchRef.current.lock,
      )
      pinchRef.current.lock = lock
      // Undecided moves do nothing, so neither a tilt nor a pinch jumps once
      // it locks; after that only the locked one follows the fingers.
      const motion = twoFingerMotion(from, to)
      if (lock === 'tilt') rotateView(motion.dx, motion.dy, e.timeStamp)
      if (lock === 'pinch' && motion.scale !== 1)
        setZoom((prev) => clampZoom(prev / motion.scale, puzzleSize))
      return
    }
    if (gesture.mode === 'none') return
    if (gesture.mode === 'turn') {
      const drag = dragTurnRef.current
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!drag || !gesture.hit || !rect) return
      const angle = swipeLayerAngle(
        gesture.hit,
        drag.layer,
        e.clientX - gesture.x,
        e.clientY - gesture.y,
        gestureCamera(rect),
      )
      drag.velocity =
        (angle - drag.angle) / Math.max(e.timeStamp - drag.time, 8)
      drag.angle = angle
      drag.time = e.timeStamp
      return
    }
    if (gesture.mode === 'pending' && gesture.hit) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const dx = e.clientX - gesture.x
      const dy = e.clientY - gesture.y
      if (Math.hypot(dx, dy) < 18) return
      const camera = gestureCamera(rect)
      const layer = pickSwipeLayer(gesture.hit, dx, dy, camera)
      if (layer) {
        // The layer follows the finger from here until release.
        gesture.mode = 'turn'
        dragTurnRef.current = {
          layer,
          angle: swipeLayerAngle(gesture.hit, layer, dx, dy, camera),
          velocity: 0,
          time: e.timeStamp,
          drawn: null,
        }
        setIsTurning(true)
        return
      }
      gesture.mode = gestureWhenSwipeTurnsNothing(gesture.pointerType)
      if (gesture.mode !== 'camera') return
    }
    rotateView(
      e.clientX - lastPointerRef.current.x,
      e.clientY - lastPointerRef.current.y,
      e.timeStamp,
    )
  }

  const handlePointerUp = (e: PointerEvent) => {
    const touch = e.pointerType === 'touch'
    if (touch) touchesRef.current.delete(e.pointerId)
    try {
      ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      // Ignore if pointer capture release fails
    }
    const remaining = touch ? touchesRef.current.size : 0
    const next = gestureAfterPointerUp(
      remaining,
      gestureRef.current?.mode ?? null,
    )
    if (next !== null) {
      if (gestureRef.current) gestureRef.current.mode = next
      if (next === 'tilt') startTilt()
      else tiltFromRef.current = null
      return
    }
    isDraggingRef.current = false
    if (gestureRef.current?.mode === 'turn') {
      inertiaRef.current = { yaw: 0, pitch: 0 }
      const drag = dragTurnRef.current
      if (drag) {
        // A finger that stopped before lifting throws nothing.
        const velocity = e.timeStamp - drag.time > 100 ? 0 : drag.velocity
        settleDrag(
          e.type === 'pointercancel'
            ? 0
            : releasedQuarterTurns(drag.angle, velocity),
        )
      }
    }
    gestureRef.current = null
    tiltFromRef.current = null
    resumeAutoAtRef.current = performance.now() + AUTO_ROTATE_RESUME_DELAY_MS
    if (
      e.type === 'pointercancel' ||
      e.timeStamp - lastPointerRef.current.time > 120
    ) {
      inertiaRef.current = { yaw: 0, pitch: 0 }
    }
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (wheelGesture(e) === 'tilt') {
      // Touchpads already coast their swipes, so add no inertia of our own.
      rotateView(-e.deltaX, -e.deltaY, e.timeStamp)
      pauseAutoRotation()
      return
    }
    // Pinch steps are small; mouse wheel notches are about 100.
    const zoomDelta = e.deltaY * (e.ctrlKey ? 0.05 : 0.01)
    setZoom((prev) => clampZoom(prev + zoomDelta, puzzleSize))
  }

  const limit = Math.PI / 2 - 0.05
  const step = 0.2

  const tiltUp = () => {
    pauseAutoRotation()
    setPitch((p) => Math.min(limit, p + step))
  }
  const tiltDown = () => {
    pauseAutoRotation()
    setPitch((p) => Math.max(-limit, p - step))
  }
  const rotateLeft = () => {
    pauseAutoRotation()
    setYaw((y) => y + step)
  }
  const rotateRight = () => {
    pauseAutoRotation()
    setYaw((y) => y - step)
  }

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
              {coarsePointer ? (
                <>
                  Swipe a sticker to turn its layer &bull; Two fingers to tilt,
                  pinch to zoom
                </>
              ) : (
                <>
                  Swipe a sticker to turn its layer &bull; Drag the background
                  or swipe two fingers to rotate &bull; Pinch or scroll to zoom
                </>
              )}
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
                  onClick={() => setPreset(0, -Math.PI / 2)}
                  title="Right face"
                >
                  Right (R)
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
                  onClick={() => setPreset(-Math.PI / 2 + 0.05, 0)}
                  title="Down face"
                >
                  Down (D)
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
                  onClick={() => setPreset(0, Math.PI)}
                  title="Back face"
                >
                  Back (B)
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
              <span class="cube-3d-label">Tilt:</span>
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

            <div class="cube-3d-section">
              <span class="cube-3d-label">Cube:</span>
              <div class="cube-3d-presets">
                <button
                  type="button"
                  class={`cube-3d-btn ${isScrambling ? 'cube-3d-btn-active' : ''}`}
                  onClick={toggleScramble}
                  title={isScrambling ? 'Stop scramble' : 'Scramble cube'}
                >
                  {isScrambling ? 'Stop' : 'Scramble'}
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={undoLastTurn}
                  disabled={moves.length === 0 || isTurning}
                  title="Undo the last completed layer turn"
                >
                  Undo
                </button>
                <button
                  type="button"
                  class="cube-3d-btn"
                  onClick={resetCube}
                  disabled={isInitialCube && moves.length === 0}
                  title="Reset cube to initial assembled state"
                >
                  Reset
                </button>
              </div>
            </div>

            <div
              class="cube-3d-move-history"
              role="status"
              aria-label="Move history"
            >
              Moves:{' '}
              {moves.length ? moves.map(formatCubeTurn).join(' ') : 'None'}
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
                onClick={() => {
                  inertiaRef.current = { yaw: 0, pitch: 0 }
                  resumeAutoAtRef.current = 0
                  setIsRotating((v) => !v)
                }}
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
