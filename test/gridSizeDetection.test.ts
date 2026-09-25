import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import jpeg from 'jpeg-js'
import { estimateGridSize } from '../src/client/gridAlignment'

const side = 240

function resize(image: { width: number; height: number; data: Uint8Array }): Uint8ClampedArray {
  const source = Math.min(image.width, image.height)
  const data = new Uint8ClampedArray(side * side * 4)
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const from = (Math.floor(y * source / side) * image.width + Math.floor(x * source / side)) * 4
    data.set(image.data.subarray(from, from + 4), (y * side + x) * 4)
  }
  return data
}

function grid(n: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(side * side * 4)
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const seam = Math.min(x % (side / n), y % (side / n)) < 4
    const color = seam ? 18 : 180 + ((Math.floor(x * n / side) + Math.floor(y * n / side)) % 2) * 40
    data.set([color, color, color, 255], (y * side + x) * 4)
  }
  return data
}

describe('first-face cube size detection', () => {
  for (const n of [2, 3, 4, 5, 6, 7]) {
    it(`counts a ${n}x${n} synthetic sticker grid`, () => {
      expect(estimateGridSize(grid(n), side, side, { x: 0, y: 0, size: side })).toBe(n)
    })
  }

  it('does not choose a size from a plain frame', () => {
    const plain = new Uint8ClampedArray(side * side * 4).fill(150)
    expect(estimateGridSize(plain, side, side, { x: 0, y: 0, size: side })).toBeNull()
  })

  it('does not mistake one-direction stripes for a sticker grid', () => {
    const stripes = new Uint8ClampedArray(side * side * 4)
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const value = x % 40 < 4 ? 20 : 210
      stripes.set([value, value, value, 255], (y * side + x) * 4)
    }
    expect(estimateGridSize(stripes, side, side, { x: 0, y: 0, size: side })).toBeNull()
  })

  const root = join(__dirname, 'fixtures')
  const captures = existsSync(root)
    ? readdirSync(root).filter((name) => name.startsWith('capture-') && existsSync(join(root, name, 'meta.json')))
    : []
  const savedCaptureTest = captures.length ? it : it.skip
  savedCaptureTest('reads the first photographed face of each saved capture', () => {
    for (const name of captures) {
      const meta = JSON.parse(readFileSync(join(root, name, 'meta.json'), 'utf8'))
      const image = jpeg.decode(readFileSync(join(root, name, meta.faces.u.photo)))
      const actual = estimateGridSize(resize(image), side, side, { x: 0, y: 0, size: side })
      expect(actual, name).toBe(meta.gridSize)
    }
  })
})
