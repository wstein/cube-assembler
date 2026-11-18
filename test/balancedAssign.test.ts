// balancedAssign: equivalence with the reference (slot expansion solved by
// the O(M^3) Hungarian algorithm) and a speed budget at the largest sizes.
import { describe, it, expect } from 'vitest'
import { clusterDistance } from '../src/client/vision/colorMath'
import {
  balancedAssign,
  hungarianAssignment,
  learnStickerColors,
} from '../src/client/vision/stickerLearning'
import {
  STICKER_COLORS,
  type RGB,
} from '../src/client/vision/stickerColorGeometry'

type Pins = Array<number | null | undefined>

// The implementation this project used before the transportation solver:
// each centroid becomes `capacity` equal-cost slots, dummy zero-cost rows
// pad the matrix to a square, and the Hungarian algorithm solves it.
function referenceBalancedAssign(
  points: RGB[],
  centroids: RGB[],
  pinned: Pins,
): number[] {
  const k = centroids.length
  const n = points.length
  const capacity = Math.ceil(n / k)
  const result = new Array<number>(n).fill(0)
  const free: number[] = []
  const slots = new Array<number>(k).fill(capacity)
  points.forEach((_, pi) => {
    const pin = pinned[pi]
    if (pin != null && pin >= 0 && pin < k && slots[pin] > 0) {
      result[pi] = pin
      slots[pin]--
    } else free.push(pi)
  })
  const slotCluster = slots.flatMap((count, ci) => new Array(count).fill(ci))
  const total = slotCluster.length
  const cost = free.map((pi) => {
    const d = centroids.map((c) => clusterDistance(points[pi], c))
    return slotCluster.map((ci) => d[ci])
  })
  for (let i = free.length; i < total; i++) cost.push(new Array(total).fill(0))
  const slotAssignment = hungarianAssignment(cost)
  free.forEach((pi, j) => {
    result[pi] = slotCluster[slotAssignment[j]]
  })
  return result
}

function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

const NAMES = ['W', 'Y', 'R', 'O', 'G', 'B']
const PALETTE: RGB[] = NAMES.map((name) => STICKER_COLORS[name])

function jitter(rand: () => number, c: RGB, spread: number): RGB {
  const j = () => (rand() - 0.5) * 2 * spread
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return { r: q(c.r + j()), g: q(c.g + j()), b: q(c.b + j()) }
}

// n^2 stickers per color, jittered; `spread` large enough makes the colors
// overlap so capacities bind.
function balancedPoints(n: number, seed: number, spread: number): RGB[] {
  const rand = lcg(seed)
  const points: RGB[] = []
  for (const color of PALETTE)
    for (let i = 0; i < n * n; i++) points.push(jitter(rand, color, spread))
  // Fisher-Yates with the same generator.
  for (let i = points.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[points[i], points[j]] = [points[j], points[i]]
  }
  return points
}

function totalCost(points: RGB[], centroids: RGB[], assignment: number[]) {
  return assignment.reduce(
    (sum, ci, pi) => sum + clusterDistance(points[pi], centroids[ci]),
    0,
  )
}

function counts(assignment: number[], k: number) {
  const c = new Array<number>(k).fill(0)
  for (const ci of assignment) c[ci]++
  return c
}

// Same minimum, valid capacities and honored pins; returns whether the
// assignment is identical to the reference.
function checkAgainstReference(
  points: RGB[],
  centroids: RGB[],
  pinned: Pins,
): boolean {
  const k = centroids.length
  const capacity = Math.ceil(points.length / k)
  const expected = referenceBalancedAssign(points, centroids, pinned)
  const actual = balancedAssign(
    points,
    centroids,
    pinned as Array<number | null | undefined>,
  )
  expect(actual).toHaveLength(points.length)
  actual.forEach((ci) => {
    expect(Number.isInteger(ci)).toBe(true)
    expect(ci).toBeGreaterThanOrEqual(0)
    expect(ci).toBeLessThan(k)
  })
  counts(actual, k).forEach((c) => expect(c).toBeLessThanOrEqual(capacity))
  // Pins are honored in point order while their cluster has room.
  const room = new Array<number>(k).fill(capacity)
  pinned.forEach((pin, pi) => {
    if (pin != null && pin >= 0 && pin < k && room[pin] > 0) {
      room[pin]--
      expect(actual[pi]).toBe(pin)
    }
  })
  const want = totalCost(points, centroids, expected)
  const got = totalCost(points, centroids, actual)
  expect(Math.abs(got - want)).toBeLessThanOrEqual(1e-9 * Math.max(1, want))
  return actual.every((ci, i) => ci === expected[i])
}

const NO_PINS: Pins = []

