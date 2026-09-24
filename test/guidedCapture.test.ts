/**
 * test/guidedCapture.test.ts
 * solveGuidedCapture / checkGuidedCenters (src/client/cubeAssembly.ts):
 * simulates a person following the guided protocol on scrambled cubes -
 * held any way up, turned left or right between the 4 side photos, then
 * the top and bottom photographed in either order at any angle - and
 * checks the search puts the cube back together.
 *
 * Run: npx vitest run test/guidedCapture.test.ts
 */
import { describe, it, expect } from 'vitest'
import { rotateCube, turnFace, allOrientations, solvedCubeFaces, type Faces } from '../src/client/cubeGeometry'
import { solveGuidedCapture, checkGuidedCenters, findRepeatedFaces, type FaceKey, type GuidedCapture } from '../src/client/cubeAssembly'

const WCA: Record<FaceKey, string> = { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' }
const FACES: FaceKey[] = ['U', 'R', 'F', 'D', 'L', 'B']

function rng(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function scramble(n: number, moves: number, rand: () => number): Faces {
  let faces = solvedCubeFaces(n, WCA)
  for (let i = 0; i < moves; i++) {
    faces = turnFace(faces, FACES[Math.floor(rand() * 6)], 1 + Math.floor(rand() * 3), 1 + Math.floor(rand() * Math.floor(n / 2)))
  }
  return faces
}

function rotateGrid(grid: string[][], turns: number): string[][] {
  let result = grid
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) {
    const n = result.length
    const next = Array.from({ length: n }, () => Array<string>(n).fill(''))
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) next[c][n - 1 - r] = result[r][c]
    result = next
  }
  return result
}

// What the camera sees when someone follows the protocol with `held`
// facing it: 4 upright side photos turning the given way (left = the
// right-hand face comes to the front, a y rotation), then top and bottom
// tipped towards the camera, in either order, each at any angle.
function photograph(held: Faces, turn: 'left' | 'right', capsSwapped: boolean, capAngles: [number, number]): GuidedCapture {
  const sides: string[][][] = []
  let current = held
  for (let i = 0; i < 4; i++) {
    sides.push(current.F)
    current = rotateCube(current, 'y', turn === 'left' ? 1 : -1)
  }
  const top = rotateGrid(rotateCube(held, 'x', -1).F, capAngles[0])
  const bottom = rotateGrid(rotateCube(held, 'x', 1).F, capAngles[1])
  return { sides: sides as GuidedCapture['sides'], caps: capsSwapped ? [bottom, top] : [top, bottom] }
}

const sameCube = (a: Faces, b: Faces) => {
  const key = (f: Faces) => allOrientations(f).map((o) => JSON.stringify(o)).sort()[0]
  return key(a) === key(b)
}

