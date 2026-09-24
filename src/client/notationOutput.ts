// Cube state notation: the app offers two manual entry / copy-paste
// formats, both six space-separated N² letters per face (N² is 9 for a
// 3×3, 25 for a 5×5, etc), in U R F D L B order:
//   - "WRG facelets": WOGRBY color letters, e.g. for a solved 3×3:
//     "WWWWWWWWW RRRRRRRRR GGGGGGGGG YYYYYYYYY OOOOOOOOO BBBBBBBBB".
//   - "URF facelets": the same block structure, but using U/R/F/D/L/B as
//     color-identity letters rather than color names - each letter names
//     the face whose SOLVED color matches that sticker, so a solved cube
//     reads "UUUUUUUUU RRRRRRRRR FFFFFFFFF DDDDDDDDD LLLLLLLLL BBBBBBBBB".
//     This is the standard Kociemba/solver facelet convention (min2phase,
//     twizzle, ...) - "URF facelets" means this everywhere outside this
//     app too, not just "the WOGRBY string with spaces removed".

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

function toBlocks(cube: CubeState, letterFor: (color: string) => string): string {
  const faces = faceMap(cube)
  return FACE_ORDER.map((face) => faces[face].map(letterFor).join('')).join(' ')
}

function fromBlocks(
  input: string,
  validLetters: Set<string>,
  colorFor: (letter: string) => string,
  formatLabel: string
): CubeState | null {
  const facelets = input.trim().replace(/\s+/g, '')
  const perFace = faceletsPerFace(facelets.length)
  if (perFace === null) {
    console.warn(`Invalid ${formatLabel} facelets string: length ${facelets.length} is not 6 perfect-square blocks`)
    return null
  }

  for (const char of facelets) {
    if (!validLetters.has(char)) {
      console.warn(`Invalid ${formatLabel} facelet letter: ${char}`)
      return null
    }
  }

  const colors = [...facelets].map(colorFor)
  const faces = FACE_ORDER.map((_, i) => colors.slice(i * perFace, (i + 1) * perFace))
  const [u, r, f, d, l, b] = faces
  return { u, r, f, d, l, b }
}

const WRG_LETTERS = new Set(['W', 'Y', 'O', 'R', 'G', 'B'])
const URF_LETTERS = new Set(['U', 'R', 'F', 'D', 'L', 'B'])

export function toWRGFacelets(cube: CubeState): string {
  return toBlocks(cube, (color) => color)
}

export function fromWRGFacelets(input: string): CubeState | null {
  return fromBlocks(input.toUpperCase(), WRG_LETTERS, (letter) => letter, 'WRG')
}

// Per-face row-major color grids (keyed U/R/F/D/L/B) <-> a WRG facelets
// string - how saved fixtures store their colors ("colorsURFDLB"), one
// readable line instead of six nested arrays.
export function gridsToWRGFacelets(grids: Record<string, string[][]>): string {
  const face = (key: string) => grids[key].flat()
  return toWRGFacelets({ u: face('U'), r: face('R'), f: face('F'), d: face('D'), l: face('L'), b: face('B') })
}

export function wrgFaceletsToGrids(input: string): Record<string, string[][]> | null {
  const cube = fromWRGFacelets(input)
  if (!cube) return null
  const map = faceMap(cube)
  const n = Math.round(Math.sqrt(map.U.length))
  const grids: Record<string, string[][]> = {}
  for (const key of FACE_ORDER) {
    grids[key] = Array.from({ length: n }, (_, r) => map[key].slice(r * n, (r + 1) * n))
  }
  return grids
}

export function toURFFacelets(cube: CubeState): string {
  return toBlocks(cube, (color) => COLOR_TO_FACE_LETTER[color] ?? '?')
}

export function fromURFFacelets(input: string): CubeState | null {
  return fromBlocks(input.toUpperCase(), URF_LETTERS, (letter) => FACE_LETTER_TO_COLOR[letter], 'URF')
}

// WRG's alphabet (WOGRBY) and URF's (URFDLB) share two letters (R, B), but
// W/Y/O/G only ever appear in WRG text and U/F/D/L only ever appear in URF
// text - so a pasted facelets string usually identifies its own format
// unambiguously, letting the input panel auto-select the matching toggle
// instead of requiring the user to pick it first. Returns null (don't
// switch) when the input is empty, uses only the shared R/B letters, or
// mixes letters unique to both alphabets (not a valid string either way).
const WRG_ONLY_LETTERS = new Set(['W', 'Y', 'O', 'G'])
const URF_ONLY_LETTERS = new Set(['U', 'F', 'D', 'L'])
export function detectNotationFormat(input: string): 'wrg' | 'urf' | null {
  let hasWrgOnly = false
  let hasUrfOnly = false
  for (const char of input.toUpperCase()) {
    if (WRG_ONLY_LETTERS.has(char)) hasWrgOnly = true
    else if (URF_ONLY_LETTERS.has(char)) hasUrfOnly = true
  }
  if (hasWrgOnly && !hasUrfOnly) return 'wrg'
  if (hasUrfOnly && !hasWrgOnly) return 'urf'
  return null
}