describe('balancedAssign against the Hungarian reference', () => {
  // Continuous random jitter: the optimum is unique, so the assignment
  // itself must match, not just its cost.
  for (const n of [2, 3, 4, 5, 6, 7]) {
    for (const spread of [6, 40, 120]) {
      for (const seed of [1, 2, 3]) {
        it(`n=${n} spread=${spread} seed=${seed}: same assignment`, () => {
          const points = balancedPoints(n, seed * 1000 + n, spread)
          expect(checkAgainstReference(points, PALETTE, NO_PINS)).toBe(true)
        })
      }
    }
  }

  for (const n of [8, 9, 10]) {
    it(`n=${n} (sampled): same assignment, overlapping colors`, () => {
      const points = balancedPoints(n, 77 + n, 90)
      expect(checkAgainstReference(points, PALETTE, NO_PINS)).toBe(true)
    })
  }

  it('random centroids (not the palette) match', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rand = lcg(seed)
      const centroids = Array.from({ length: 6 }, () => ({
        r: Math.floor(rand() * 256),
        g: Math.floor(rand() * 256),
        b: Math.floor(rand() * 256),
      }))
      const points = Array.from({ length: 30 + seed * 7 }, () => ({
        r: Math.floor(rand() * 256),
        g: Math.floor(rand() * 256),
        b: Math.floor(rand() * 256),
      }))
      expect(checkAgainstReference(points, centroids, NO_PINS)).toBe(true)
    }
  })

  it('point counts not divisible by k (dummy rows) match', () => {
    for (const total of [1, 2, 5, 6, 7, 11, 13, 29, 50, 97]) {
      const rand = lcg(total)
      const points = Array.from({ length: total }, () =>
        jitter(rand, PALETTE[Math.floor(rand() * 6)], 70),
      )
      expect(checkAgainstReference(points, PALETTE, NO_PINS)).toBe(true)
    }
  })

  it('handles zero points and other cluster counts', () => {
    expect(balancedAssign([], PALETTE, [])).toEqual([])
    const rand = lcg(5)
    for (const k of [1, 2, 3, 6]) {
      const centroids = PALETTE.slice(0, k)
      const points = Array.from({ length: 17 }, () =>
        jitter(rand, PALETTE[Math.floor(rand() * 6)], 60),
      )
      expect(checkAgainstReference(points, centroids, NO_PINS)).toBe(true)
    }
  })

  it('an empty class (all points near five colors) still fills capacities', () => {
    const rand = lcg(9)
    const points: RGB[] = []
    for (const c of PALETTE.slice(0, 5))
      for (let i = 0; i < 36; i++) points.push(jitter(rand, c, 10))
    for (let i = 0; i < 6; i++) points.push(jitter(rand, PALETTE[0], 10))
    expect(checkAgainstReference(points, PALETTE, NO_PINS)).toBe(true)
  })

  it('a full class (every point at one centroid) spreads by capacity', () => {
    const rand = lcg(11)
    const points = Array.from({ length: 54 }, () =>
      jitter(rand, PALETTE[2], 25),
    )
    expect(checkAgainstReference(points, PALETTE, NO_PINS)).toBe(true)
  })

  describe('pins', () => {
    it('honors pins, including over-pinned and out-of-range values', () => {
      for (let seed = 1; seed <= 12; seed++) {
        const rand = lcg(seed * 31)
        const points = balancedPoints(3, seed, 60)
        const pinned: Pins = points.map(() => {
          const r = rand()
          if (r < 0.5) return null
          if (r < 0.9) return Math.floor(rand() * 6)
          return r < 0.95 ? -1 : 6 // out of range: treated as free
        })
        checkAgainstReference(points, PALETTE, pinned)
      }
    })

    it('pins the first points of an over-subscribed cluster only', () => {
      const points = balancedPoints(2, 4, 30)
      const pinned: Pins = points.map(() => 0) // 24 points pin 4 slots
      const actual = balancedAssign(
        points,
        PALETTE,
        pinned as Array<number | null>,
      )
      expect(actual.slice(0, 4)).toEqual([0, 0, 0, 0])
      expect(counts(actual, 6)[0]).toBeLessThanOrEqual(4)
      checkAgainstReference(points, PALETTE, pinned)
    })

    it('a pin array shorter than the points leaves the rest free', () => {
      const points = balancedPoints(3, 8, 50)
      checkAgainstReference(points, PALETTE, [1, 1, 1])
    })

    it('unique-optimum pinned cases match the reference assignment', () => {
      for (let seed = 1; seed <= 12; seed++) {
        const rand = lcg(seed * 7)
        const points = balancedPoints(4, seed, 60)
        const pinned: Pins = points.map(() =>
          rand() < 0.4 ? Math.floor(rand() * 6) : null,
        )
        expect(checkAgainstReference(points, PALETTE, pinned)).toBe(true)
      }
    })
  })

  // Exact ties: identical points are interchangeable, so only the cost, the
  // capacities and the number of points of each color per cluster can be
  // asserted. Which of two identical points is displaced is not specified.
  describe('exact ties', () => {
    function tieCheck(points: RGB[], centroids: RGB[], pinned: Pins) {
      checkAgainstReference(points, centroids, pinned)
      const expected = referenceBalancedAssign(points, centroids, pinned)
      const actual = balancedAssign(
        points,
        centroids,
        pinned as Array<number | null>,
      )
      const histogram = (assignment: number[]) => {
        const h = new Map<string, number>()
        assignment.forEach((ci, pi) => {
          const key = `${points[pi].r},${points[pi].g},${points[pi].b}->${ci}`
          h.set(key, (h.get(key) ?? 0) + 1)
        })
        return [...h.entries()].sort()
      }
      return (
        JSON.stringify(histogram(actual)) ===
        JSON.stringify(histogram(expected))
      )
    }

    it('all points identical', () => {
      const points = new Array(24).fill(0).map(() => ({ ...PALETTE[3] }))
      checkAgainstReference(points, PALETTE, NO_PINS)
    })

    it('exact palette colors, n^2 each (capacities exactly fit)', () => {
      for (const n of [2, 3, 5, 7]) {
        const points: RGB[] = []
        for (const c of PALETTE)
          for (let i = 0; i < n * n; i++) points.push({ ...c })
        expect(tieCheck(points, PALETTE, NO_PINS)).toBe(true)
      }
    })

    it('one color oversubscribed by identical points', () => {
      const points: RGB[] = []
      for (const [ci, c] of PALETTE.entries())
        for (let i = 0; i < (ci === 0 ? 11 : 8); i++) points.push({ ...c })
      expect(tieCheck(points, PALETTE, NO_PINS)).toBe(true)
    })

    it('points equidistant from two centroids', () => {
      const a = { r: 0, g: 0, b: 0 }
      const b = { r: 100, g: 0, b: 0 }
      const mid = { r: 50, g: 0, b: 0 }
      const points = new Array(8).fill(0).map(() => ({ ...mid }))
      points.push({ ...a }, { ...b })
      const centroids = [a, b, PALETTE[2], PALETTE[3], PALETTE[4], PALETTE[5]]
      checkAgainstReference(points, centroids, NO_PINS)
    })
  })
})

