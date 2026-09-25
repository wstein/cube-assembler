import { describe, expect, it } from 'vitest'
import { diagnoseFaceDetection } from '../src/client/detectionDiagnostics'

const W = 640, H = 480
const STICKERS = [[220, 105, 30], [30, 150, 80], [240, 240, 235], [200, 40, 50], [40, 80, 200], [240, 210, 30]]

// A 3x3 face (270px, a little right of the 288px guide) on a grey wall;
// `seams` draws the dark lines between its stickers and around it.
function frame(seams: boolean, face = true): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4)
  const x0 = 195, y0 = 105, size = 270, cell = size / 3
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let rgb = [150, 145, 140]
      const u = x - x0, v = y - y0
      if (face && u >= 0 && v >= 0 && u < size && v < size) {
        const inSeam = u % cell < 4 || u % cell > cell - 4 || v % cell < 4 || v % cell > cell - 4
        rgb = seams && inSeam ? [15, 15, 15] : STICKERS[(Math.floor(v / cell) * 3 + Math.floor(u / cell)) % 6]
      }
      data.set([rgb[0], rgb[1], rgb[2], 255], (y * W + x) * 4)
    }
  }
  return data
}

describe('diagnoseFaceDetection', () => {
  it('reports a found face with its bounds', () => {
    const report = diagnoseFaceDetection(frame(true), W, H, 3)
    expect(report.detected).toBe(true)
    expect(report.reason).toBeNull()
    expect(report.alignment.seams).toBe(true)
    expect(Math.abs(report.alignment.centerX - (195 + 135))).toBeLessThan(8)
    expect(report.distinctColors).toBeGreaterThanOrEqual(3)
  })

  it('names no-grid for a colorful face whose lines do not show', () => {
    const report = diagnoseFaceDetection(frame(false), W, H, 3)
    expect(report.detected).toBe(false)
    expect(report.reason).toBe('no-grid')
    // Still clearly a face - what the capture dialog saves for diagnosis.
    expect(report.distinctColors).toBeGreaterThanOrEqual(3)
  })

  it('tells an empty wall apart by its single color', () => {
    const report = diagnoseFaceDetection(frame(false, false), W, H, 3)
    expect(report.reason).toBe('no-grid')
    expect(report.distinctColors).toBe(1)
  })

  it('produces a report that survives JSON', () => {
    const report = diagnoseFaceDetection(frame(true), W, H, 3)
    expect(JSON.parse(JSON.stringify(report))).toEqual(report)
  })
})
