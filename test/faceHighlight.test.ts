import { describe, expect, it } from 'vitest'
import { faceHighlight } from '../src/core/view/FaceHighlight.gen'

describe('object-frame face outline configuration', () => {
  it('defaults to disabled without changing the cube', () => {
    expect(faceHighlight(null, 7)).toEqual({
      normal: [0, 0, 0],
      edgeStart: 3.32,
      neighbors: [],
    })
  })
  it('selects the displayed front and its four adjacent faces, excluding the back', () => {
    expect(faceHighlight('F', 7)).toEqual({
      normal: [0, 0, 1],
      edgeStart: 3.32,
      neighbors: ['U', 'R', 'D', 'L'],
    })
  })
  for (const [face, normal] of [
    ['U', [0, 1, 0]],
    ['R', [1, 0, 0]],
    ['D', [0, -1, 0]],
    ['L', [-1, 0, 0]],
    ['B', [0, 0, -1]],
  ] as const) {
    it(`uses the existing ${face} object-space face axes`, () => {
      const outline = faceHighlight(face, 3)
      expect(outline.normal).toEqual(normal)
      expect(outline.neighbors).toHaveLength(4)
      expect(outline.neighbors).not.toContain(face)
      expect(outline.edgeStart).toBe(1.32)
    })
  }
})
