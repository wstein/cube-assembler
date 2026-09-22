// Cube state assembly from captured faces

export interface CubeState {
  u: string[]
  r: string[]
  f: string[]
  d: string[]
  l: string[]
  b: string[]
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

export function assembleCubeFromFaces(
  faces: Record<string, string[][]>
): CubeState {
  // Flatten each 3x3 face into a 9-element array
  const flattenFace = (face: string[][]): string[] => {
    return face.flat()
  }

  const cubeState: CubeState = {
    u: flattenFace(faces.U || [['W','W','W'],['W','W','W'],['W','W','W']]),
    r: flattenFace(faces.R || [['R','R','R'],['R','R','R'],['R','R','R']]),
    f: flattenFace(faces.F || [['G','G','G'],['G','G','G'],['G','G','G']]),
    d: flattenFace(faces.D || [['Y','Y','Y'],['Y','Y','Y'],['Y','Y','Y']]),
    l: flattenFace(faces.L || [['O','O','O'],['O','O','O'],['O','O','O']]),
    b: flattenFace(faces.B || [['B','B','B'],['B','B','B'],['B','B','B']]),
  }

  return cubeState
}

export function faceColorsToString(colors: string[][]): string {
  return colors.map(row => row.join(' ')).join('\n')
}

export function validateFaceColors(colors: string[][]): boolean {
  if (colors.length !== 3) return false

  const validColors = new Set(['W', 'Y', 'O', 'R', 'G', 'B'])

  for (const row of colors) {
    if (row.length !== 3) return false
    for (const color of row) {
      if (!validColors.has(color)) return false
    }
  }

  return true
}

export function createSolvedCube(): CubeState {
  return {
    u: Array(9).fill('W'),
    r: Array(9).fill('R'),
    f: Array(9).fill('G'),
    d: Array(9).fill('Y'),
    l: Array(9).fill('O'),
    b: Array(9).fill('B'),
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
