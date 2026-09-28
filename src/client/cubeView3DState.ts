import type { CubeState } from '../cube/cubeAssembly'
import type { Axis } from '../cube/cubeGeometry'

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

export {
  applyCubeLayerMove,
  applyCubeMove,
  cubeStateToFaces,
  facesToCubeState,
  formatCubeTurn,
  generateScrambleMoves,
  recordTurn,
  type CubeTurn,
} from '../cube/cubeMoves'
