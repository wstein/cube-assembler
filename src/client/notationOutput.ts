// Cube state notation: the app's sole input/output format for manual entry
// and copy/paste is "spaced facelets" - six space-separated N²-letter
// blocks (U R F D L B order, WOGRBY colors; N² is 9 for a 3×3, 25 for a
// 5×5, etc). A single format keeps the manual-entry UI simple and
// unambiguous; there's no reader-facing benefit to also supporting
// alternate labeled/grid layouts.

export interface CubeState {
  u: string[]
  r: string[]
  f: string[]
  d: string[]
  l: string[]
  b: string[]
}

const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'] as const

function faceMap(cube: CubeState): Record<(typeof FACE_ORDER)[number], string[]> {
  return { U: cube.u, R: cube.r, F: cube.f, D: cube.d, L: cube.l, B: cube.b }
}

// Unspaced 6*N² run (U(N²) R(N²) F(N²) D(N²) L(N²) B(N²)) - the underlying
// wire format `toSpacedFacelets`/`fromSpacedFacelets` add human-readable
// spacing to.
function toFacelets(cube: CubeState): string {
  const faces = faceMap(cube)
  return FACE_ORDER.map((face) => faces[face].join('')).join('')
}

// A facelets string only carries the puzzle size implicitly (its total
// length must split evenly into 6 perfect-square blocks), so this rejects
// anything that can't possibly be a valid NxN cube instead of guessing.
function faceletsPerFace(totalLength: number): number | null {
  if (totalLength <= 0 || totalLength % 6 !== 0) return null
  const perFace = totalLength / 6
  return Number.isInteger(Math.sqrt(perFace)) ? perFace : null
}

function fromFacelets(facelets: string): CubeState | null {
  const perFace = faceletsPerFace(facelets.length)
  if (perFace === null) {
    console.warn(`Invalid facelets string: length ${facelets.length} is not 6 perfect-square blocks`)
    return null
  }

  const validColors = new Set(['W', 'Y', 'O', 'R', 'G', 'B'])
  for (const char of facelets) {
    if (!validColors.has(char)) {
      console.warn(`Invalid color in facelets: ${char}`)
      return null
    }
  }

  const faces = FACE_ORDER.map((_, i) => facelets.slice(i * perFace, (i + 1) * perFace).split(''))
  const [u, r, f, d, l, b] = faces
  return { u, r, f, d, l, b }
}

export function toSpacedFacelets(cube: CubeState): string {
  const facelets = toFacelets(cube)
  const perFace = facelets.length / FACE_ORDER.length
  return FACE_ORDER.map((_, i) => facelets.slice(i * perFace, (i + 1) * perFace)).join(' ')
}

export function fromSpacedFacelets(input: string): CubeState | null {
  return fromFacelets(input.trim().replace(/\s+/g, ''))
}
