import { describe, expect, it } from 'vitest'
import { createSolvedCube } from '../src/cube/cubeAssembly'
import {
  applyCubeMove,
  applyCubeLayerMove,
  buildCubeMesh,
  cubeStateToFaces,
  facesToCubeState,
  formatCubeTurn,
  generateScrambleMoves,
  getDefaultZoom,
  getFaceletColor,
  getFaceSeams,
  hexToRgb,
  mat4Create,
  mat4Multiply,
  mat4Perspective,
  mat4RotateX,
  mat4RotateY,
  mat4Translate,
  type CubeTurn,
  recordTurn,
  rotateVec,
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

    it('generates spherical corner cap apex normals on outer corner cubies', () => {
      const cube = createSolvedCube(3)
      const mesh = buildCubeMesh(cube, 3, undefined, true)

      let foundCornerApexNormal = false
      for (let i = 0; i < mesh.vertexCount; i++) {
        const nx = mesh.normals[i * 3]
        const ny = mesh.normals[i * 3 + 1]
        const nz = mesh.normals[i * 3 + 2]
        const len = Math.hypot(nx, ny, nz)
        expect(len).toBeCloseTo(1.0, 3)

        // Check for presence of normalized (1, 1, 1) corner normal
        if (
          Math.abs(Math.abs(nx) - 0.57735) < 0.01 &&
          Math.abs(Math.abs(ny) - 0.57735) < 0.01 &&
          Math.abs(Math.abs(nz) - 0.57735) < 0.01
        ) {
          foundCornerApexNormal = true
        }
      }
      expect(foundCornerApexNormal).toBe(true)
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

    it('builds valid rounded mesh for 6x6 cube in both stickered and stickerless modes', () => {
      const cube = createSolvedCube(6)
      const stickerlessMesh = buildCubeMesh(cube, 6, undefined, true)
      expect(stickerlessMesh.vertexCount).toBeGreaterThan(0)
      expect(stickerlessMesh.indexCount).toBeGreaterThan(0)
      for (let i = 0; i < stickerlessMesh.indices.length; i++) {
        expect(stickerlessMesh.indices[i]).toBeLessThan(
          stickerlessMesh.vertexCount,
        )
      }

      const stickeredMesh = buildCubeMesh(cube, 6, undefined, false)
      expect(stickeredMesh.vertexCount).toBeGreaterThan(0)
      expect(stickeredMesh.indexCount).toBeGreaterThan(0)
      for (let i = 0; i < stickeredMesh.indices.length; i++) {
        expect(stickeredMesh.indices[i]).toBeLessThan(stickeredMesh.vertexCount)
      }
    })

    it('builds valid rounded mesh for 7x7 cube in both stickered and stickerless modes', () => {
      const cube = createSolvedCube(7)
      const stickerlessMesh = buildCubeMesh(cube, 7, undefined, true)
      expect(stickerlessMesh.vertexCount).toBeGreaterThan(0)
      expect(stickerlessMesh.indexCount).toBeGreaterThan(0)
      for (let i = 0; i < stickerlessMesh.indices.length; i++) {
        expect(stickerlessMesh.indices[i]).toBeLessThan(
          stickerlessMesh.vertexCount,
        )
      }

      const stickeredMesh = buildCubeMesh(cube, 7, undefined, false)
      expect(stickeredMesh.vertexCount).toBeGreaterThan(0)
      expect(stickeredMesh.indexCount).toBeGreaterThan(0)
      for (let i = 0; i < stickeredMesh.indices.length; i++) {
        expect(stickeredMesh.indices[i]).toBeLessThan(stickeredMesh.vertexCount)
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

  describe('seam junctions', () => {
    type Vec = [number, number, number]
    // Nearest front-facing hit along a ray; back faces are culled on screen.
    function nearestHit(
      mesh: ReturnType<typeof buildCubeMesh>,
      tris: number[],
      o: Vec,
      d: Vec,
    ) {
      const p = mesh.positions
      const idx = mesh.indices
      let best = Infinity
      for (const i of tris) {
        const a = idx[i] * 3
        const b = idx[i + 1] * 3
        const c = idx[i + 2] * 3
        const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]
        const e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
        const q = [
          d[1] * e2[2] - d[2] * e2[1],
          d[2] * e2[0] - d[0] * e2[2],
          d[0] * e2[1] - d[1] * e2[0],
        ]
        const det = e1[0] * q[0] + e1[1] * q[1] + e1[2] * q[2]
        if (det < 1e-12) continue
        const s = [o[0] - p[a], o[1] - p[a + 1], o[2] - p[a + 2]]
        const u = (s[0] * q[0] + s[1] * q[1] + s[2] * q[2]) / det
        if (u < 0 || u > 1) continue
        const r = [
          s[1] * e1[2] - s[2] * e1[1],
          s[2] * e1[0] - s[0] * e1[2],
          s[0] * e1[1] - s[1] * e1[0],
        ]
        const v = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / det
        if (v < 0 || u + v > 1) continue
        const t = (e2[0] * r[0] + e2[1] * r[1] + e2[2] * r[2]) / det
        if (t > 0 && t < best) best = t
      }
      return best
    }

    for (const n of [3, 7])
      for (const stickerless of [true, false])
        it(`closes every junction of four cubies on a ${n}x${n} (${stickerless ? 'stickerless' : 'stickered'})`, () => {
          const mesh = buildCubeMesh(
            createSolvedCube(n),
            n,
            undefined,
            stickerless,
          )
          const half = n / 2
          // Junctions of four cubies on the front face, and where a seam
          // meets the top edge. Edge rays must head down into the cube;
          // rising rays near the edge can leave it legitimately.
          const junctions: [number, number, boolean][] = []
          for (let i = 1; i < n; i++)
            for (let j = 1; j < n; j++)
              junctions.push([i - half, j - half, false])
          for (let i = 1; i < n; i++)
            junctions.push([i - half, half - 0.035, true])
          const views: Vec[] = [
            [-0.35, -0.5, -1],
            [0.6, 0.4, -1],
            [-0.2, 0.7, -1],
            [0.5, -0.4, -1],
          ]
          // Only the front surface near a junction can stop its rays within
          // the groove depth; casting against just that keeps this fast.
          const front: { i: number; box: number[] }[] = []
          for (let i = 0; i < mesh.indices.length; i += 3) {
            const corners = [0, 1, 2].map((k) => mesh.indices[i + k] * 3)
            const xs = corners.map((c) => mesh.positions[c])
            const ys = corners.map((c) => mesh.positions[c + 1])
            const zs = corners.map((c) => mesh.positions[c + 2])
            if (Math.max(...zs) > half - 0.6)
              front.push({
                i,
                box: [
                  Math.min(...xs),
                  Math.max(...xs),
                  Math.min(...ys),
                  Math.max(...ys),
                ],
              })
          }
          const nearby = junctions.map(([jx, jy]) =>
            front
              .filter(
                ({ box }) =>
                  box[1] > jx - 0.6 &&
                  box[0] < jx + 0.6 &&
                  box[3] > jy - 0.6 &&
                  box[2] < jy + 0.6,
              )
              .map(({ i }) => i),
          )
          const leaks: string[] = []
          for (const view of views) {
            const len = Math.hypot(...view)
            const d = view.map((x) => x / len) as Vec
            for (const [k, [jx, jy, edge]] of junctions.entries()) {
              if (edge && d[1] >= 0) continue
              const near = nearby[k]
              for (let i = -4; i <= 4; i++)
                for (let j = -4; j <= 4; j++) {
                  const target: Vec = [
                    jx + i * 0.008,
                    jy + j * 0.008,
                    half - 0.01,
                  ]
                  const o: Vec = [
                    target[0] - d[0] * 10,
                    target[1] - d[1] * 10,
                    target[2] - d[2] * 10,
                  ]
                  // Anything farther than the groove depth is the far side of
                  // the cube or the background showing through.
                  if (nearestHit(mesh, near, o, d) > 10.3)
                    leaks.push(
                      `${view.join()} @ ${target.map((x) => x.toFixed(3)).join()}`,
                    )
                }
            }
          }
          expect(leaks.slice(0, 5)).toEqual([])
        })
  })

  describe('getDefaultZoom', () => {
    it('scales sublinearly so larger cubes scale less and stay prominent', () => {
      // 3x3 baseline
      expect(getDefaultZoom(3)).toBeCloseTo(8.4)
      // 2x2
      expect(getDefaultZoom(2)).toBeCloseTo(6.6)
      // 5x5: scales less than linear 5 * 2.8 = 14.0
      expect(getDefaultZoom(5)).toBeLessThan(5 * 2.8)
      expect(getDefaultZoom(5)).toBeCloseTo(12.0)
      // 6x6: scales less than linear 6 * 2.8 = 16.8
      expect(getDefaultZoom(6)).toBeLessThan(6 * 2.8)
      expect(getDefaultZoom(6)).toBeCloseTo(13.8)
      // 7x7: scales less than linear 7 * 2.8 = 19.6
      expect(getDefaultZoom(7)).toBeLessThan(7 * 2.8)
      expect(getDefaultZoom(7)).toBeCloseTo(15.6)
    })
  })

  describe('rotateVec', () => {
    it('rotates vectors 90 degrees around X, Y, and Z axes', () => {
      const v: [number, number, number] = [0, 1, 0]
      // 90 deg around Z carries [0, 1, 0] to [-1, 0, 0]
      const rz = rotateVec(v, 'z', Math.PI / 2)
      expect(rz[0]).toBeCloseTo(-1)
      expect(rz[1]).toBeCloseTo(0)
      expect(rz[2]).toBeCloseTo(0)

      // 90 deg around X carries [0, 1, 0] to [0, 0, 1]
      const rx = rotateVec(v, 'x', Math.PI / 2)
      expect(rx[0]).toBeCloseTo(0)
      expect(rx[1]).toBeCloseTo(0)
      expect(rx[2]).toBeCloseTo(1)

      // 90 deg around Y carries [1, 0, 0] to [0, 0, -1]
      const ry = rotateVec([1, 0, 0], 'y', Math.PI / 2)
      expect(ry[0]).toBeCloseTo(0)
      expect(ry[1]).toBeCloseTo(0)
      expect(ry[2]).toBeCloseTo(-1)
    })
  })

  describe('interactive layer turns and scramble', () => {
    it('labels outer and inner turns unambiguously', () => {
      expect(formatCubeTurn({ face: 'R', depth: 1, turns: 1 })).toBe('R')
      expect(formatCubeTurn({ face: 'U', depth: 1, turns: -1 })).toBe("U'")
      expect(formatCubeTurn({ face: 'L', depth: 2, turns: -1 })).toBe("2L'")
      expect(formatCubeTurn({ face: 'F', depth: 3, turns: 2 })).toBe('3F2')
    })

    it('records a turn that reverses the last one as its undo and accumulates same-layer turns', () => {
      const r = { face: 'R' as const, depth: 1, turns: 1 }
      expect(recordTurn([r], { ...r, turns: -1 })).toEqual([])
      expect(recordTurn([{ ...r, turns: 2 }], { ...r, turns: -2 })).toEqual([])
      expect(recordTurn([r], { ...r, depth: 2, turns: -1 })).toEqual([
        r,
        { ...r, depth: 2, turns: -1 },
      ])
      // R R => R2
      expect(recordTurn([r], r)).toEqual([{ ...r, turns: 2 }])
      // R2 R => R'
      expect(recordTurn([{ ...r, turns: 2 }], r)).toEqual([{ ...r, turns: -1 }])
      // R' R => cancels
      expect(recordTurn([{ ...r, turns: -1 }], r)).toEqual([])
      // R R R => R'
      expect(recordTurn(recordTurn([r], r), r)).toEqual([{ ...r, turns: -1 }])
      // R' R' => R2
      expect(recordTurn([{ ...r, turns: -1 }], { ...r, turns: -1 })).toEqual([
        { ...r, turns: 2 },
      ])
      // R' R' R' R' R' => R'
      let fiveCounterClockwise: CubeTurn[] = []
      for (let i = 0; i < 5; i++) {
        fiveCounterClockwise = recordTurn(fiveCounterClockwise, {
          ...r,
          turns: -1,
        })
      }
      expect(fiveCounterClockwise).toEqual([{ ...r, turns: -1 }])
      // R R R R R => R
      let fiveClockwise: CubeTurn[] = []
      for (let i = 0; i < 5; i++) {
        fiveClockwise = recordTurn(fiveClockwise, r)
      }
      expect(fiveClockwise).toEqual([r])
    })

    it('records a multi-turn drag as its shortest turn', () => {
      const u = { face: 'U' as const, depth: 1 }
      expect(recordTurn([], { ...u, turns: 3 })).toEqual([{ ...u, turns: -1 }])
      expect(recordTurn([], { ...u, turns: -2 })).toEqual([{ ...u, turns: 2 }])
      expect(recordTurn([], { ...u, turns: 5 })).toEqual([{ ...u, turns: 1 }])
      expect(recordTurn([], { ...u, turns: -4 })).toEqual([])
    })

    it('roundtrips CubeState to Faces and back', () => {
      const cube = createSolvedCube(3)
      const faces = cubeStateToFaces(cube, 3)
      const back = facesToCubeState(faces)
      expect(back).toEqual(cube)
    })

    it('4 quarter turns of any face return cube to solved state', () => {
      const solved = createSolvedCube(3)
      for (const face of ['U', 'D', 'L', 'R', 'F', 'B'] as const) {
        let c = solved
        for (let i = 0; i < 4; i++) {
          c = applyCubeMove(c, 3, face, 1)
        }
        expect(c).toEqual(solved)
      }
    })

    it('a clockwise turn followed by counter-clockwise turn returns to solved state', () => {
      const solved = createSolvedCube(3)
      for (const face of ['U', 'D', 'L', 'R', 'F', 'B'] as const) {
        const turned = applyCubeMove(solved, 3, face, 1)
        expect(turned).not.toEqual(solved)
        const restored = applyCubeMove(turned, 3, face, -1)
        expect(restored).toEqual(solved)
      }
    })

    it('turns one inner slice without moving the outer face', () => {
      const solved = createSolvedCube(5)
      const turned = applyCubeLayerMove(solved, 5, 'R', 3, 1)
      expect(turned.r).toEqual(solved.r)
      expect(turned.l).toEqual(solved.l)
      expect(turned.f).not.toEqual(solved.f)
      expect(applyCubeLayerMove(turned, 5, 'R', 3, -1)).toEqual(solved)
    })

    it('roundtrips every inner slice on 4x4 through 7x7 cubes', () => {
      for (let size = 4; size <= 7; size++) {
        const solved = createSolvedCube(size)
        for (let depth = 2; depth < size; depth++) {
          const turned = applyCubeLayerMove(solved, size, 'U', depth, 1)
          expect(turned.u).toEqual(solved.u)
          expect(applyCubeLayerMove(turned, size, 'U', depth, -1)).toEqual(
            solved,
          )
        }
      }
    })

    it('scales scramble length and layer depths to the cube size', () => {
      const lengths = [11, 20, 40, 60, 80, 100]
      for (let size = 2; size <= 7; size++) {
        const moves = generateScrambleMoves(size)
        expect(moves).toHaveLength(lengths[size - 2])
        expect(
          moves.every(
            (move) => move.depth >= 1 && move.depth <= Math.floor(size / 2),
          ),
        ).toBe(true)
        if (size >= 4) expect(moves.some((move) => move.depth > 1)).toBe(true)
        for (let i = 1; i < moves.length; i++) {
          const axis = (face: string) =>
            'RL'.includes(face) ? 'x' : 'UD'.includes(face) ? 'y' : 'z'
          expect(axis(moves[i].face)).not.toBe(axis(moves[i - 1].face))
        }
      }
    })

    it('builds mesh with animated turning layer rotated properly without crashing', () => {
      const solved = createSolvedCube(3)
      const staticMesh = buildCubeMesh(solved, 3)
      const turningMesh = buildCubeMesh(solved, 3, undefined, true, {
        face: 'U',
        angle: Math.PI / 4, // 45 degree mid-turn
      })

      expect(turningMesh.vertexCount).toBe(staticMesh.vertexCount)
      expect(turningMesh.indexCount).toBe(staticMesh.indexCount)
      // Turning layer vertices moved
      let changedVertices = 0
      for (let i = 0; i < turningMesh.positions.length; i += 3) {
        if (
          Math.abs(turningMesh.positions[i] - staticMesh.positions[i]) > 1e-4 ||
          Math.abs(turningMesh.positions[i + 2] - staticMesh.positions[i + 2]) >
            1e-4
        ) {
          changedVertices++
        }
      }
      expect(changedVertices).toBeGreaterThan(0)
    })

    it('closes both sides of a turning cut with dark cubie interiors', () => {
      const mesh = buildCubeMesh(createSolvedCube(3), 3, undefined, true, {
        face: 'U',
        angle: Math.PI / 4,
      })
      const dark = [0.11, 0.11, 0.12]
      const cutFaces = new Set<'upper' | 'lower'>()
      for (let i = 0; i < mesh.positions.length; i += 9) {
        if (
          dark.some(
            (value, channel) =>
              Math.abs(mesh.colors[i + channel] - value) > 1e-5,
          )
        )
          continue
        const y =
          (mesh.positions[i + 1] +
            mesh.positions[i + 4] +
            mesh.positions[i + 7]) /
          3
        const normalY = mesh.normals[i + 1]
        if (Math.abs(y - 0.5) < 0.04 && normalY > 0.9) cutFaces.add('lower')
        if (Math.abs(y - 0.5) < 0.04 && normalY < -0.9) cutFaces.add('upper')
      }
      expect(cutFaces).toEqual(new Set(['upper', 'lower']))
    })

    it('shields the hollow middle of a 5x5 cube during an inner turn', () => {
      const mesh = buildCubeMesh(createSolvedCube(5), 5, undefined, true, {
        face: 'R',
        depth: 2,
        angle: Math.PI / 4,
      })
      const staticMesh = buildCubeMesh(createSolvedCube(5), 5)
      expect(mesh.vertexCount).toBe(staticMesh.vertexCount)
      expect(mesh.indexCount).toBe(staticMesh.indexCount)
      let coreTriangles = 0
      for (let i = 0; i < mesh.positions.length; i += 9) {
        const dark = [0.11, 0.11, 0.12]
        if (
          dark.some(
            (value, channel) =>
              Math.abs(mesh.colors[i + channel] - value) > 1e-5,
          )
        )
          continue
        const inside = [0, 3, 6].every(
          (offset) =>
            Math.hypot(
              mesh.positions[i + offset],
              mesh.positions[i + offset + 1],
              mesh.positions[i + offset + 2],
            ) < 1.49,
        )
        if (inside) coreTriangles++
      }
      expect(coreTriangles).toBeGreaterThan(0)
    })

    it('keeps cut caps inside the rounded edges on a 2x2', () => {
      const mesh = buildCubeMesh(createSolvedCube(2), 2)
      let found = false
      for (let i = 0; i < mesh.positions.length; i += 9) {
        if (mesh.normals[i + 1] > -0.9) continue
        const y = mesh.positions[i + 1]
        if (Math.abs(y - 0.005) > 0.001) continue
        if (Math.abs(mesh.colors[i] - 0.11) > 1e-5) continue
        found = true
        for (const offset of [0, 3, 6]) {
          const x = mesh.positions[i + offset]
          const z = mesh.positions[i + offset + 2]
          expect(Math.abs(x) - 0.5).toBeLessThanOrEqual(0.45)
          expect(Math.abs(z) - 0.5).toBeLessThanOrEqual(0.45)
        }
      }
      expect(found).toBe(true)
    })

    it('darkens recessed seam walls without changing sticker colors', () => {
      const mesh = buildCubeMesh(createSolvedCube(3), 3)
      expect(mesh.occlusion.length).toBe(mesh.vertexCount)
      expect(Math.min(...mesh.occlusion)).toBeLessThan(0.7)
      expect(Math.max(...mesh.occlusion)).toBe(1)
      // AO is a separate channel; the face colors remain the selected palette.
      expect(
        mesh.colors.some(
          (color) => Math.abs(color - hexToRgb('#f7f6f1')[0]) < 1e-5,
        ),
      ).toBe(true)
    })
  })
})
