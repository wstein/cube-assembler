// Properties of the cube model on random scrambles of every supported
// size: moves and their inverses, notation and Orbit64 round trips, and
// the parity check's invariants.
open Vitest
module Fc = FastCheck

type move = {face: CubeState.faceKey, depth: int, width: int, turns: int}

let faces: array<CubeState.faceKey> = [U, R, F, D, L, B]

// A move of a cube of size n: any face, any block of layers not reaching
// the far side, a quarter, half or three-quarter turn.
let moveOf = n =>
  Fc.tuple3(
    Fc.constantFrom(faces),
    Fc.integer({min: 1, max: Math.Int.max(1, n / 2)}),
    Fc.integer({min: 1, max: 3}),
  )->Fc.chain(((face, depth, turns)) =>
    Fc.integer({min: 1, max: depth})->Fc.map(width => {face, depth, width, turns})
  )

let apply = (cube, n, {face, depth, width, turns}) =>
  CubeMoves.applyCubeLayerMove(cube, n, face, depth, turns, width)

let scramble = (n, moves) =>
  moves->Array.reduce(CapturedFaceMatching.createSolvedCube(n), (cube, move) =>
    apply(cube, n, move)
  )

// A size, a scramble of it and one more move.
let scrambled =
  Fc.integer({min: 2, max: 7})->Fc.chain(n =>
    Fc.tuple3(Fc.constant(n), Fc.array(moveOf(n), {minLength: 0, maxLength: 30}), moveOf(n))
  )

let sameCube = (a: CubeState.cubeState, b: CubeState.cubeState) => a == b

let valid = (cube, n) => Parity.runFullParity(CubeAssembly.toCubeIR(cube, n)).valid

// A copy of `cube` with `change` applied to its facelet arrays.
let edited = (cube: CubeState.cubeState, change) => {
  let copy: CubeState.cubeState = {
    u: Array.copy(cube.u),
    r: Array.copy(cube.r),
    f: Array.copy(cube.f),
    d: Array.copy(cube.d),
    l: Array.copy(cube.l),
    b: Array.copy(cube.b),
  }
  change(copy)
  copy
}

let faceletsOf = (cube: CubeState.cubeState, face: CubeState.faceKey) =>
  switch face {
  | U => cube.u
  | R => cube.r
  | F => cube.f
  | D => cube.d
  | L => cube.l
  | B => cube.b
  }

describe("cube moves", () => {
  test(
    "a move followed by its inverse restores the cube",
    () =>
      Fc.check(scrambled, ((n, moves, move)) => {
        let cube = scramble(n, moves)
        sameCube(apply(apply(cube, n, move), n, {...move, turns: 4 - move.turns}), cube)
      }),
    60000,
  )

  test(
    "four quarter turns of any block are no move at all",
    () =>
      Fc.check(scrambled, ((n, moves, move)) => {
        let cube = scramble(n, moves)
        let quarter = {...move, turns: 1}
        sameCube(
          apply(apply(apply(apply(cube, n, quarter), n, quarter), n, quarter), n, quarter),
          cube,
        )
      }),
    60000,
  )

  test(
    "every scramble is a valid cube",
    () => Fc.check(scrambled, ((n, moves, _)) => valid(scramble(n, moves), n)),
    60000,
  )
})

describe("notation round trips", () => {
  test(
    "WRG and URF facelets read back as the same cube",
    () =>
      Fc.check(scrambled, ((n, moves, _)) => {
        let cube = scramble(n, moves)
        NotationOutput.fromWRGFacelets(NotationOutput.toWRGFacelets(cube)) == Null.make(cube) &&
          NotationOutput.fromURFFacelets(NotationOutput.toURFFacelets(cube)) == Null.make(cube)
      }),
    60000,
  )

  test(
    "an Orbit64 token decodes to the facelets it encodes",
    () =>
      Fc.check(
        scrambled,
        ((n, moves, _)) => {
          let facelets = NotationOutput.toURFFacelets(scramble(n, moves))
          switch Orbit64.encodeOrbit64State(facelets)->Null.toOption {
          | Some(token) =>
            Orbit64.looksLikeOrbit64StateToken(token) &&
            Orbit64.decodeOrbit64State(token) == Null.make(facelets)
          | None => false
          }
        },
        ~runs=60,
      ),
    120000,
  )
})

