import { describe, expect, it } from 'vitest'
import { eulerPitchYaw } from '../src/client/view3d/puzlwerkOrientation'

const rotate = (q: number[], v: number[]) => {
  // v' = q * v * q^-1 for a unit quaternion
  const [x, y, z, w] = q
  const [a, b, c] = v
  const tx = 2 * (y * c - z * b)
  const ty = 2 * (z * a - x * c)
  const tz = 2 * (x * b - y * a)
  return [
    a + w * tx + (y * tz - z * ty),
    b + w * ty + (z * tx - x * tz),
    c + w * tz + (x * ty - y * tx),
  ]
}

describe('eulerPitchYaw', () => {
  it('is a unit quaternion', () => {
    for (const [p, y] of [
      [0.52, -0.74],
      [0, 0],
      [1, 2],
    ])
      expect(Math.hypot(...eulerPitchYaw(p, y))).toBeCloseTo(1, 12)
  })
  it('turns about x for pitch only and about y for yaw only', () => {
    const half = Math.PI / 2
    const pitched = rotate(eulerPitchYaw(half, 0), [0, 0, 1])
    expect(pitched[1]).toBeCloseTo(-1, 12)
    const yawed = rotate(eulerPitchYaw(0, half), [0, 0, 1])
    expect(yawed[0]).toBeCloseTo(1, 12)
  })
  it('applies yaw first about the fixed y axis, then pitch (XYZ Euler order)', () => {
    const v = rotate(eulerPitchYaw(Math.PI / 2, Math.PI / 2), [0, 0, 1])
    // z -> x by yaw, x stays under pitch about x
    expect(v[0]).toBeCloseTo(1, 12)
    expect(v[1]).toBeCloseTo(0, 12)
    expect(v[2]).toBeCloseTo(0, 12)
  })
})
