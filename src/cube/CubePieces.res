// The pieces every NxN cube has, where their stickers sit on the six faces,
// and how a reading is identified as a piece. The single source for both
// the parity report (Parity) and the orientation search's validity filter
// (CubeAssembly), which used to keep copies of these tables in sync by hand.
open CubeState

let solvedColor = (face: faceKey) =>
  switch face {
  | U => "W"
  | R => "R"
  | F => "G"
  | D => "Y"
  | L => "O"
  | B => "B"
  }

// ─── Corners (size-independent) ───────────────────────────────────────────────
// Every NxN cube has the same 8 corners, each in the same grid-corner slot
// of each of its 3 faces; only the facelet index of a slot depends on N.
type cornerPos = TL | TR | BL | BR

let cornerFaceletIndex = (n, slot) =>
  switch slot {
  | TL => 0
  | TR => n - 1
  | BL => n * (n - 1)
  | BR => n * n - 1
  }

let cornerNames = ["UFR", "UBR", "UBL", "UFL", "DFR", "DBR", "DBL", "DFL"]

// Per corner, its three facelets as (face, slot), read in the corner's
// geometric chirality (consistently around it as seen from outside), so a
// cyclic rotation of the reading is a twist and anything else a mirror
// image. The B face is viewed from outside the cube (mirrored left/right
// relative to F), confirmed against a real scrambled capture.
let cornerSlots = [
  [(U, BR), (R, TL), (F, TR)],
  [(U, TR), (B, TL), (R, TR)],
  [(U, TL), (L, TL), (B, TR)],
  [(U, BL), (F, TL), (L, TR)],
  [(D, TR), (F, BR), (R, BL)],
  [(D, BR), (R, BR), (B, BL)],
  [(D, BL), (B, BR), (L, BL)],
  [(D, TL), (L, BR), (F, BL)],
]

// The 8 corner color triples, in reading order, fixed for every N.
let solvedCorners = cornerSlots->Array.map(slots => {
  let color = i => {
    let (face, _) = slots->Array.getUnsafe(i)
    solvedColor(face)
  }
  (color(0), color(1), color(2))
})

// Which corner a reading is, and its twist (0/1/2) relative to that
// piece's solved orientation; None for an impossible combination.
let identifyCorner = ((a, b, c)) =>
  solvedCorners
  ->Array.findIndexOpt(((s0, s1, s2)) =>
    (a == s0 && b == s1 && c == s2) ||
    b == s0 && c == s1 && a == s2 ||
    (c == s0 && a == s1 && b == s2)
  )
  ->Option.map(index => {
    let (s0, s1, s2) = solvedCorners->Array.getUnsafe(index)
    let twist = a == s0 && b == s1 && c == s2 ? 0 : b == s0 && c == s1 && a == s2 ? 1 : 2
    (index, twist)
  })

// ─── Edges and wings (size-independent) ───────────────────────────────────────
// On a 4x4+ cube each edge splits into N-2 wings. A wing at distance w
// (1..N-2) from the edge's first corner has one sticker on each face, on
// one of the face's border lines. Derived from explicit 3D coordinates for
// all 6 faces - a shortcut from the corner slots got UR, UB, DB and DL
// wrong, invisible on 3x3's single self-symmetric wing. `reverse` reads
// that face's line at N-1-w. On a 3x3 the one wing is the edge itself.
type edgeLine = TopLine | BottomLine | LeftLine | RightLine

let lineFaceletIndex = (n, line, w) =>
  switch line {
  | TopLine => w
  | BottomLine => n * (n - 1) + w
  | LeftLine => w * n
  | RightLine => w * n + (n - 1)
  }

let edgeLineFaceletIndex = (n, line, reverse, w) =>
  lineFaceletIndex(n, line, reverse ? n - 1 - w : w)

let edgeNames = ["UF", "UR", "UB", "UL", "DF", "DR", "DB", "DL", "FR", "FL", "BR", "BL"]

// Per edge, (faceA, lineA, reverseA) and (faceB, lineB, reverseB).
let edgeLines = [
  ((U, BottomLine, false), (F, TopLine, false)),
  ((U, RightLine, false), (R, TopLine, true)),
  ((U, TopLine, false), (B, TopLine, true)),
  ((U, LeftLine, false), (L, TopLine, false)),
  ((D, TopLine, false), (F, BottomLine, false)),
  ((D, RightLine, false), (R, BottomLine, false)),
  ((D, BottomLine, false), (B, BottomLine, true)),
  ((D, LeftLine, false), (L, BottomLine, true)),
  ((F, RightLine, false), (R, LeftLine, false)),
  ((F, LeftLine, false), (L, RightLine, false)),
  ((B, LeftLine, false), (R, RightLine, false)),
  ((B, RightLine, false), (L, LeftLine, false)),
]

// The 12 edge color pairs, in reading order, fixed for every N.
let solvedEdges =
  edgeLines->Array.map((((faceA, _, _), (faceB, _, _))) => (solvedColor(faceA), solvedColor(faceB)))

// Which edge a reading is, and whether it is flipped; None for two colors
// that never share an edge.
let identifyEdge = ((a, b)) =>
  solvedEdges
  ->Array.findIndexOpt(((s0, s1)) => (a == s0 && b == s1) || (a == s1 && b == s0))
  ->Option.map(index => {
    let (s0, _) = solvedEdges->Array.getUnsafe(index)
    (index, a == s0 ? 0 : 1)
  })

// ─── Permutations ─────────────────────────────────────────────────────────────
// Even permutation: its length minus its cycle count is even.
let permParity = perm => {
  let visited = Array.make(~length=Array.length(perm), false)
  let cycles = ref(0)
  perm->Array.forEachWithIndex((_, i) =>
    if !(visited->Array.getUnsafe(i)) {
      let j = ref(i)
      while !(visited->Array.getUnsafe(j.contents)) {
        visited->Array.setUnsafe(j.contents, true)
        j := perm->Array.getUnsafe(j.contents)
      }
      cycles := cycles.contents + 1
    }
  )
  mod(Array.length(perm) - cycles.contents, 2) == 0
}

let sum = values => values->Array.reduce(0, (a, b) => a + b)
