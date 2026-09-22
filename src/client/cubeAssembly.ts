// Cube state assembly from captured faces

export interface CubeState {
  u: string[]
  r: string[]
  f: string[]
  d: string[]
  l: string[]
  b: string[]
}

// Server-side wire format: each face carries its own grid dimension + colors
export interface CubeIR {
  size: number
  u: { n: number; data: string[] }
  r: { n: number; data: string[] }
  f: { n: number; data: string[] }
  d: { n: number; data: string[] }
  l: { n: number; data: string[] }
  b: { n: number; data: string[] }
}

export function toCubeIR(cube: CubeState, size: number): CubeIR {
  const grid = (data: string[]) => ({ n: size, data })
  return {
    size,
    u: grid(cube.u),
    r: grid(cube.r),
    f: grid(cube.f),
    d: grid(cube.d),
    l: grid(cube.l),
    b: grid(cube.b),
  }
}

// WCA color to position mapping
const COLOR_FACES: Record<string, 'U' | 'R' | 'F' | 'D' | 'L' | 'B'> = {
  W: 'U', // White = Up
  Y: 'D', // Yellow = Down
  O: 'L', // Orange = Left
  R: 'R', // Red = Right
  G: 'F', // Green = Front
  B: 'B', // Blue = Back
}

const SOLVED_FACE_COLOR: Record<'U' | 'R' | 'F' | 'D' | 'L' | 'B', string> = {
  U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B',
}

function solvedFace(letter: keyof typeof SOLVED_FACE_COLOR, size: number): string[][] {
  const color = SOLVED_FACE_COLOR[letter]
  return Array.from({ length: size }, () => Array(size).fill(color))
}

export function assembleCubeFromFaces(
  faces: Record<string, string[][]>,
  size = 3
): CubeState {
  // Flatten each NxN face into a size*size-element array
  const flattenFace = (face: string[][]): string[] => {
    return face.flat()
  }

  const cubeState: CubeState = {
    u: flattenFace(faces.U || solvedFace('U', size)),
    r: flattenFace(faces.R || solvedFace('R', size)),
    f: flattenFace(faces.F || solvedFace('F', size)),
    d: flattenFace(faces.D || solvedFace('D', size)),
    l: flattenFace(faces.L || solvedFace('L', size)),
    b: flattenFace(faces.B || solvedFace('B', size)),
  }

  return cubeState
}

export function faceColorsToString(colors: string[][]): string {
  return colors.map(row => row.join(' ')).join('\n')
}

export function validateFaceColors(colors: string[][], size = 3): boolean {
  if (colors.length !== size) return false

  const validColors = new Set(['W', 'Y', 'O', 'R', 'G', 'B'])

  for (const row of colors) {
    if (row.length !== size) return false
    for (const color of row) {
      if (!validColors.has(color)) return false
    }
  }

  return true
}

export function createSolvedCube(size = 3): CubeState {
  return {
    u: Array(size * size).fill('W'),
    r: Array(size * size).fill('R'),
    f: Array(size * size).fill('G'),
    d: Array(size * size).fill('Y'),
    l: Array(size * size).fill('O'),
    b: Array(size * size).fill('B'),
  }
}

export function parseColorInput(input: string): Record<string, string[][]> | null {
  const faceData: Record<string, string[][]> = {}
  const validColors = new Set(['W', 'Y', 'O', 'R', 'G', 'B'])

  // Try compact format first: U:WWWWWWWWW R:RRRRRRRRR ... (ignore all whitespace)
  const compactMatch = input.match(/([URFDLB]):([A-Z]{9})/g)
  if (compactMatch && compactMatch.length > 0) {
    for (const match of compactMatch) {
      const [faceName, colors] = match.split(':')
      const colorChars = colors.split('')

      if (!colorChars.every(c => validColors.has(c))) {
        console.warn(`Face ${faceName} has invalid colors: ${colorChars.filter(c => !validColors.has(c)).join(',')}`)
        continue
      }

      faceData[faceName] = [
        [colorChars[0], colorChars[1], colorChars[2]],
        [colorChars[3], colorChars[4], colorChars[5]],
        [colorChars[6], colorChars[7], colorChars[8]],
      ]
    }

    if (Object.keys(faceData).length === 6) {
      return faceData
    }
  }

  // Fall back to line-by-line format: U W W W ... or U:W W W ...
  const lines = input
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))

  for (const line of lines) {
    const [faceName, ...colorChars] = line.split(/[\s:,]+/).filter(s => s)

    if (!['U', 'R', 'F', 'D', 'L', 'B'].includes(faceName)) {
      console.warn(`Skipping invalid face: ${faceName}`)
      continue
    }

    if (colorChars.length !== 9) {
      console.warn(`Face ${faceName} has ${colorChars.length} colors, expected 9`)
      continue
    }

    const invalidColors = colorChars.filter(c => !validColors.has(c))
    if (invalidColors.length > 0) {
      console.warn(`Face ${faceName} has invalid colors: ${invalidColors.join(',')}`)
      continue
    }

    faceData[faceName] = [
      [colorChars[0], colorChars[1], colorChars[2]],
      [colorChars[3], colorChars[4], colorChars[5]],
      [colorChars[6], colorChars[7], colorChars[8]],
    ]
  }

  const missingFaces = ['U', 'R', 'F', 'D', 'L', 'B'].filter(f => !faceData[f])
  if (missingFaces.length > 0) {
    console.warn(`Missing faces: ${missingFaces.join(',')}`)
  }

  return Object.keys(faceData).length === 6 ? faceData : null
}
