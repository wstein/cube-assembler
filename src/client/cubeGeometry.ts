// 3D sticker model of an NxN cube, for turning layers and rotating the
// whole cube without hand-deriving how each face grid gets re-read.
//
// Every sticker gets a position on the cube's surface (coordinates run
// -(n-1)..(n-1) in steps of 2 across a face, the face itself sits at ±n;
// x points to R, y to U, z to F). A turn is a 90° rotation of every
// sticker in a layer; a whole-cube rotation turns every sticker. Face
// grids are read back with exactly the convention cubeAssembly.ts's
// FACE_CORNERS documents: side faces seen from outside with U up, U seen
// from above with B at the top, D seen from below with F at the top.

import type { FaceKey } from './cubeAssembly'

export type Faces = Record<FaceKey, string[][]>
export type Axis = 'x' | 'y' | 'z'
type Vec = [number, number, number]

const FACES: FaceKey[] = ['U', 'R', 'F', 'D', 'L', 'B']

// Where grid cell (row, col) of each face sits in 3D.
function cellPosition(face: FaceKey, row: number, col: number, n: number): Vec {
  const a = -(n - 1) + 2 * col // left -> right across the face as seen
  const b = (n - 1) - 2 * row // top -> bottom
  switch (face) {
    case 'F': return [a, b, n]
    case 'B': return [-a, b, -n]
    case 'R': return [n, b, -a]
    case 'L': return [-n, b, a]
    case 'U': return [a, n, -b]
    case 'D': return [a, -n, b]
  }
}

const AXIS_INDEX: Record<Axis, number> = { x: 0, y: 1, z: 2 }

// One quarter turn clockwise as seen from the positive end of the axis
// (looking from +x = from R, +y = from U, +z = from F): an R turn carries
// F up to U, a U turn carries F to L, an F turn carries U to R.
function quarterTurn([x, y, z]: Vec, axis: Axis): Vec {
  switch (axis) {
    case 'x': return [x, z, -y]
    case 'y': return [-z, y, x]
    case 'z': return [y, -x, z]
  }
}

// Grid cell at each 3D position, built once per cube size.
const cellLookup = new Map<number, Map<string, [FaceKey, number, number]>>()
function cellsBySize(n: number): Map<string, [FaceKey, number, number]> {
  let cells = cellLookup.get(n)
  if (!cells) {
    cells = new Map()
    for (const f of FACES) {
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) cells.set(cellPosition(f, r, c, n).join(','), [f, r, c])
    }
    cellLookup.set(n, cells)
  }
  return cells
}

function transform(faces: Faces, move: (p: Vec) => Vec): Faces {
  const n = faces.U.length
  const out = Object.fromEntries(FACES.map((f) => [f, Array.from({ length: n }, () => Array<string>(n).fill(''))])) as Faces
  const cellOf = cellsBySize(n)
  for (const f of FACES) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const target = move(cellPosition(f, r, c, n))
        const [tf, tr, tc] = cellOf.get(target.join(','))!
        out[tf][tr][tc] = faces[f][r][c]
      }
    }
  }
  return out
}

function repeat(p: Vec, axis: Axis, times: number): Vec {
  let q = p
  for (let i = 0; i < ((times % 4) + 4) % 4; i++) q = quarterTurn(q, axis)
  return q
}

// Rotates the whole cube `quarterTurns` times clockwise as seen from the
// positive end of `axis` - x like an R turn, y like a U turn, z like an F
// turn (the standard x/y/z cube rotations).
export function rotateCube(faces: Faces, axis: Axis, quarterTurns: number): Faces {
  return transform(faces, (p) => repeat(p, axis, quarterTurns))
}

// Turns the outer layer of `face` (plus `depth - 1` inner layers)
// `quarterTurns` times clockwise as seen from that face.
export function turnFace(faces: Faces, face: FaceKey, quarterTurns: number, depth = 1): Faces {
  const n = faces.U.length
  const axis: Axis = face === 'R' || face === 'L' ? 'x' : face === 'U' || face === 'D' ? 'y' : 'z'
  const positive = face === 'R' || face === 'U' || face === 'F'
  // Layer k (0 = the face itself) holds cubies whose coordinate along the
  // axis is ±(n-1-2k); stickers on the face itself sit at ±n.
  const inLayer = (p: Vec) => {
    const v = positive ? p[AXIS_INDEX[axis]] : -p[AXIS_INDEX[axis]]
    return v >= n - 1 - 2 * (depth - 1)
  }
  // Clockwise from a negative face is counter-clockwise about the axis.
  const turns = positive ? quarterTurns : -quarterTurns
  return transform(faces, (p) => (inLayer(p) ? repeat(p, axis, turns) : p))
}

// All 24 whole-cube orientations of the given cube, the identity first:
// each of the 6 faces brought to the top, then spun around the vertical.
export function allOrientations(faces: Faces): Faces[] {
  const tops: Array<[Axis, number]> = [['x', 0], ['x', 1], ['x', 2], ['x', 3], ['z', 1], ['z', 3]]
  return tops.flatMap(([axis, turns]) => {
    const topped = rotateCube(faces, axis, turns)
    return [0, 1, 2, 3].map((y) => rotateCube(topped, 'y', y))
  })
}

export function solvedCubeFaces(n: number, colors: Record<FaceKey, string>): Faces {
  return Object.fromEntries(FACES.map((f) => [f, Array.from({ length: n }, () => Array<string>(n).fill(colors[f]))])) as Faces
}
