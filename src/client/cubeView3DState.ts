import type { ScrambleLength, ScrambleOptions } from './preferences'
import type { CubeState, FaceKey } from '../cube/cubeAssembly'
import {
  rotateCube,
  turnFace,
  type Faces,
  type Axis,
} from '../cube/cubeGeometry'

export type Point = [number, number]

export const DEFAULT_STICKER_HEX: Record<string, string> = {
  W: '#f7f6f1',
  O: '#ff7a1a',
  G: '#1e9e57',
  R: '#cf2a3a',
  B: '#2459d6',
  Y: '#f2d21b',
}

export const AUTO_ROTATE_RESUME_DELAY_MS = 1500
export const AUTO_ROTATE_RADIANS_PER_MS = 0.008 / (1000 / 60)

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

const POSITIVE_FACES: FaceKey[] = ['R', 'U', 'F']

// Turns `width` layers ending `depth` layers in from `face` (a single slice
// by default). Turning through to the far side takes the whole cube, since
// turnFace leaves the opposite face's stickers in place.
export function applyCubeLayerMove(
  cube: CubeState,
  n: number,
  face: FaceKey,
  depth: number,
  quarterTurns = 1,
  width = 1,
): CubeState {
  const outer = depth - width + 1
  if (outer < 1 || depth > n) return cube
  if (depth === 1) return applyCubeMove(cube, n, face, quarterTurns)
  const faces = cubeStateToFaces(cube, n)
  const through =
    depth === n
      ? rotateCube(
          faces,
          turnAxis(face),
          POSITIVE_FACES.includes(face) ? quarterTurns : -quarterTurns,
        )
      : turnFace(faces, face, quarterTurns, depth)
  return facesToCubeState(
    outer > 1 ? turnFace(through, face, -quarterTurns, outer - 1) : through,
  )
}

export interface CubeTurn {
  face: FaceKey
  // The innermost layer turned, counted from `face`.
  depth: number
  // How many layers turn together, ending at `depth`; 1 when omitted.
  width?: number
  turns: number
}

// Standard notation: 2R for one inner slice, Rw or 3Rw for a block from the
// face, 2-3Rw for an inner block, and x, y, z for the whole cube.
export function formatCubeTurn(
  { face, depth, width = 1, turns }: CubeTurn,
  size = Number.POSITIVE_INFINITY,
): string {
  const amount = Math.abs(turns) === 2 ? '2' : turns < 0 ? "'" : ''
  if (width >= size) {
    const inverted = !POSITIVE_FACES.includes(face)
    const reversed = inverted && Math.abs(turns) !== 2
    return `${turnAxis(face)}${reversed ? (turns < 0 ? '' : "'") : amount}`
  }
  if (width === 1) return `${depth > 1 ? depth : ''}${face}${amount}`
  const outer = depth - width + 1
  const layers =
    outer > 1 ? `${outer}-${depth}` : depth > 2 ? String(depth) : ''
  return `${layers}${face}w${amount}`
}

// Adds a finished turn to the history as its shortest form, accumulating
// consecutive turns on the same layer (e.g. R R -> R2, R2 R -> R', R R' -> cancelled).
export function recordTurn(moves: CubeTurn[], turn: CubeTurn): CubeTurn[] {
  const quarter = ((turn.turns % 4) + 4) % 4
  if (quarter === 0) return moves
  const turns = quarter === 3 ? -1 : quarter
  const last = moves.at(-1)
  const width = turn.width ?? 1
  const layers = {
    face: turn.face,
    depth: turn.depth,
    ...(width > 1 && { width }),
  }
  if (
    last &&
    last.face === turn.face &&
    last.depth === turn.depth &&
    (last.width ?? 1) === width
  ) {
    const net = (((last.turns + turns) % 4) + 4) % 4
    if (net === 0) return moves.slice(0, -1)
    return [...moves.slice(0, -1), { ...layers, turns: net === 3 ? -1 : net }]
  }
  return [...moves, { ...layers, turns }]
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

const SCRAMBLE_SCALE: Record<ScrambleLength, number> = {
  short: 0.5,
  normal: 1,
  long: 1.5,
}

export function generateScrambleMoves(
  size: number,
  {
    length: scale = 'normal',
    innerLayers = true,
  }: Partial<ScrambleOptions> = {},
): CubeTurn[] {
  const length = Math.round(
    (SCRAMBLE_LENGTHS[size - 2] ?? 20) * SCRAMBLE_SCALE[scale],
  )
  // Odd cubes keep the exact middle slice fixed during a scramble.
  const maxDepth = innerLayers ? Math.floor(size / 2) : 1
  const moves: CubeTurn[] = []
  let lastAxis: 'x' | 'y' | 'z' | null = null
  for (let i = 0; i < length; i++) {
    const allowed = SCRAMBLE_FACES.filter((f) => turnAxis(f) !== lastAxis)
    const face = allowed[Math.floor(Math.random() * allowed.length)]
    lastAxis = turnAxis(face)
    const turns = [1, -1, 2][Math.floor(Math.random() * 3)]
    const depth =
      i === 0 && maxDepth >= 2 ? 2 : 1 + Math.floor(Math.random() * maxDepth)
    moves.push({ face, depth, turns })
  }
  return moves
}
