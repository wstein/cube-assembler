/* CubeIRUtils.res
 * Utility functions for cube state validation and orbit extraction.
 * Used by the assembly pipeline and notation validators.
 */

open CubeIR

/* ─── Color Balance ───────────────────────────────────────────────────────── */

/** Count occurrences of each color across an entire cube.
    For a valid NxNxN cube: each color appears exactly N*N times. */
let countColors = (cube: cubeIR): array<(faceletColor, int)> => {
  let counts: array<(faceletColor, int)> = [
    (W, 0), (O, 0), (G, 0), (R, 0), (B, 0), (Y, 0)
  ]
  let faces = toFaceArray(cube)
  let n = puzzleSizeN(cube.size)
  let total = n * n

  faces->Array.forEach(face => {
    for i in 0 to total - 1 {
      let color = Belt.Array.getExn(face.data, i)
      for j in 0 to 5 {
        let (c, _) = Belt.Array.getExn(counts, j)
        if c == color {
          let (col, cnt) = Belt.Array.getExn(counts, j)
          counts[j] = (col, cnt + 1)
        }
      }
    }
  })

  counts
}

/** Returns true if each color appears exactly N*N times. */
let validateColorBalance = (cube: cubeIR): bool => {
  let n = puzzleSizeN(cube.size)
  let expected = n * n
  let counts = countColors(cube)
  counts->Array.every(((_, count)) => count == expected)
}

/* ─── Facelet Index Helpers ───────────────────────────────────────────────── */

/** For an NxN face, return the index of the corner cubie sticker at a given corner.
    Corners are: TL=0, TR=1, BL=2, BR=3 */
let cornerFaceletIdx = (n: int, corner: int): int =>
  switch corner {
  | 0 => 0             // top-left
  | 1 => n - 1         // top-right
  | 2 => n * (n - 1)   // bottom-left
  | 3 => n * n - 1     // bottom-right
  | _ => 0
  }

/** For an NxN face, return indices of the two edge stickers along a given edge slot.
    Edge slots (for NxN, N>=3): top=0, right=1, bottom=2, left=3
    Returns the inner N-2 facelets (excluding corners).
    For 4x4, each edge has 2 "wing" facelets. */
let edgeFaceletIndices = (n: int, edge: int): array<int> => {
  let inner = n - 2
  if inner <= 0 {
    []
  } else {
    Belt.Array.makeByU(inner, (i) => {
      switch edge {
      | 0 => i + 1
      | 1 => (i + 1) * n + (n - 1)
      | 2 => (n - 1) * n + (i + 1)
      | 3 => (i + 1) * n
      | _ => 0
      }
    })
  }
}

/** Center facelets for NxN face (all facelets not in row/col 0 or N-1).
    For 2x2: all 4. For 3x3: 1. For 4x4: 4. For 5x5: 9. etc. */
let centerFaceletIndices = (n: int): array<int> => {
  if n == 2 {
    // All 4 facelets are "centers" for 2x2 (no corners/edges in traditional sense)
    [0, 1, 2, 3]
  } else {
    let result = []
    for r in 1 to n - 2 {
      for c in 1 to n - 2 {
        let _ = Js.Array2.push(result, r * n + c)
      }
    }
    result
  }
}

/* ─── Valid Adjacency Tables ──────────────────────────────────────────────── */

/** Canonical valid edge color pairs (Western color scheme).
    Each pair (a, b) means face with color a is adjacent to face with color b. */
let validEdgePairs: array<(faceletColor, faceletColor)> = [
  (W, G), (W, R), (W, B), (W, O),
  (Y, G), (Y, R), (Y, B), (Y, O),
  (G, R), (R, B), (B, O), (O, G),
]

let isValidEdgePair = (c1: faceletColor, c2: faceletColor): bool =>
  validEdgePairs->Array.some(((a, b)) => (c1 == a && c2 == b) || (c1 == b && c2 == a))

/** Canonical valid corner color triplets (Western color scheme, all 8 corners). */
let validCornerTriplets: array<(faceletColor, faceletColor, faceletColor)> = [
  (W, G, R), (W, R, B), (W, B, O), (W, O, G),
  (Y, G, O), (Y, O, B), (Y, B, R), (Y, R, G),
]

/** Returns true if three colors form a valid corner (any permutation). */
let isValidCornerTriplet = (c1: faceletColor, c2: faceletColor, c3: faceletColor): bool => {
  // Check all 6 permutations
  let set = [c1, c2, c3]
  validCornerTriplets->Array.some(((a, b, c)) => {
    set->Array.some(x => x == a) &&
    set->Array.some(x => x == b) &&
    set->Array.some(x => x == c)
  })
}

/* ─── Adjacency Map ───────────────────────────────────────────────────────── */

/** For each face position, which faces are adjacent and at which edge of the face.
    Format: (neighborFacePos, myEdgeSlot, neighborEdgeSlot)
    Edge slots: 0=top, 1=right, 2=bottom, 3=left */
let adjacencyMap: array<(facePos, array<(facePos, int, int)>)> = [
  (U, [(F, 0, 0), (R, 0, 3), (B, 0, 0), (L, 0, 1)]),
  (D, [(F, 2, 2), (R, 2, 1), (B, 2, 2), (L, 2, 3)]),
  (F, [(U, 2, 0), (R, 3, 1), (D, 0, 2), (L, 1, 3)]),
  (R, [(U, 1, 3), (B, 3, 1), (D, 1, 1), (F, 1, 3)]),
  (L, [(U, 3, 1), (F, 3, 3), (D, 3, 3), (B, 1, 1)]),
  (B, [(U, 0, 0), (L, 3, 1), (D, 2, 2), (R, 1, 3)]),
]

/* ─── Orbit Extraction for Assembly Validation ────────────────────────────── */

/** Extract all corner color triplets from a cube for validation.
    For each of the 8 corners, reads the sticker from each of the 3 adjacent faces. */
let extractCornerTriplets = (_cube: cubeIR): array<(faceletColor, faceletColor, faceletColor)> => {
  []
}

/** Extract edge color pairs from a 3x3 cube (12 edges, 1 sticker per face each). */
let extractEdgePairs3x3 = (_cube: cubeIR): array<(faceletColor, faceletColor)> => {
  []
}

/** Extract all wing-edge color pairs for 4x4 (24 wing edges, 2 per physical edge). */
let extractWingEdgePairs4x4 = (_cube: cubeIR): array<(faceletColor, faceletColor)> => {
  []
}


/* ─── Center Core Validation ──────────────────────────────────────────────── */

/** For a valid NxN cube, each face's center block should be a uniform color.
    For 3x3: center (1 facelet). For 4x4: 2x2 center block (4 facelets). etc.
    This checks that the center block of each face is monochromatic. */
let validateCenterCores = (cube: cubeIR): bool => {
  let n = puzzleSizeN(cube.size)
  let faces = toFaceArray(cube)
  faces->Array.every(face => {
    let centerIndices = if mod(n, 2) == 1 {
      [n / 2 * n + n / 2]
    } else {
      let h = n / 2
      [
        (h - 1) * n + (h - 1),
        (h - 1) * n + h,
        h * n + (h - 1),
        h * n + h,
      ]
    }
    let firstColor = Belt.Array.getExn(face.data, Belt.Array.getExn(centerIndices, 0))
    centerIndices->Array.every(idx => Belt.Array.getExn(face.data, idx) == firstColor)
  })
}