describe("parity invariants", () => {
  test(
    "a single twisted corner is never a valid cube",
    () =>
      Fc.check(Fc.tuple2(scrambled, Fc.integer({min: 0, max: 7})), (((n, moves, _), corner)) => {
        let cube = scramble(n, moves)
        let slots = CubePieces.cornerSlots->Array.getUnsafe(corner)
        let at = i => {
          let (face, slot) = slots->Array.getUnsafe(i)
          (faceletsOf(cube, face), CubePieces.cornerFaceletIndex(n, slot))
        }
        let twisted = edited(
          cube,
          copy => {
            let read = i => {
              let (facelets, index) = at(i)
              facelets->Array.getUnsafe(index)
            }
            let (a, b, c) = (read(0), read(1), read(2))
            let write = (i, color) => {
              let (face, slot) = slots->Array.getUnsafe(i)
              faceletsOf(copy, face)->Array.setUnsafe(CubePieces.cornerFaceletIndex(n, slot), color)
            }
            write(0, b)
            write(1, c)
            write(2, a)
          },
        )
        !valid(twisted, n)
      }),
    60000,
  )

  test(
    "two swapped corners are never a valid 3x3",
    () =>
      Fc.check(
        Fc.tuple3(
          Fc.array(moveOf(3), {minLength: 0, maxLength: 30}),
          Fc.integer({min: 0, max: 7}),
          Fc.integer({min: 1, max: 7}),
        ),
        ((moves, first, offset)) => {
          let n = 3
          let cube = scramble(n, moves)
          let second = mod(first + offset, 8)
          let swapped = edited(
            cube,
            copy => {
              let slotsA = CubePieces.cornerSlots->Array.getUnsafe(first)
              let slotsB = CubePieces.cornerSlots->Array.getUnsafe(second)
              for i in 0 to 2 {
                let (faceA, slotA) = slotsA->Array.getUnsafe(i)
                let (faceB, slotB) = slotsB->Array.getUnsafe(i)
                let (indexA, indexB) = (
                  CubePieces.cornerFaceletIndex(n, slotA),
                  CubePieces.cornerFaceletIndex(n, slotB),
                )
                let colorA = faceletsOf(cube, faceA)->Array.getUnsafe(indexA)
                let colorB = faceletsOf(cube, faceB)->Array.getUnsafe(indexB)
                faceletsOf(copy, faceA)->Array.setUnsafe(indexA, colorB)
                faceletsOf(copy, faceB)->Array.setUnsafe(indexB, colorA)
              }
            },
          )

          // One swap leaves the edges' permutation parity unmatched. (A
          // 2x2 reaches every swap - a quarter turn is already an odd
          // corner permutation - and larger cubes are checked by counting
          // wings, which a corner swap does not change.)
          !valid(swapped, n)
        },
      ),
    60000,
  )

  test(
    "a single flipped edge is never a valid 3x3",
    () =>
      Fc.check(
        Fc.tuple2(
          Fc.array(moveOf(3), {minLength: 0, maxLength: 30}),
          Fc.integer({min: 0, max: 11}),
        ),
        ((moves, edge)) => {
          let cube = scramble(3, moves)
          let ((faceA, lineA, reverseA), (faceB, lineB, reverseB)) =
            CubePieces.edgeLines->Array.getUnsafe(edge)
          let indexA = CubePieces.edgeLineFaceletIndex(3, lineA, reverseA, 1)
          let indexB = CubePieces.edgeLineFaceletIndex(3, lineB, reverseB, 1)
          let flipped = edited(
            cube,
            copy => {
              faceletsOf(copy, faceA)->Array.setUnsafe(
                indexA,
                faceletsOf(cube, faceB)->Array.getUnsafe(indexB),
              )
              faceletsOf(copy, faceB)->Array.setUnsafe(
                indexB,
                faceletsOf(cube, faceA)->Array.getUnsafe(indexA),
              )
            },
          )
          !valid(flipped, 3)
        },
      ),
    60000,
  )
})

