import { describe, expect, it } from 'vitest'
import { createSolvedCube } from '../src/client/cubeAssembly'
import {
  buildCubeMesh,
  getFaceletColor,
  getFaceSeams,
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

  describe('getFaceSeams', () => {
    it('identifies all 4 seams on center facelets of 3x3', () => {
      // U center (x=1, y=2, z=1)
      expect(getFaceSeams('u', 1, 2, 1, 3)).toEqual({
        top: true,
        bot: true,
        rt: true,
        lt: true,
      })
      // F center (x=1, y=1, z=2)
      expect(getFaceSeams('f', 1, 1, 2, 3)).toEqual({
        top: true,
        bot: true,
        rt: true,
        lt: true,
      })
    })

    it('identifies outer cube edges on corner facelets (no seam on cube boundary)', () => {
      // U top-front-right corner (x=2, y=2, z=2)
      // On U: +X is right (boundary), +Z is bot (boundary), -Z is top (seam), -X is lt (seam)
      expect(getFaceSeams('u', 2, 2, 2, 3)).toEqual({
        top: true,
        bot: false,
        rt: false,
        lt: true,
      })
      // R top-front-right corner (x=2, y=2, z=2)
      // On R: +Y is top (boundary to U), +Z is lt (boundary to F)
      expect(getFaceSeams('r', 2, 2, 2, 3)).toEqual({
        top: false,
        bot: true,
        rt: true,
        lt: false,
      })
      // F top-front-right corner (x=2, y=2, z=2)
      // On F: +Y is top (boundary to U), +X is rt (boundary to R)
      expect(getFaceSeams('f', 2, 2, 2, 3)).toEqual({
        top: false,
        bot: true,
        rt: false,
        lt: true,
      })
    })
  })

  describe('buildCubeMesh', () => {
    it('builds valid rounded mesh for 2x2 cube in stickerless mode', () => {
      const cube = createSolvedCube(2)
      const mesh = buildCubeMesh(cube, 2, undefined, true)

      expect(mesh.vertexCount).toBeGreaterThan(0)
      expect(mesh.indexCount).toBeGreaterThan(0)
      expect(mesh.positions.length).toBe(mesh.vertexCount * 3)
      expect(mesh.normals.length).toBe(mesh.vertexCount * 3)
      expect(mesh.colors.length).toBe(mesh.vertexCount * 3)
      expect(mesh.indices.length).toBe(mesh.indexCount)

      // Verify index bounds
      for (let i = 0; i < mesh.indices.length; i++) {
        expect(mesh.indices[i]).toBeLessThan(mesh.vertexCount)
      }
    })

    it('builds valid rounded mesh for 3x3 cube in stickerless mode', () => {
      const cube = createSolvedCube(3)
      const mesh = buildCubeMesh(cube, 3, undefined, true)

      expect(mesh.vertexCount).toBeGreaterThan(0)
      expect(mesh.indexCount).toBeGreaterThan(0)
      for (let i = 0; i < mesh.indices.length; i++) {
        expect(mesh.indices[i]).toBeLessThan(mesh.vertexCount)
      }
    })

    it('builds valid rounded mesh in stickered mode', () => {
      const cube = createSolvedCube(3)
      const mesh = buildCubeMesh(cube, 3, undefined, false)

      expect(mesh.vertexCount).toBeGreaterThan(0)
      expect(mesh.indexCount).toBeGreaterThan(0)
      for (let i = 0; i < mesh.indices.length; i++) {
        expect(mesh.indices[i]).toBeLessThan(mesh.vertexCount)
      }
    })

    it('builds valid rounded mesh for 5x5 cube', () => {
      const cube = createSolvedCube(5)
      const mesh = buildCubeMesh(cube, 5)

      expect(mesh.vertexCount).toBeGreaterThan(0)
      expect(mesh.indexCount).toBeGreaterThan(0)
      for (let i = 0; i < mesh.indices.length; i++) {
        expect(mesh.indices[i]).toBeLessThan(mesh.vertexCount)
      }
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
