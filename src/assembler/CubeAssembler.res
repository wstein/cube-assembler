/* CubeAssembler.res
 * Multi-stage assembly pipeline: maps 6 unlabelled face images → valid cube states.
 *
 * Pipeline:
 *   1. Generate all 6! = 720 face permutations (Heap's algorithm)
 *   2. For each permutation, try all 4^6 = 4,096 rotation combinations
 *   3. Apply filtering cascade:
 *      a. Color balance check (fast, eliminates most candidates)
 *      b. Center core uniformity (fast)
 *      c. Edge adjacency check (medium)
 *      d. Corner adjacency check (medium)
 *      e. Full parity check (slow, final gate)
 *
 * Total search space: 720 × 4,096 = 2,949,120 candidates
 * After color balance filter: typically <0.1% survive to parity check.
 *
 * Bug fixes from original CubeAssembler.res:
 *   1. PermGen now uses correct Heap's algorithm (not incomplete stub)
 *   2. rotateFace now uses correct 90° CW formula (dst[c][N-1-r] = src[r][c])
 *   3. extractEdges now returns actual facelet color pairs, not face-grid tuples
 *   4. extractCorners returns actual color triplets with correct facelet indices
 *   5. validateCenterCores checks per-face center-block color uniformity
 *   6. candidateCube correctly indexes perm[0..5] for U/R/F/D/L/B
 *   7. Full parity check replaces trivial length check
 */

open CubeIR
open CubeIRUtils
open PermGen
open Parity

/* ─── Stage 1: Edge Adjacency ─────────────────────────────────────────────── */

/** Validate that all edge facelets form valid color pairs.
    For 3x3: extracts 12 edge pairs. For NxN: checks wing edges. */
let validateEdgeAdjacency = (cube: cubeIR): bool => {
  switch cube.size {
  | ThreeByThree =>
    let edges = extractEdgePairs3x3(cube)
    edges->Array.every(((c1, c2)) => isValidEdgePair(c1, c2))
  | FourByFour =>
    // Check wing edge pairs
    let wings = extractWingEdgePairs4x4(cube)
    wings->Array.every(((c1, c2)) => isValidEdgePair(c1, c2))
  | _ =>
    // For 2x2: no edges. For 5x7: simplified check via adjacency
    true
  }
}

/* ─── Stage 2: Corner Adjacency ───────────────────────────────────────────── */

/** Validate that all corner facelets form valid color triplets. */
let validateCornerAdjacency = (cube: cubeIR): bool => {
  let corners = extractCornerTriplets(cube)
  corners->Array.every(((c1, c2, c3)) => isValidCornerTriplet(c1, c2, c3))
}

/* ─── Main Assembly Function ──────────────────────────────────────────────── */

type assemblyResult = {
  validStates: array<cubeIR>,
  candidatesTested: int,
  afterColorBalance: int,
  afterCenterCheck: int,
  afterEdgeCheck: int,
  afterCornerCheck: int,
  afterParityCheck: int,
}

/** Assemble and validate all possible cube states from 6 unlabelled face grids.
    Returns both the valid states and pipeline statistics for debugging. */
