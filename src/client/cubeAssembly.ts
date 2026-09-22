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