describe('solveGuidedCapture', () => {
  for (const n of [2, 3, 4, 5, 6, 7]) {
    it(`reassembles scrambled ${n}x${n} cubes however they were held, turned and tipped`, () => {
      const rand = rng(1000 + n)
      for (let trial = 0; trial < 6; trial++) {
        const cube = scramble(n, 40, rand)
        const held = allOrientations(cube)[Math.floor(rand() * 24)]
        const turn = rand() < 0.5 ? 'left' : 'right'
        const swapped = rand() < 0.5
        const capture = photograph(held, turn, swapped, [Math.floor(rand() * 4), Math.floor(rand() * 4)])
        const solution = solveGuidedCapture(capture)!
        expect(solution.fullyValid, `trial ${trial}`).toBe(true)
        expect(solution.alternatives.some((a) => sameCube(a.faces, cube)), `trial ${trial}`).toBe(true)
      }
    })
  }

  it('presents odd sizes in standard orientation (white on top, green in front)', () => {
    const rand = rng(7)
    const cube = scramble(3, 40, rand)
    const solution = solveGuidedCapture(photograph(allOrientations(cube)[13], 'right', true, [3, 1]))!
    expect(solution.faces.U[1][1]).toBe('W')
    expect(solution.faces.F[1][1]).toBe('G')
    expect(solution.faces).toEqual(cube)
  })

  it('reports how the photos were put together', () => {
    const cube = scramble(3, 40, rng(8))
    const solution = solveGuidedCapture(photograph(cube, 'right', true, [0, 0]))!
    expect(solution.alternatives).toHaveLength(1)
    expect(solution.arrangements[0].turn).toBe('right')
    expect(solution.arrangements[0].capsSwapped).toBe(true)
  })

  it('collapses a solved cube to one answer instead of one per way of holding it', () => {
    expect(solveGuidedCapture(photograph(solvedCubeFaces(2, WCA), 'left', false, [1, 2]))!.alternatives).toHaveLength(1)
    expect(solveGuidedCapture(photograph(solvedCubeFaces(3, WCA), 'left', false, [1, 2]))!.alternatives).toHaveLength(1)
  })

  it('finds no valid cube when the side photos are out of order', () => {
    const cube = scramble(3, 40, rng(9))
    const capture = photograph(cube, 'left', false, [0, 0])
    const [a, b, c, d] = capture.sides
    expect(solveGuidedCapture({ ...capture, sides: [a, c, b, d] })!.fullyValid).toBe(false)
  })

  it('rejects photos of different sizes', () => {
    const capture = photograph(solvedCubeFaces(3, WCA), 'left', false, [0, 0])
    expect(solveGuidedCapture({ ...capture, caps: [capture.caps[0], [['W']]] })).toBeNull()
  })
})

describe('checkGuidedCenters', () => {
  const capture = photograph(scramble(3, 40, rng(11)), 'left', false, [0, 0])
  const photos = [...capture.sides, ...capture.caps]

  it('finds nothing wrong with a proper capture, or a partial one', () => {
    expect(checkGuidedCenters(photos)).toEqual([])
    expect(checkGuidedCenters([photos[0], photos[1], undefined, undefined, undefined, undefined])).toEqual([])
  })

  it('spots the same face photographed twice', () => {
    expect(checkGuidedCenters([photos[0], photos[1], photos[1]])).toEqual([{ kind: 'same-center', photos: [1, 2] }])
  })

  it('spots a side turned twice instead of once', () => {
    const issues = checkGuidedCenters([photos[0], photos[2]])
    expect(issues).toEqual([{ kind: 'turned-twice', photo: 1 }])
  })

  it('stays quiet on even sizes, which have no fixed centers', () => {
    const even = photograph(scramble(4, 40, rng(12)), 'left', false, [0, 0])
    expect(checkGuidedCenters([even.sides[0], even.sides[0]])).toEqual([])
  })
})

describe('findRepeatedFaces', () => {
  for (const n of [2, 3, 4, 7]) {
    it(`finds a ${n}x${n} face photographed twice, even turned and (from 3x3 up) with a misread`, () => {
      const capture = photograph(scramble(n, 40, rng(20 + n)), 'left', false, [0, 0])
      const again = rotateGrid(capture.sides[0], 3).map((row) => [...row])
      if (n > 2) again[0][0] = again[0][0] === 'W' ? 'Y' : 'W'
      expect(findRepeatedFaces([...capture.sides, again])).toEqual([[0, 4]])
    })

    it(`doesn't mistake the 6 different faces of a scrambled ${n}x${n} for repeats`, () => {
      const capture = photograph(scramble(n, 40, rng(40 + n)), 'right', true, [1, 2])
      expect(findRepeatedFaces([...capture.sides, ...capture.caps])).toEqual([])
    })
  }

  it('ignores photos not taken yet', () => {
    const capture = photograph(scramble(3, 40, rng(60)), 'left', false, [0, 0])
    expect(findRepeatedFaces([capture.sides[0], undefined, capture.sides[0]])).toEqual([[0, 2]])
  })
})
