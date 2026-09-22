// Cube state notation: the app offers two manual entry / copy-paste
// formats, both in U R F D L B order, N² letters per face (N² is 9 for a
// 3×3, 25 for a 5×5, etc):
//   - "spaced facelets": six space-separated N²-letter blocks of WOGRBY
//     color letters, e.g. "WWWWWWWWW RRRRRRRRR ..." - easier to read and
//     edit by hand.
//   - "URF facelets": the standard Kociemba/solver facelet string - one
//     run of 6*N² letters, no separators, using U/R/F/D/L/B as
//     color-identity letters rather than color names (each letter names
//     the face whose SOLVED color matches that sticker - so a solved
//     cube reads "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB").
//     This is the format cube-solving tools (Kociemba, min2phase, twizzle,
//     ...) expect, so it's what "URF facelets" means everywhere outside
//     this app too - a plain-WOGRBY unspaced string is not the same thing
//     even though it also happens to be 54 characters.

export interface CubeState {
  u: string[]
  r: string[]
  f: string[]
  d: string[]
  l: string[]
  b: string[]
}

const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'] as const

// WCA solved-color <-> face-identity-letter mapping (U=White, R=Red,
// F=Green, D=Yellow, L=Orange, B=Blue) - the same convention used
// throughout the rest of this app (see SOLVED_FACE_COLOR in cubeAssembly.ts).
const COLOR_TO_FACE_LETTER: Record<string, string> = { W: 'U', R: 'R', G: 'F', Y: 'D', O: 'L', B: 'B' }
const FACE_LETTER_TO_COLOR: Record<string, string> = { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }

function faceMap(cube: CubeState): Record<(typeof FACE_ORDER)[number], string[]> {
  return { U: cube.u, R: cube.r, F: cube.f, D: cube.d, L: cube.l, B: cube.b }
}

// A facelets string only carries the puzzle size implicitly (its total
// length must split evenly into 6 perfect-square blocks), so this rejects
// anything that can't possibly be a valid NxN cube instead of guessing.
function faceletsPerFace(totalLength: number): number | null {
  if (totalLength <= 0 || totalLength % 6 !== 0) return null
  const perFace = totalLength / 6
  return Number.isInteger(Math.sqrt(perFace)) ? perFace : null
}

export function toSpacedFacelets(cube: CubeState): string {
  const faces = faceMap(cube)
  return FACE_ORDER.map((face) => faces[face].join('')).join(' ')
}

export function fromSpacedFacelets(input: string): CubeState | null {
  const facelets = input.trim().replace(/\s+/g, '')
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

export function toURFFacelets(cube: CubeState): string {
  const faces = faceMap(cube)
  return FACE_ORDER.map((face) => faces[face].map((c) => COLOR_TO_FACE_LETTER[c] ?? '?').join('')).join('')
}

export function fromURFFacelets(facelets: string): CubeState | null {
  const perFace = faceletsPerFace(facelets.length)
  if (perFace === null) {
    console.warn(`Invalid URF facelets string: length ${facelets.length} is not 6 perfect-square blocks`)
    return null
  }

  const validLetters = new Set(['U', 'R', 'F', 'D', 'L', 'B'])
  for (const char of facelets) {
    if (!validLetters.has(char)) {
      console.warn(`Invalid facelet letter: ${char} (expected one of U R F D L B)`)
      return null
    }
  }

  const colors = [...facelets].map((letter) => FACE_LETTER_TO_COLOR[letter])
  const faces = FACE_ORDER.map((_, i) => colors.slice(i * perFace, (i + 1) * perFace))
  const [u, r, f, d, l, b] = faces
  return { u, r, f, d, l, b }
}
