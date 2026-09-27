import { describe, expect, it } from 'vitest'
import {
  SHADOW_OUTLINE_POINTS,
  paddedOutline,
  rotateModelPoint,
  shadowFloorY,
  shadowOutline,
} from '../src/client/cubeShadow'
import { mat4Create, mat4RotateX, mat4RotateY } from '../src/client/cubeView3D'

function area(points: [number, number][]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, z0] = points[i]
    const [x1, z1] = points[(i + 1) % points.length]
    sum += x0 * z1 - x1 * z0
  }
  return sum / 2
}

describe('cube shadow', () => {
  it('rotates points like the view model matrix', () => {
    const pitch = 0.42
    const yaw = -0.62
    const model = mat4Create()
    mat4RotateX(model, model, pitch)
    mat4RotateY(model, model, yaw)
    const p: [number, number, number] = [0.3, -1.2, 2.1]
    const expected = [0, 1, 2].map(
      (row) =>
        model[row] * p[0] + model[4 + row] * p[1] + model[8 + row] * p[2],
    )
    const got = rotateModelPoint(p, pitch, yaw)
    got.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 5))
  })

  it('lies on a floor below the cube in every orientation', () => {
    for (const n of [2, 3, 7]) {
      const radius = (n / 2) * Math.sqrt(3)
      expect(shadowFloorY(n)).toBeLessThan(-radius)
    }
  })

  it('is a convex outline that turns with the cube', () => {
    const square = shadowOutline(3, 0, 0)
    const turned = shadowOutline(3, 0, Math.PI / 4)
    expect(square).toHaveLength(4)
    expect(turned).toHaveLength(4)
    // Turning the cube on the vertical axis keeps the footprint's size but
    // changes its shape on the floor.
    expect(Math.abs(area(turned))).toBeCloseTo(Math.abs(area(square)), 6)
    expect(turned).not.toEqual(square)
    // Tilting shows more of the cube, so the shadow grows.
    expect(Math.abs(area(shadowOutline(3, 0.42, -0.62)))).toBeGreaterThan(
      Math.abs(area(square)),
    )
    for (const outline of [square, turned, shadowOutline(7, 0.42, -0.62)]) {
      // Counter-clockwise without reflex corners: convex.
      for (let i = 0; i < outline.length; i++) {
        const [ax, az] = outline[i]
        const [bx, bz] = outline[(i + 1) % outline.length]
        const [cx, cz] = outline[(i + 2) % outline.length]
        expect((bx - ax) * (cz - az) - (bz - az) * (cx - ax)).toBeGreaterThan(0)
      }
    }
  })

  it('pads the outline to the shader size by repeating its last corner', () => {
    const outline = shadowOutline(3, 0.42, -0.62)
    const padded = paddedOutline(outline)
    expect(padded).toHaveLength(SHADOW_OUTLINE_POINTS * 2)
    const last = outline[outline.length - 1]
    expect(Array.from(padded.slice(-2))).toEqual([
      Math.fround(last[0]),
      Math.fround(last[1]),
    ])
  })
})