// Odd sizes with few moves: faces stay close to uniform, so turning a
// face's stickers often still reads as real pieces, and the search finds
// several arrangements that fit. That is where both the filter and the
// list of tied arrangements get tested.
let oddScramble =
  Fc.constantFrom([3, 5, 7])->Fc.chain(n =>
    Fc.tuple2(Fc.constant(n), Fc.array(moveOf(n), {minLength: 0, maxLength: 4}))
  )

let gridOf = (facelets, n): CubeTypes.grid =>
  Array.fromInitializer(~length=n, r => facelets->Array.slice(~start=r * n, ~end=(r + 1) * n))

let facesOf = (cube: CubeState.cubeState, n): CubeTypes.faceSet<CubeTypes.grid> => {
  u: gridOf(cube.u, n),
  r: gridOf(cube.r, n),
  f: gridOf(cube.f, n),
  d: gridOf(cube.d, n),
  l: gridOf(cube.l, n),
  b: gridOf(cube.b, n),
}

let cubeOf = (faces: CubeTypes.faceSet<CubeTypes.grid>): CubeState.cubeState => {
  u: faces.u->Array.flat,
  r: faces.r->Array.flat,
  f: faces.f->Array.flat,
  d: faces.d->Array.flat,
  l: faces.l->Array.flat,
  b: faces.b->Array.flat,
}

// `faces` with one face's stickers turned by `turns` quarter turns.
let turnedFace = (faces: CubeTypes.faceSet<CubeTypes.grid>, face, turns) => {
  let turn = grid => CubeGeometry.rotateGrid(grid, turns)
  switch face {
  | CubeState.U => {...faces, u: turn(faces.u)}
  | R => {...faces, r: turn(faces.r)}
  | F => {...faces, f: turn(faces.f)}
  | D => {...faces, d: turn(faces.d)}
  | L => {...faces, l: turn(faces.l)}
  | B => {...faces, b: turn(faces.b)}
  }
}

let captureOf = (faces: CubeTypes.faceSet<CubeTypes.grid>) =>
  Dict.fromArray([
    ("u", faces.u),
    ("r", faces.r),
    ("f", faces.f),
    ("d", faces.d),
    ("l", faces.l),
    ("b", faces.b),
  ])

