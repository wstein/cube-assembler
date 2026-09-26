// What the cube net needs beyond the colors: which stickers belong to one
// physical piece, and which captured photo (and sticker in it) each net
// face shows. Faces use the URFDLB facelet layout parity.ts reads: U seen
// from above with B at the top, D from below with F at the top, B from
// behind; every face row-major.

type Position = [number, number, number]

// Sticker `index` of `face` as cubie coordinates: x from L to R, y from D
// to U, z from B to F, each 0..n-1.
function faceletPosition(n: number, face: string, index: number): Position {
  const r = Math.floor(index / n), c = index % n, last = n - 1
  switch (face) {
    case 'u': return [c, last, r]
    case 'd': return [c, 0, last - r]
    case 'f': return [c, last - r, last]
    case 'b': return [last - c, last - r, 0]
    case 'r': return [last, last - r, last - c]
    case 'l': return [0, last - r, c]
  }
  throw new Error(`Unknown face ${face}`)
}

// The same key for every sticker of one physical piece: a corner's three,
// an edge's or wing's two, a center's one.
export function pieceKey(n: number, face: string, index: number): string {
  return faceletPosition(n, face, index).join(',')
}

// Turns `grid` clockwise like cubeAssembly.ts's rotateGrid:
// new[r][c] = old[n-1-c][r].
function turned<T>(grid: T[][], turns: number): T[][] {
  let out = grid
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) out = out.map((row, r) => row.map((_, c) => out[out.length - 1 - c][r]))
  return out
}

// The photo sticker shown at `index` of a net face that is its photo turned
// `turns` quarter turns clockwise.
export function sourceIndex(n: number, turns: number, index: number): number {
  const indices = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => r * n + c))
  return turned(indices, turns)[Math.floor(index / n)][index % n]
}

export interface FaceSource {
  slot: string
  turns: number
}

// For each net face, the captured photo (slot) and clockwise turns whose
// colors it shows exactly - each photo used once. Null for a face no unused
// photo matches (typed or edited colors, say).
export function faceSources(netFaces: Record<string, string[][]>, captured: Record<string, string[][]>): Record<string, FaceSource | null> {
  const used = new Set<string>()
  const key = (grid: string[][]) => grid.map((row) => row.join('')).join('/')
  const result: Record<string, FaceSource | null> = {}
  for (const [face, grid] of Object.entries(netFaces)) {
    result[face] = null
    search: for (const [slot, photo] of Object.entries(captured)) {
      if (used.has(slot) || photo.length !== grid.length) continue
      for (let turns = 0; turns < 4; turns++) {
        if (key(turned(photo, turns)) === key(grid)) {
          used.add(slot)
          result[face] = { slot, turns }
          break search
        }
      }
    }
  }
  return result
}
