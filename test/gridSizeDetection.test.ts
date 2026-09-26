import { describe, expect, it } from 'vitest'
import { estimateFaceGridSize, type FaceSquare } from '../src/client/gridAlignment'
import { placed, scene, type Look } from './syntheticFace'

const GUIDE = 300
// The live search area of a 720p frame is 1.67 guides tall (alignmentArea,
// clipped by the frame).
const FRAME = 1.67

function guideOf(): FaceSquare {
  const width = Math.round(GUIDE * FRAME)
  return { x: (width - GUIDE) / 2, y: (width - GUIDE) / 2, size: GUIDE }
}

// Big cubes have wider perimeter cubies (see cellEdges).
function outerFor(gridSize: number): number {
  return gridSize >= 6 ? 1.5 : gridSize === 5 ? 1.15 : 1
}

function estimate(gridSize: number, dx: number, dy: number, scale: number, look: Look = {}): number | null {
  const guide = guideOf()
  const { data, width, height } = scene(gridSize, placed(guide, dx, dy, scale), GUIDE, { outer: outerFor(gridSize), ...look }, FRAME)
  return estimateFaceGridSize(data, width, height, guide)
}

describe('estimateFaceGridSize', () => {
  for (const gridSize of [2, 3, 4, 5, 6, 7]) {
    it(`reads a ${gridSize}x${gridSize} face centered, off-center and at other sizes`, () => {
      for (const [dx, dy, scale] of [[0, 0, 1], [0.05, -0.03, 1], [-0.1, 0.08, 0.9], [0.12, 0.1, 0.8], [-0.04, -0.06, 1.15]]) {
        expect(estimate(gridSize, dx, dy, scale), `offset ${dx},${dy} scale ${scale}`).toBe(gridSize)
      }
    })
  }

  for (const gridSize of [3, 4, 7]) {
    it(`reads a tilted ${gridSize}x${gridSize} face`, () => {
      expect(estimate(gridSize, 0.03, -0.02, 0.95, { tilt: 12 })).toBe(gridSize)
    })
  }

  it('never names a wrong size for a face anywhere in reach', () => {
    const wrong: string[] = []
    for (const gridSize of [2, 3, 4, 5, 6, 7]) {
      for (const scale of [0.75, 0.9, 1.05, 1.2]) {
        for (const dx of [-0.15, -0.05, 0.05, 0.15]) {
          for (const dy of [-0.1, 0.1]) {
            const found = estimate(gridSize, dx, dy, scale)
            if (found !== null && found !== gridSize) wrong.push(`${gridSize}x${gridSize} at ${dx},${dy} x${scale}: ${found}`)
          }
        }
      }
    }
    expect(wrong).toEqual([])
  }, 60_000)

  it('names no size, or the right one, for a stickerless face with faint lines', () => {
    const found = estimate(7, -0.04, 0.05, 0.95, { seam: [215, 215, 212], gap: 0.05, sticker: () => [240, 240, 236] })
    expect([7, null]).toContain(found)
  })

  it('names no size for a face without grid lines', () => {
    expect(estimate(3, 0, 0, 1, { seam: null, sticker: () => [200, 40, 50] })).toBeNull()
  })

  it('names no size on a plain background', () => {
    const guide = guideOf()
    const width = Math.round(GUIDE * FRAME)
    const data = new Uint8ClampedArray(width * width * 4).fill(128)
    expect(estimateFaceGridSize(data, width, width, guide)).toBeNull()
  })

  it('names no size for stripes filling the view', () => {
    const guide = guideOf()
    const width = Math.round(GUIDE * FRAME)
    const data = new Uint8ClampedArray(width * width * 4)
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        const v = Math.floor(x / 37) % 2 ? 40 : 210
        data.set([v, v, v, 255], (y * width + x) * 4)
      }
    }
    expect(estimateFaceGridSize(data, width, width, guide)).toBeNull()
  })
})