describe('balancedAssign ties', () => {
  // Coarse color grids create many equal-cost optima. The minimum, the
  // capacities and the result for a repeated call must hold; which of
  // several equal-cost assignments is returned is not specified (the
  // reference picks another one in about two thirds of these cases).
  it('keeps the minimum on coarse grids with many equal costs', () => {
    const rand = lcg(99)
    for (let t = 0; t < 120; t++) {
      const levels = [2, 3, 4, 8][t % 4]
      const q = () => Math.floor(rand() * levels) * 60
      const points = Array.from(
        { length: 20 + Math.floor(rand() * 100) },
        () => ({ r: q(), g: q(), b: q() }),
      )
      checkAgainstReference(points, PALETTE, NO_PINS)
    }
  })

  it('returns the same assignment for the same input', () => {
    const points = balancedPoints(4, 3, 40)
    expect(balancedAssign(points, PALETTE, [])).toEqual(
      balancedAssign(points, PALETTE, []),
    )
  })
})

describe('balancedAssign speed', () => {
  // The reference needs about O(M^3) for M = 6 n^2 slots: seconds at n=12.
  for (const n of [12, 15]) {
    it(`n=${n} (${6 * n * n} points) takes under one second`, () => {
      const points = balancedPoints(n, 5, 70)
      const start = performance.now()
      const assignment = balancedAssign(
        points,
        PALETTE,
        NO_PINS as Array<number | null>,
      )
      const elapsed = performance.now() - start
      expect(counts(assignment, 6).every((c) => c === n * n)).toBe(true)
      expect(elapsed).toBeLessThan(1000)
    })
  }

  // learnStickerColors runs balancedAssign about 40 times and searches
  // farthest pairs: the whole learning pass at 15x15 took over a minute
  // before the transportation solver.
  it('learns the six colors of a 15x15 capture in under ten seconds', () => {
    const n = 15
    const samples = balancedPoints(n, 6, 25).map((rgb) => ({
      rgb,
      colorGuess: 'W',
    }))
    const start = performance.now()
    const learned = learnStickerColors(samples, STICKER_COLORS, [])
    const elapsed = performance.now() - start
    expect(learned).not.toBeNull()
    expect(Object.keys(learned!.colors).sort()).toEqual([...NAMES].sort())
    expect(elapsed).toBeLessThan(10_000)
  })
})
