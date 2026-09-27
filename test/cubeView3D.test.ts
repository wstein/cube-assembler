import { describe, expect, it } from 'vitest'
import { createSolvedCube } from '../src/client/cubeAssembly'
import {
  buildCubeMesh,
  getFaceletColor,
  hexToRgb,
  mat4Create,
  mat4Multiply,
  mat4Perspective,
  mat4RotateX,
  mat4RotateY,
  mat4Translate,
} from '../src/client/cubeView3D'

describe('cubeView3D math and geometry', () => {
  describe('hexToRgb', () => {
    it('converts 6-digit hex color to normalized RGB', () => {
      const rgb = hexToRgb('#ff0000')
      expect(rgb[0]).toBeCloseTo(1.0)
      expect(rgb[1]).toBeCloseTo(0.0)
      expect(rgb[2]).toBeCloseTo(0.0)
    })

    it('converts 3-digit hex color to normalized RGB', () => {
      const rgb = hexToRgb('#0f0')
      expect(rgb[0]).toBeCloseTo(0.0)
      expect(rgb[1]).toBeCloseTo(1.0)
      expect(rgb[2]).toBeCloseTo(0.0)
    })

    it('converts custom hex colors accurately', () => {
      const rgb = hexToRgb('#f7f6f1')
      expect(rgb[0]).toBeCloseTo(247 / 255)
      expect(rgb[1]).toBeCloseTo(246 / 255)
      expect(rgb[2]).toBeCloseTo(241 / 255)
    })
  })

  describe('getFaceletColor', () => {
    it('indexes facelets correctly for solved 3x3 cube', () => {
      const cube = createSolvedCube(3)
      // U face top-left (x=0, y=2, z=0)
      expect(getFaceletColor(cube, 3, 'u', 0, 2, 0)).toBe('W')
      // F face center (x=1, y=1, z=2)
      expect(getFaceletColor(cube, 3, 'f', 1, 1, 2)).toBe('G')
      // R face center (x=2, y=1, z=1)
      expect(getFaceletColor(cube, 3, 'r', 2, 1, 1)).toBe('R')
      // D face center (x=1, y=0, z=1)
      expect(getFaceletColor(cube, 3, 'd', 1, 0, 1)).toBe('Y')
      // B face center (x=1, y=1, z=0)
      expect(getFaceletColor(cube, 3, 'b', 1, 1, 0)).toBe('B')
      // L face center (x=0, y=1, z=1)
      expect(getFaceletColor(cube, 3, 'l', 0, 1, 1)).toBe('O')
    })
  })

  describe('buildCubeMesh', () => {
    it('builds valid mesh for 2x2 cube (8 cubies, 24 stickers)', () => {
      const cube = createSolvedCube(2)
      const mesh = buildCubeMesh(cube, 2)

      // 8 cubies * 6 box faces + 24 stickers = 48 + 24 = 72 quads
      // 72 quads * 4 vertices = 288 vertices
      // 72 quads * 6 indices = 432 indices
      expect(mesh.vertexCount).toBe(288)
      expect(mesh.indexCount).toBe(432)
      expect(mesh.positions.length).toBe(288 * 3)
      expect(mesh.normals.length).toBe(288 * 3)
      expect(mesh.colors.length).toBe(288 * 3)
      expect(mesh.indices.length).toBe(432)

      // Verify index bounds
      for (let i = 0; i < mesh.indices.length; i++) {
        expect(mesh.indices[i]).toBeLessThan(mesh.vertexCount)
      }
    })

    it('builds valid mesh for 3x3 cube (26 cubies, 54 stickers)', () => {
      const cube = createSolvedCube(3)
      const mesh = buildCubeMesh(cube, 3)

      // 26 cubies * 6 box faces + 54 stickers = 156 + 54 = 210 quads
      // 210 * 4 = 840 vertices
      // 210 * 6 = 1260 indices
      expect(mesh.vertexCount).toBe(840)
      expect(mesh.indexCount).toBe(1260)
    })

    it('builds valid mesh for 5x5 cube', () => {
      const cube = createSolvedCube(5)
      const mesh = buildCubeMesh(cube, 5)

      // 5^3 - 3^3 = 125 - 27 = 98 cubies
      // 98 * 6 = 588 box faces + 6 * 25 stickers = 588 + 150 = 738 quads
      // 738 * 4 = 2952 vertices
      // 738 * 6 = 4428 indices
      expect(mesh.vertexCount).toBe(2952)
      expect(mesh.indexCount).toBe(4428)
    })
  })

  describe('matrix operations', () => {
    it('creates identity matrix', () => {
      const m = mat4Create()
      expect(m[0]).toBe(1)
      expect(m[5]).toBe(1)
      expect(m[10]).toBe(1)
      expect(m[15]).toBe(1)
      expect(m[1]).toBe(0)
    })

    it('translates matrix', () => {
      const m = mat4Create()
      mat4Translate(m, m, [2, 3, -5])
      expect(m[12]).toBe(2)
      expect(m[13]).toBe(3)
      expect(m[14]).toBe(-5)
    })

    it('rotates matrix around X and Y axes', () => {
      const m = mat4Create()
      mat4RotateX(m, m, Math.PI / 2)
      expect(m[5]).toBeCloseTo(0)
      expect(m[6]).toBeCloseTo(1)

      const my = mat4Create()
      mat4RotateY(my, my, Math.PI)
      expect(my[0]).toBeCloseTo(-1)
      expect(my[10]).toBeCloseTo(-1)
    })

    it('multiplies matrices', () => {
      const a = mat4Create()
      const b = mat4Create()
      mat4Translate(a, a, [1, 2, 3])
      mat4Translate(b, b, [4, 5, 6])
      const out = mat4Create()
      mat4Multiply(out, a, b)
      expect(out[12]).toBe(5)
      expect(out[13]).toBe(7)
      expect(out[14]).toBe(9)
    })

    it('computes perspective projection', () => {
      const proj = mat4Perspective(
        mat4Create(),
        (45 * Math.PI) / 180,
        1.0,
        0.1,
        100,
      )
      expect(proj[0]).toBeGreaterThan(0)
      expect(proj[5]).toBeGreaterThan(0)
      expect(proj[11]).toBe(-1)
    })
  })
})
