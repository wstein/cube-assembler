import { describe, it, expect } from 'vitest'
import { hungarianAssignment } from '../src/client/vision/stickerLearning'

describe('hungarianAssignment', () => {
  it('solves a trivial 1x1 matrix', () => {
    expect(hungarianAssignment([[5]])).toEqual([0])
  })

  it('picks the cheaper of two possible perfect matchings on a 2x2 matrix', () => {
    // row0->col0 + row1->col1 = 1+1 = 2; row0->col1 + row1->col0 = 9+9 = 18.
    expect(
      hungarianAssignment([
        [1, 9],
        [9, 1],
      ]),
    ).toEqual([0, 1])
    // Now the crossed matching is cheaper.
    expect(
      hungarianAssignment([
        [9, 1],
        [1, 9],
      ]),
    ).toEqual([1, 0])
  })

  it('always returns a valid bijection (every row and column used exactly once)', () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ]
    const assignment = hungarianAssignment(cost)
    expect(new Set(assignment).size).toBe(cost.length)
    assignment.forEach((col) => expect(col).toBeGreaterThanOrEqual(0))
  })

  // A from-scratch min-cost-matching implementation is exactly the kind of
  // code where "looks right" and "is right" can quietly diverge - so
  // rather than trust it from a handful of hand-picked cases, this checks
  // it against brute-force optimal search (try every permutation, keep
  // the cheapest) across many random small matrices, where brute force is
  // still fast enough to serve as ground truth.
  function bruteForceMinCost(cost: number[][]): number {
    const n = cost.length
    const indices = Array.from({ length: n }, (_, i) => i)
    let best = Infinity
    function permute(arr: number[], l: number) {
      if (l === arr.length) {
        let total = 0
        for (let i = 0; i < n; i++) total += cost[i][arr[i]]
        if (total < best) best = total
        return
      }
      for (let i = l; i < arr.length; i++) {
        ;[arr[l], arr[i]] = [arr[i], arr[l]]
        permute(arr, l + 1)
        ;[arr[l], arr[i]] = [arr[i], arr[l]]
      }
    }
    permute([...indices], 0)
    return best
  }

  it('matches brute-force optimal cost on many random small matrices', () => {
    let seed = 42
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let trial = 0; trial < 300; trial++) {
      const n = 2 + (trial % 5) // 2..6
      const cost = Array.from({ length: n }, () =>
        Array.from({ length: n }, () => Math.floor(rand() * 100)),
      )
      const assignment = hungarianAssignment(cost)
      const gotCost = assignment.reduce(
        (sum, col, row) => sum + cost[row][col],
        0,
      )
      expect(gotCost).toBe(bruteForceMinCost(cost))
    }
  })
})
