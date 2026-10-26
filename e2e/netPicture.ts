// A picture of a cube net for the upload specs: a PNG of the cross with U above
// F, L F R B in a row and D below, stickers on a dark background.
import { deflateSync } from 'node:zlib'

const COLORS: Record<string, [number, number, number]> = {
  W: [250, 250, 245],
  Y: [250, 215, 60],
  O: [240, 140, 50],
  R: [200, 40, 45],
  G: [60, 170, 90],
  B: [45, 85, 215],
}
const BLOCKS: Array<[number, number]> = [
  [1, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 1],
  [3, 1],
]

function crc32(data: Buffer): number {
  let crc = ~0
  for (const byte of data) {
    crc ^= byte
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, crc])
}

// `colorsURFDLB`: six space-separated blocks of n x n color letters.
export function netPng(colorsURFDLB: string): Buffer {
  const faces = colorsURFDLB.split(' ')
  const n = Math.sqrt(faces[0].length)
  const cell = 36
  const gap = 4
  const faceGap = 12
  const margin = 16
  const block = n * (cell + gap)
  const width = margin * 2 + 4 * block + 3 * faceGap
  const height = margin * 2 + 3 * block + 2 * faceGap
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0
    for (let x = 0; x < width; x++) {
      const i = y * (width * 3 + 1) + 1 + x * 3
      raw[i] = 13
      raw[i + 1] = 15
      raw[i + 2] = 25
    }
  }
  faces.forEach((face, f) => {
    const [bc, br] = BLOCKS[f]
    const x0 = margin + bc * (block + faceGap)
    const y0 = margin + br * (block + faceGap)
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        const color = COLORS[face[r * n + c]]
        for (let y = 0; y < cell; y++)
          for (let x = 0; x < cell; x++) {
            const px = x0 + c * (cell + gap) + 2 + x
            const py = y0 + r * (cell + gap) + 2 + y
            const i = py * (width * 3 + 1) + 1 + px * 3
            raw[i] = color[0]
            raw[i + 1] = color[1]
            raw[i + 2] = color[2]
          }
      }
  })
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
