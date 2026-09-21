/* CubeIRUtils.res
 * Utility functions for cube state validation and orbit extraction.
 * Used by the assembly pipeline and notation validators.
 */

open CubeIR

/* ─── Color Balance ───────────────────────────────────────────────────────── */

/** Count occurrences of each color across an entire cube.
    For a valid NxNxN cube: each color appears exactly N*N times. */
let countColors = (cube: cubeIR): array<(faceletColor, int)> => {
  let n = puzzleSizeN(cube.size)
  let total = n * n
  let faces = toFaceArray(cube)
  let counts = Belt.Map.make(~id=module(Belt.Id.MakeComparable({
    type t = faceletColor
    let cmp = (a, b) =>
      Stdlib.compare(colorToChar(a), colorToChar(b))
  })))
  let counts = ref(counts)

  // Initialize all colors at 0
  allColors->Array.forEach(c => {
    counts := Belt.Map.set(counts.contents, c, 0)
  })

  // Count
  faces->Array.forEach(face => {
    for i in 0 to total - 1 {
      let c = face.data[i]
      let prev = Belt.Map.getWithDefault(counts.contents, c, 0)
      counts := Belt.Map.set(counts.contents, c, prev + 1)
    }
  })

  allColors->Array.map(c => (c, Belt.Map.getWithDefault(counts.contents, c, 0)))
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
    [] // 2x2 has no edge pieces
  } else {
    Array.init(inner, i => {
      switch edge {
      | 0 => i + 1               // top row, cols 1..N-2
      | 1 => (i + 1) * n + (n - 1) // right col, rows 1..N-2
      | 2 => (n - 1) * n + (i + 1) // bottom row, cols 1..N-2
      | 3 => (i + 1) * n         // left col, rows 1..N-2
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
let extractCornerTriplets = (cube: cubeIR): array<(faceletColor, faceletColor, faceletColor)> => {
  let n = puzzleSizeN(cube.size)
  // 8 physical corners, each identified by (faceA, cornerIdxA, faceB, cornerIdxB, faceC, cornerIdxC)
  // Corner layout (WCA standard):
  //   UFL=corner(U:BL, F:TL, L:TR), UFR=corner(U:BR, F:TR, R:TL)
  //   UBL=corner(U:TL, B:TR, L:TL), UBR=corner(U:TR, B:TL, R:TR)
  //   DFL=corner(D:TL, F:BL, L:BR), DFR=corner(D:TR, F:BR, R:BL)
  //   DBL=corner(D:BL, B:BR, L:BL), DBR=corner(D:BR, B:BL, R:BR)
  let ci = cornerFaceletIdx
  [
    // UFL
    (cube.u.data[ci(n, 2)], cube.f.data[ci(n, 0)], cube.l.data[ci(n, 1)]),
    // UFR
    (cube.u.data[ci(n, 3)], cube.f.data[ci(n, 1)], cube.r.data[ci(n, 0)]),
    // UBL
    (cube.u.data[ci(n, 0)], cube.b.data[ci(n, 1)], cube.l.data[ci(n, 0)]),
    // UBR
    (cube.u.data[ci(n, 1)], cube.b.data[ci(n, 0)], cube.r.data[ci(n, 1)]),
    // DFL
    (cube.d.data[ci(n, 0)], cube.f.data[ci(n, 2)], cube.l.data[ci(n, 3)]),
    // DFR
    (cube.d.data[ci(n, 1)], cube.f.data[ci(n, 3)], cube.r.data[ci(n, 2)]),
    // DBL
    (cube.d.data[ci(n, 2)], cube.b.data[ci(n, 3)], cube.l.data[ci(n, 2)]),
    // DBR
    (cube.d.data[ci(n, 3)], cube.b.data[ci(n, 2)], cube.r.data[ci(n, 3)]),
  ]
}

/** Extract edge color pairs from a 3x3 cube (12 edges, 1 sticker per face each). */
let extractEdgePairs3x3 = (cube: cubeIR): array<(faceletColor, faceletColor)> => {
  // For 3x3: each edge has exactly 1 sticker on each of 2 faces
  // Edge midpoint indices in a 3x3 grid: top=1, right=5, bottom=7, left=3
  [
    // U-face edges
    (cube.u.data[7], cube.f.data[1]), // UF
    (cube.u.data[5], cube.r.data[1]), // UR
    (cube.u.data[1], cube.b.data[1]), // UB
    (cube.u.data[3], cube.l.data[1]), // UL
    // D-face edges
    (cube.d.data[1], cube.f.data[7]), // DF
    (cube.d.data[5], cube.r.data[7]), // DR
    (cube.d.data[7], cube.b.data[7]), // DB
    (cube.d.data[3], cube.l.data[7]), // DL
    // Middle slice edges
    (cube.f.data[3], cube.l.data[5]), // FL
    (cube.f.data[5], cube.r.data[3]), // FR
    (cube.b.data[5], cube.r.data[5]), // BR  (note: B face is "inside-out" in standard notation)
    (cube.b.data[3], cube.l.data[3]), // BL
  ]
}

/** Extract all wing-edge color pairs for 4x4 (24 wing edges, 2 per physical edge). */
let extractWingEdgePairs4x4 = (cube: cubeIR): array<(faceletColor, faceletColor)> => {
  // 4x4 has "wing" edge pieces at positions (row/col 1 and 2 on each edge)
  // U-F wings: U row 3 cols 1,2 vs F row 0 cols 1,2
  [
    // UF wings
    (cube.u.data[13], cube.f.data[1]),
    (cube.u.data[14], cube.f.data[2]),
    // UR wings
    (cube.u.data[7], cube.r.data[4]),
    (cube.u.data[11], cube.r.data[8]),
    // UB wings
    (cube.u.data[1], cube.b.data[2]),
    (cube.u.data[2], cube.b.data[1]),
    // UL wings
    (cube.u.data[4], cube.l.data[8]),
    (cube.u.data[8], cube.l.data[4]),
    // DF wings
    (cube.d.data[1], cube.f.data[13]),
    (cube.d.data[2], cube.f.data[14]),
    // DR wings
    (cube.d.data[7], cube.r.data[11]),
    (cube.d.data[11], cube.r.data[7]),
    // DB wings
    (cube.d.data[13], cube.b.data[14]),
    (cube.d.data[14], cube.b.data[13]),
    // DL wings
    (cube.d.data[4], cube.l.data[7]),
    (cube.d.data[8], cube.l.data[11]),
    // FR wings
    (cube.f.data[7], cube.r.data[4+3]),
    (cube.f.data[11], cube.r.data[8+3]),
    // FL wings
    (cube.f.data[4], cube.l.data[7]),
    (cube.f.data[8], cube.l.data[11]),
    // BR wings
    (cube.b.data[7], cube.r.data[7]),
    (cube.b.data[11], cube.r.data[11]),
    // BL wings
    (cube.b.data[4], cube.l.data[4]),
    (cube.b.data[8], cube.l.data[8]),
  ]
}

/* ─── Center Core Validation ──────────────────────────────────────────────── */

/** For a valid NxN cube, each face's center block should be a uniform color.
    For 3x3: center (1 facelet). For 4x4: 2x2 center block (4 facelets). etc.
    This checks that the center block of each face is monochromatic. */
let validateCenterCores = (cube: cubeIR): bool => {
  let n = puzzleSizeN(cube.size)
  let faces = toFaceArray(cube)
  faces->Array.every(face => {
    // Center region: rows ceil(n/2)-1 .. floor(n/2), cols same
    // For even N: rows (N/2-1)..(N/2), cols same → 4 facelets forming the core
    // For odd N: single center facelet at (N/2, N/2)
    let centerIndices = if mod(n, 2) == 1 {
      // Odd: single center
      [n / 2 * n + n / 2]
    } else {
      // Even: 2x2 core
      let h = n / 2
      [
        (h - 1) * n + (h - 1),
        (h - 1) * n + h,
        h * n + (h - 1),
        h * n + h,
      ]
    }
    let firstColor = face.data[centerIndices[0]]
    centerIndices->Array.every(idx => face.data[idx] == firstColor)
  })
}
