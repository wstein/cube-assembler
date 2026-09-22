// Notation output converters for different formats

export interface CubeState {
  u: string[]
  r: string[]
  f: string[]
  d: string[]
  l: string[]
  b: string[]
}

// WRG notation: White-Red-Green (XYZ axis)
export function toWRGNotation(cube: CubeState): string {
  const faces = {
    W: cube.u,
    R: cube.r,
    G: cube.f,
    Y: cube.d,
    O: cube.l,
    B: cube.b,
  }

  const lines: string[] = []
  for (const [letter, stickers] of Object.entries(faces)) {
    lines.push(`${letter}: ${stickers.join(' ')}`)
  }
  return lines.join('\n')
}

// URF notation: Up-Right-Front (Ruwix notation)
export function toURFNotation(cube: CubeState): string {
  const faceOrder = [
    { name: 'U', data: cube.u },
    { name: 'R', data: cube.r },
    { name: 'F', data: cube.f },
    { name: 'D', data: cube.d },
    { name: 'L', data: cube.l },
    { name: 'B', data: cube.b },
  ]

  const lines: string[] = []
  for (const face of faceOrder) {
    // Display as 3x3 grid
    for (let i = 0; i < 3; i++) {
      lines.push(face.data.slice(i * 3, i * 3 + 3).join(' '))
    }
    lines.push('---')
  }
  return lines.join('\n')
}

// Flat notation: single line representation
export function toFlatNotation(cube: CubeState): string {
  const order = ['U', 'R', 'F', 'D', 'L', 'B']
  const faceMap: Record<string, string[]> = {
    U: cube.u,
    R: cube.r,
    F: cube.f,
    D: cube.d,
    L: cube.l,
    B: cube.b,
  }

  return order.map(face => `${face}:${faceMap[face].join('')}`).join(' ')
}

// Matrix/Grid notation: visual representation
export function toGridNotation(cube: CubeState): string {
  const displayFace = (name: string, stickers: string[]): string[] => {
    const lines: string[] = [`${name}:`]
    for (let i = 0; i < 3; i++) {
      lines.push(`  ${stickers[i * 3]} ${stickers[i * 3 + 1]} ${stickers[i * 3 + 2]}`)
    }
    return lines
  }

  const lines: string[] = []
  const faces = [
    { name: 'U', stickers: cube.u },
    { name: 'R', stickers: cube.r },
    { name: 'F', stickers: cube.f },
    { name: 'D', stickers: cube.d },
    { name: 'L', stickers: cube.l },
    { name: 'B', stickers: cube.b },
  ]

  for (const face of faces) {
    lines.push(...displayFace(face.name, face.stickers))
    lines.push('')
  }

  return lines.join('\n')
}

export function notationForFormat(cube: CubeState, format: string): string {
  switch (format.toUpperCase()) {
    case 'WRG':
      return toWRGNotation(cube)
    case 'URF':
      return toURFNotation(cube)
    case 'FLAT':
      return toFlatNotation(cube)
    case 'GRID':
      return toGridNotation(cube)
    default:
      return JSON.stringify(cube, null, 2)
  }
}