describe("middle edges of odd cubes", () => {
  test(
    "two swapped middle edges are never a valid odd cube",
    () =>
      Fc.check(
        Fc.tuple3(oddScramble, Fc.integer({min: 0, max: 11}), Fc.integer({min: 1, max: 11})),
        (((n, moves), first, offset)) => {
          let cube = scramble(n, moves)
          let wing = n / 2
          let second = mod(first + offset, 12)
          let swapped = edited(
            cube,
            copy => {
              let ((faceA1, lineA1, reverseA1), (faceB1, lineB1, reverseB1)) =
                CubePieces.edgeLines->Array.getUnsafe(first)
              let ((faceA2, lineA2, reverseA2), (faceB2, lineB2, reverseB2)) =
                CubePieces.edgeLines->Array.getUnsafe(second)
              let swap = ((face1, line1, reverse1), (face2, line2, reverse2)) => {
                let index1 = CubePieces.edgeLineFaceletIndex(n, line1, reverse1, wing)
                let index2 = CubePieces.edgeLineFaceletIndex(n, line2, reverse2, wing)
                faceletsOf(copy, face1)->Array.setUnsafe(
                  index1,
                  faceletsOf(cube, face2)->Array.getUnsafe(index2),
                )
                faceletsOf(copy, face2)->Array.setUnsafe(
                  index2,
                  faceletsOf(cube, face1)->Array.getUnsafe(index1),
                )
              }
              swap((faceA1, lineA1, reverseA1), (faceA2, lineA2, reverseA2))
              swap((faceB1, lineB1, reverseB1), (faceB2, lineB2, reverseB2))
            },
          )

          // One swap leaves the middle edges' permutation parity unmatched
          // with the corners', which no wing count can see.
          !valid(swapped, n)
        },
      ),
    60000,
  )

  test(
    "a face turned by a quarter or half turn is rejected, or offered among the tied arrangements",
    () =>
      Fc.check(
        Fc.tuple3(oddScramble, Fc.constantFrom(faces), Fc.integer({min: 1, max: 3})),
        (((n, moves), face, turns)) => {
          let held = facesOf(scramble(n, moves), n)
          let photographed = turnedFace(held, face, turns)
          let rejected = !valid(cubeOf(photographed), n)
          switch CubeAssembly.solveFaceOrientations(captureOf(photographed))->Null.toOption {
          | Some(solution) =>
            let offered = candidate =>
              solution.alternatives->Array.some(alternative => alternative.faces == candidate)
            // The cube as held always fits, and every arrangement offered
            // passes the parity report. A turned face that still passes
            // is undetectable, so it must be offered next to the real
            // one rather than picked in its place.
            solution.fullyValid &&
            !solution.truncated &&
            offered(held) &&
            solution.alternatives->Array.every(alternative =>
              valid(cubeOf(alternative.faces), n)
            ) &&
            (rejected || photographed == held || offered(photographed))
          | None => false
          }
        },
        ~runs=200,
      ),
    120000,
  )
})

// A wing's two stickers swapped: a 4x4+ capture whose wing pairs still
// count up, but with one wing reading as its mirror-image twin.
let flippedWing =
  Fc.integer({min: 4, max: 7})
  ->Fc.chain(n =>
    Fc.tuple4(
      Fc.constant(n),
      Fc.array(moveOf(n), {minLength: 0, maxLength: 30}),
      Fc.integer({min: 0, max: 11}),
      Fc.integer({min: 1, max: n - 2}),
    )
  )
  // The middle wing of an odd cube is its middle edge, covered above.
  ->Fc.map(((n, moves, edge, w)) => (n, moves, edge, mod(n, 2) == 1 && w == n / 2 ? 1 : w))

let withFlippedWing = (cube, n, edge, w) => {
  let ((faceA, lineA, reverseA), (faceB, lineB, reverseB)) =
    CubePieces.edgeLines->Array.getUnsafe(edge)
  let indexA = CubePieces.edgeLineFaceletIndex(n, lineA, reverseA, w)
  let indexB = CubePieces.edgeLineFaceletIndex(n, lineB, reverseB, w)
  edited(cube, copy => {
    faceletsOf(copy, faceA)->Array.setUnsafe(
      indexA,
      faceletsOf(cube, faceB)->Array.getUnsafe(indexB),
    )
    faceletsOf(copy, faceB)->Array.setUnsafe(
      indexB,
      faceletsOf(cube, faceA)->Array.getUnsafe(indexA),
    )
  })
}

describe("wings of big cubes", () => {
  test(
    "a flipped wing is never a valid cube",
    () =>
      Fc.check(flippedWing, ((n, moves, edge, w)) =>
        !valid(withFlippedWing(scramble(n, moves), n, edge, w), n)
      ),
    60000,
  )

  test(
    "the search offers only arrangements the parity report accepts for a flipped wing",
    () =>
      Fc.check(
        flippedWing,
        ((n, moves, edge, w)) => {
          let photographed = facesOf(withFlippedWing(scramble(n, moves), n, edge, w), n)
          switch CubeAssembly.solveFaceOrientations(captureOf(photographed))->Null.toOption {
          | Some(solution) =>
            !solution.fullyValid ||
            solution.alternatives->Array.every(alternative => valid(cubeOf(alternative.faces), n))
          | None => true
          }
        },
        ~runs=40,
      ),
    120000,
  )
})
