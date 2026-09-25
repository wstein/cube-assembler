import { describe, expect, it } from 'vitest'
import { classifyAcrossFaces, learnStickerColors, type ColorDetectionResult, type RGB } from '../src/client/imageProcessing'

const COLORS: Record<string, RGB> = {
  W: { r: 238, g: 238, b: 232 }, Y: { r: 238, g: 208, b: 32 }, R: { r: 198, g: 40, b: 52 },
  O: { r: 232, g: 112, b: 30 }, G: { r: 32, g: 150, b: 82 }, B: { r: 40, g: 80, b: 200 },
}

// Six solid 3x3 faces with small per-sticker variation; face U is white
// but its center reads as its blue logo, as the plain measurement does.
function faces(): Record<string, ColorDetectionResult> {
  const out: Record<string, ColorDetectionResult> = {}
  const slots: Record<string, string> = { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }
  let k = 0
  for (const [face, color] of Object.entries(slots)) {
    const cellColors = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => {
      const jitter = ((k++ * 37) % 11) - 5
      const base = COLORS[color]
      return { r: base.r + jitter, g: base.g - jitter, b: base.b + jitter }
    }))
    out[face] = {
      colors: cellColors.map((row) => row.map(() => color)),
      cellConfidences: cellColors.map((row) => row.map(() => 0.9)),
      cellColors,
      confidence: 0.9,
    }
  }
  out.U.cellColors[1][1] = { r: 35, g: 75, b: 190 }
  out.U.colors[1][1] = 'B'
  out.U.centerColor = { r: 236, g: 236, b: 230 }
  return out
}

describe('classifyAcrossFaces', () => {
  it("keeps a logo-misread center from pushing another sticker out", () => {
    const measured = faces()
    const truth = (face: string) => measured[face].colors[0][0]

    // The plain balanced assignment: ten blue readings for nine blue slots.
    const samples = Object.entries(measured).flatMap(([, det]) => det.cellColors.flat().map((rgb) => ({ rgb, colorGuess: 'W' })))
    const plain = learnStickerColors(samples)!.labelsBySampleIndex
    const faceOrder = Object.keys(measured)
    const plainWrong = plain.filter((label, i) => {
      const face = faceOrder[Math.floor(i / 9)]
      return label !== truth(face) && !(face === 'U' && i % 9 === 4)
    }).length
    expect(plainWrong).toBeGreaterThan(0)

    const classified = classifyAcrossFaces(measured)
    expect(classified.faces.U.colors[1][1]).toBe('W')
    for (const face of faceOrder) {
      for (const row of classified.faces[face].colors) for (const color of row) expect(color, face).toBe(truth(face))
    }
  })
})