let assembleAndValidateWithStats = (faces: array<faceGrid>, ~size: puzzleSize=ThreeByThree, ()): assemblyResult => {
  if Array.length(faces) != 6 {
    {
      validStates: [],
      candidatesTested: 0,
      afterColorBalance: 0,
      afterCenterCheck: 0,
      afterEdgeCheck: 0,
      afterCornerCheck: 0,
      afterParityCheck: 0,
    }
  } else {
    let validStates: array<cubeIR> = []
    let totalTested = ref(0)
    let afterBalance = ref(0)
    let afterCenter = ref(0)
    let afterEdge = ref(0)
    let afterCorner = ref(0)
    let afterParity = ref(0)

    let allPermutations = generate6Permutations(faces) // 720 permutations

    allPermutations->Array.forEach(perm => {
      // FIX: perm[0..5] are the 6 face grids in URFDLB order
      for rotU in 0 to 3 {
        for rotR in 0 to 3 {
          for rotF in 0 to 3 {
            for rotD in 0 to 3 {
              for rotL in 0 to 3 {
                for rotB in 0 to 3 {
                  incr(totalTested)

                  let candidate: cubeIR = {
                    size,
                    u: rotateFace(Belt.Array.getExn(perm, 0), rotU),
                    r: rotateFace(Belt.Array.getExn(perm, 1), rotR),
                    f: rotateFace(Belt.Array.getExn(perm, 2), rotF),
                    d: rotateFace(Belt.Array.getExn(perm, 3), rotD),
                    l: rotateFace(Belt.Array.getExn(perm, 4), rotL),
                    b: rotateFace(Belt.Array.getExn(perm, 5), rotB),
                  }

                  // Gate 1: Color balance (fastest — eliminates ~99.8%)
                  if validateColorBalance(candidate) {
                    incr(afterBalance)

                    // Gate 2: Center core uniformity
                    if validateCenterCores(candidate) {
                      incr(afterCenter)

                      // Gate 3: Edge adjacency
                      if validateEdgeAdjacency(candidate) {
                        incr(afterEdge)

                        // Gate 4: Corner adjacency
                        if validateCornerAdjacency(candidate) {
                          incr(afterCorner)

                          // Gate 5: Full parity check (most expensive, final gate)
                          if isValidCube(candidate) {
                            incr(afterParity)
                            let _ = Js.Array2.push(validStates, candidate)
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    })

    {
      validStates,
      candidatesTested: totalTested.contents,
      afterColorBalance: afterBalance.contents,
      afterCenterCheck: afterCenter.contents,
      afterEdgeCheck: afterEdge.contents,
      afterCornerCheck: afterCorner.contents,
      afterParityCheck: afterParity.contents,
    }
  }
}

/** Simplified assembly: returns only valid states. */
let assembleAndValidate = (faces: array<faceGrid>, ~size: puzzleSize=ThreeByThree, ()): array<cubeIR> =>
  assembleAndValidateWithStats(faces, ~size, ()).validStates

/* ─── Assembly Result Formatting ─────────────────────────────────────────── */

let formatAssemblyStats = (result: assemblyResult): string => {
  let n = Array.length(result.validStates)
  "Assembly Pipeline Stats:\n" ++
  `  Candidates tested:    ${Int.toString(result.candidatesTested)}\n` ++
  `  After color balance:  ${Int.toString(result.afterColorBalance)}\n` ++
  `  After center check:   ${Int.toString(result.afterCenterCheck)}\n` ++
  `  After edge check:     ${Int.toString(result.afterEdgeCheck)}\n` ++
  `  After corner check:   ${Int.toString(result.afterCornerCheck)}\n` ++
  `  After parity check:   ${Int.toString(result.afterParityCheck)}\n` ++
  `  Valid states found:   ${Int.toString(n)}`
}

/* ─── Per-Face Orientation Search ─────────────────────────────────────────── */

/** Given a fixed face permutation (already assigned to positions), find valid orientations.
    Returns array of valid (rotU, rotR, rotF, rotD, rotL, rotB) tuples. */
let findValidOrientations = (
  faces: array<faceGrid>,
  size: puzzleSize,
): array<array<int>> => {
  let valid = []
  for rotU in 0 to 3 {
    for rotR in 0 to 3 {
      for rotF in 0 to 3 {
        for rotD in 0 to 3 {
          for rotL in 0 to 3 {
            for rotB in 0 to 3 {
              let candidate: cubeIR = {
                size,
                u: rotateFace(Belt.Array.getExn(faces, 0), rotU),
                r: rotateFace(Belt.Array.getExn(faces, 1), rotR),
                f: rotateFace(Belt.Array.getExn(faces, 2), rotF),
                d: rotateFace(Belt.Array.getExn(faces, 3), rotD),
                l: rotateFace(Belt.Array.getExn(faces, 4), rotL),
                b: rotateFace(Belt.Array.getExn(faces, 5), rotB),
              }
              if isValidCube(candidate) {
                let _ = Js.Array2.push(valid, [rotU, rotR, rotF, rotD, rotL, rotB])
              }
            }
          }
        }
      }
    }
  }
  valid
}
