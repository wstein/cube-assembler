// Cube state assembly from captured faces, and the search for each face's
// identity and rotation.
open CubeState
open! CubeTypes

let toCubeIR = (cube: cubeState, size): cubeIR => {
  let grid = data => {n: size, data}
  {
    size,
    u: grid(cube.u),
    r: grid(cube.r),
    f: grid(cube.f),
    d: grid(cube.d),
    l: grid(cube.l),
    b: grid(cube.b),
  }
}

let solvedColor = CubePieces.solvedColor

let faceOfColor = color => faceKeys->Array.find(face => solvedColor(face) == color)

let faceLetter = (face: faceKey) =>
  switch face {
  | U => "U"
  | R => "R"
  | F => "F"
  | D => "D"
  | L => "L"
  | B => "B"
  }

let assembleCubeFromFaces = (faces: Dict.t<grid>, size): cubeState => {
  let flat = face =>
    switch faces->Dict.get(faceLetter(face)) {
    | Some(grid) => grid->Array.flat
    | None => Array.make(~length=size * size, solvedColor(face))
    }
  {u: flat(U), r: flat(R), f: flat(F), d: flat(D), l: flat(L), b: flat(B)}
}

// ─────────────────────────────────────────────────────────────────────────────
// Face identity + orientation solving
//
// The user captures 6 faces in an arbitrary physical orientation - the app
// has no way to know which capture is "the U face" or which way up it was
// held. For odd-sized cubes (3x3, 5x5, 7x7 - the ones with a fixed,
// non-rotating center piece), the center sticker's color directly and
// unambiguously identifies the face (WCA convention: White=U, Yellow=D,
// Green=F, Blue=B, Orange=L, Red=R). That alone fixes WHICH captured face
// is which, but not each face's ROTATION (0/90/180/270) relative to the
// other 5 - a corner or edge that should show a valid, physically-real
// color combination will only do so once every face is rotated correctly.
//
// Solved by corner cubies first, then edges, matching how a human (or a
// solver) actually reasons about a scrambled cube: corners are 3-way
// junctions (8 of them) and far more discriminating than edges (2-way, 12
// of them). Edges only break ties among rotation assignments that already
// score equally well on corners.
// ─────────────────────────────────────────────────────────────────────────────

// The corners and edges, from CubePieces (shared with the parity report):
// each corner with its three faces and grid-corner positions, read in its
// chirality; each edge read at its middle wing.
type corner = {
  faces: (faceKey, faceKey, faceKey),
  positions: (CubePieces.cornerPos, CubePieces.cornerPos, CubePieces.cornerPos),
}
type edge = {
  a: (faceKey, CubePieces.edgeLine, bool),
  b: (faceKey, CubePieces.edgeLine, bool),
}

let corners = CubePieces.cornerSlots->Array.map(slots => {
  let (f1, p1) = slots->Array.getUnsafe(0)
  let (f2, p2) = slots->Array.getUnsafe(1)
  let (f3, p3) = slots->Array.getUnsafe(2)
  {faces: (f1, f2, f3), positions: (p1, p2, p3)}
})
let edges = CubePieces.edgeLines->Array.map(((a, b)) => {a, b})

// All valid ordered triples/pairs, including every cyclic rotation (corner
// twist) / flip (edge flip) - both are legal on a real, possibly-scrambled
// cube, so a "wrong-looking" order alone must not be flagged.
let validCornerTriples = Set.fromArray(
  CubePieces.solvedCorners->Array.flatMap(((a, b, c)) => [a ++ b ++ c, b ++ c ++ a, c ++ a ++ b]),
)
let validEdgePairs = Set.fromArray(
  CubePieces.solvedEdges->Array.flatMap(((a, b)) => [a ++ b, b ++ a]),
)

let cornerSticker = (grid: grid, pos: CubePieces.cornerPos) => {
  let n = Array.length(grid)
  let at = (r, c) => grid->Array.getUnsafe(r)->Array.getUnsafe(c)
  switch pos {
  | TL => at(0, 0)
  | TR => at(0, n - 1)
  | BL => at(n - 1, 0)
  | BR => at(n - 1, n - 1)
  }
}

// A wing's sticker on one face: the face's border line at distance w, or
// at N-1-w when that face reads the edge the other way.
let edgeLineSticker = (grid: grid, line: CubePieces.edgeLine, reverse, w) => {
  let n = Array.length(grid)
  let pos = reverse ? n - 1 - w : w
  let at = (r, c) => grid->Array.getUnsafe(r)->Array.getUnsafe(c)
  switch line {
  | TopLine => at(0, pos)
  | BottomLine => at(n - 1, pos)
  | LeftLine => at(pos, 0)
  | RightLine => at(pos, n - 1)
  }
}

let cornerTriple = (faces, corner: corner) => {
  let (f1, f2, f3) = corner.faces
  let (p1, p2, p3) = corner.positions
  (
    cornerSticker(faceValue(faces, f1), p1),
    cornerSticker(faceValue(faces, f2), p2),
    cornerSticker(faceValue(faces, f3), p3),
  )
}

let wingPair = (faces, edge: edge, w) => {
  let (faceA, lineA, reverseA) = edge.a
  let (faceB, lineB, reverseB) = edge.b
  (
    edgeLineSticker(faceValue(faces, faceA), lineA, reverseA, w),
    edgeLineSticker(faceValue(faces, faceB), lineB, reverseB, w),
  )
}

// One representative sticker per side - enough as a corroborating signal.
let edgePair = (faces: faceSet<grid>, edge) => wingPair(faces, edge, Array.length(faces.u) / 2)

let scoreCorners = faces =>
  corners->Array.reduce(0, (score, corner) => {
    let (a, b, c) = cornerTriple(faces, corner)
    validCornerTriples->Set.has(a ++ b ++ c) ? score + 1 : score
  })

let scoreEdges = faces =>
  edges->Array.reduce(0, (score, edge) => {
    let (a, b) = edgePair(faces, edge)
    validEdgePairs->Set.has(a ++ b) ? score + 1 : score
  })

// ─────────────────────────────────────────────────────────────────────────────
// Full validity (distinct pieces + orientation sums + matching permutation
// parity) - the parity report's rules, but as a filter the rotation SEARCH
// itself optimizes for, not a check run afterward.
//
// scoreCorners/scoreEdges check each position against the SET of real
// pieces independently - "is this ANY valid corner" - so a rotation that
// reads one piece into two slots can still score a perfect 8/8 or 12/12
// despite being physically impossible. A real capture hit exactly that
// (corner pieces [0,1,1,0,7,6,6,7]). So each position is identified as a
// specific piece, a piece claimed twice rejects the candidate, and the same
// orientation-sum and permutation-parity invariants apply.
// ─────────────────────────────────────────────────────────────────────────────

// The pieces the positions show, in order, with their twists or flips; None
// once any position shows an impossible piece or one already seen.
let identifyAll = (count, read) => {
  let used = Array.make(~length=count, false)
  let pieces = []
  let turns = []
  let ok = ref(true)
  for position in 0 to count - 1 {
    if ok.contents {
      switch read(position) {
      | Some((piece, turn)) if !(used->Array.getUnsafe(piece)) =>
        used->Array.setUnsafe(piece, true)
        pieces->Array.push(piece)
        turns->Array.push(turn)
      | _ => ok := false
      }
    }
  }
  ok.contents ? Some((pieces, turns)) : None
}

let range = (from, to) =>
  from > to ? [] : Array.fromInitializer(~length=to - from + 1, i => from + i)

// Wing-edge validity for N>3. Corners alone don't fully constrain a 4x4+'s
// per-face rotation; without this the search had no signal that a
// corner-valid candidate's wings were scrambled, and settled on a wrong
// rotation on a real reported capture. Counting check only (a full check
// would need per-depth wing orbits on N>=5): every wing sticker pair must
// be one of the 12 real pairs, and each pair must appear exactly N-2 times.
// It can accept too much on N>=5 but never rejects a real cube.
let wingEdgeCountsValid = (faces, n) => {
  let counts = Array.make(~length=Array.length(edges), 0)
  let valid = edges->Array.every(edge =>
    range(1, n - 2)->Array.every(w =>
      switch CubePieces.identifyEdge(wingPair(faces, edge, w)) {
      | Some((index, _)) =>
        counts->Array.setUnsafe(index, counts->Array.getUnsafe(index) + 1)
        true
      | None => false
      }
    )
  )
  valid && counts->Array.every(count => count == n - 2)
}

let isFullyValid = (faces: faceSet<grid>) => {
  let n = Array.length(faces.u)
  switch identifyAll(Array.length(corners), i =>
    CubePieces.identifyCorner(cornerTriple(faces, corners->Array.getUnsafe(i)))
  ) {
  | Some((cornerPieces, twists)) if mod(CubePieces.sum(twists), 3) == 0 =>
    if n == 2 {
      // No edges at all: corner distinctness and orientation are complete.
      true
    } else if n > 3 {
      wingEdgeCountsValid(faces, n)
    } else {
      switch identifyAll(Array.length(edges), i =>
        CubePieces.identifyEdge(edgePair(faces, edges->Array.getUnsafe(i)))
      ) {
      | Some((edgePieces, flips)) =>
        mod(CubePieces.sum(flips), 2) == 0 &&
          CubePieces.permParity(cornerPieces) == CubePieces.permParity(edgePieces)
      | None => false
      }
    }
  | _ => false
  }
}

// Cap on how many distinct tied-for-best candidates to keep. A real 4x4
// with independently symmetric R/D/L wing patterns hit 36 genuine ties, so
// the cap is generous; `truncated` tells when it still binds.
let maxAlternatives = 48

// The candidate's actual sticker content, for dedup - rotations of a
// uniformly colored face give identical content and are one candidate.
let faceSetSignature = (faces: faceSet<grid>) =>
  faceKeys
  ->Array.map(face => faceValue(faces, face)->Array.map(row => row->Array.join(""))->Array.join(""))
  ->Array.join("|")

type best = {
  mutable cornerScore: int,
  mutable edgeScore: float,
  mutable fullyValid: bool,
  mutable alternatives: array<orientedCandidate>,
  mutable seenSignatures: Set.t<string>,
  mutable truncated: bool,
}

// Scores one fully assigned, rotated candidate and folds it into `best`,
// collecting EVERY distinct candidate tied for the winning score. A fully
// valid candidate always beats one that isn't; then more valid corners,
// then valid edges (on a 2x2, corners are the only signal).
let considerCandidate = (faces: faceSet<grid>, rotations, best: option<best>) => {
  let hasEdges = Array.length(faces.u) > 2
  let fullyValid = isFullyValid(faces)
  let cornerScore = scoreCorners(faces)
  let edgeScore = hasEdges ? Int.toFloat(scoreEdges(faces)) : Float.Constants.nan
  let fresh = () => Some({
    cornerScore,
    edgeScore,
    fullyValid,
    alternatives: [{faces, rotations}],
    seenSignatures: Set.fromArray([faceSetSignature(faces)]),
    truncated: false,
  })
  switch best {
  | None => fresh()
  | Some(current) =>
    let sameValidity = fullyValid == current.fullyValid
    if (
      (fullyValid && !current.fullyValid) ||
      sameValidity && cornerScore > current.cornerScore ||
      (sameValidity &&
      cornerScore == current.cornerScore &&
      hasEdges &&
      edgeScore > current.edgeScore)
    ) {
      fresh()
    } else {
      if (
        sameValidity &&
        cornerScore == current.cornerScore &&
        (!hasEdges || edgeScore == current.edgeScore)
      ) {
        let signature = faceSetSignature(faces)
        if !(current.seenSignatures->Set.has(signature)) {
          if Array.length(current.alternatives) < maxAlternatives {
            current.seenSignatures->Set.add(signature)
            current.alternatives->Array.push({faces, rotations})
          } else {
            current.truncated = true
          }
        }
      }
      best
    }
  }
}

let toOrientationSolution = (best: option<best>) =>
  best->Option.map((best): orientationSolution => {
    let first = best.alternatives->Array.getUnsafe(0)
    {
      faces: first.faces,
      rotations: first.rotations,
      cornerScore: best.cornerScore,
      edgeScore: best.edgeScore,
      fullyValid: best.fullyValid,
      alternatives: best.alternatives,
      truncated: best.truncated,
    }
  })

let rotateGrid = CubeGeometry.rotateGrid

// Odd sizes (3x3, 5x5, 7x7): each face's fixed center sticker identifies
// it, so only rotation (4^6 = 4096 combinations) needs solving. None if the
// centers don't identify all 6 faces uniquely.
let solveOddSizeOrientations = (captured: Dict.t<grid>, size) => {
  let mid = size / 2
  let byIdentity = Dict.make()
  let unique =
    captured
    ->Dict.valuesToArray
    ->Array.every(colors => {
      let center = colors->Array.getUnsafe(mid)->Array.getUnsafe(mid)
      switch faceOfColor(center) {
      | Some(face) if byIdentity->Dict.get(faceLetter(face))->Option.isNone =>
        byIdentity->Dict.set(faceLetter(face), colors)
        true
      | _ => false
      }
    })
  let face = key => byIdentity->Dict.get(key)
  switch (unique, face("U"), face("R"), face("F"), face("D"), face("L"), face("B")) {
  | (true, Some(u), Some(r), Some(f), Some(d), Some(l), Some(b)) =>
    let turned = (grid: grid) => [0, 1, 2, 3]->Array.map(turns => rotateGrid(grid, turns))
    let (tu, tr, tf, td, tl, tb) = (
      turned(u),
      turned(r),
      turned(f),
      turned(d),
      turned(l),
      turned(b),
    )
    let best = ref(None)
    for ru in 0 to 3 {
      for rr in 0 to 3 {
        for rf in 0 to 3 {
          for rd in 0 to 3 {
            for rl in 0 to 3 {
              for rb in 0 to 3 {
                let faces = {
                  u: tu->Array.getUnsafe(ru),
                  r: tr->Array.getUnsafe(rr),
                  f: tf->Array.getUnsafe(rf),
                  d: td->Array.getUnsafe(rd),
                  l: tl->Array.getUnsafe(rl),
                  b: tb->Array.getUnsafe(rb),
                }
                let rotations = {u: ru, r: rr, f: rf, d: rd, l: rl, b: rb}
                best := considerCandidate(faces, rotations, best.contents)
              }
            }
          }
        }
      }
    }
    toOrientationSolution(best.contents)
  | _ => None
  }
}

let rec permutations = (values: array<int>) =>
  Array.length(values) <= 1
    ? [values]
    : values->Array.flatMapWithIndex((value, i) =>
        permutations(values->Array.filterWithIndex((_, j) => j != i))->Array.map(rest =>
          [value, ...rest]
        )
      )

// Even sizes (2x2, 4x4, 6x6): center stickers belong to independently
// rotatable center cubies, so each face's identity has to be searched
// jointly with rotation. Fixing capture #1 as U at rotation 0 cuts the
// 6! x 4^6 combinations by the cube's 24 rotations to 5! x 4^5 = 122,880
// (any solution can be re-expressed with capture #1 there). U is the anchor
// so the orientation wizard never has to ask about it.
let solveEvenSizeOrientations = (captured: Dict.t<grid>) => {
  let captures = captured->Dict.valuesToArray
  if Array.length(captures) != 6 {
    None
  } else {
    let first = rotateGrid(captures->Array.getUnsafe(0), 0)
    let restRotations =
      captures
      ->Array.slice(~start=1)
      ->Array.map(capture => [0, 1, 2, 3]->Array.map(turns => rotateGrid(capture, turns)))
    let pick = (order, mask, slot) => {
      let rotation = mod(mask / [1, 4, 16, 64, 256]->Array.getUnsafe(slot), 4)
      (
        restRotations->Array.getUnsafe(order->Array.getUnsafe(slot))->Array.getUnsafe(rotation),
        rotation,
      )
    }
    let best = ref(None)
    permutations([0, 1, 2, 3, 4])->Array.forEach(order =>
      for mask in 0 to 1023 {
        let (r, rr) = pick(order, mask, 0)
        let (f, rf) = pick(order, mask, 1)
        let (d, rd) = pick(order, mask, 2)
        let (l, rl) = pick(order, mask, 3)
        let (b, rb) = pick(order, mask, 4)
        best :=
          considerCandidate(
            {u: first, r, f, d, l, b},
            {u: 0, r: rr, f: rf, d: rd, l: rl, b: rb},
            best.contents,
          )
      }
    )
    toOrientationSolution(best.contents)
  }
}

// Identifies each captured face and solves for the rotation of each that
// maximizes how many of the cube's corners show a valid color triple,
// using edges only to break ties. None if face identity can't be
// determined at all (odd: duplicate/unreadable center; even: not exactly 6
// captures) - not if the result merely scores imperfectly.
let solveFaceOrientations = (captured: Dict.t<grid>) =>
  switch captured->Dict.valuesToArray->Array.get(0)->Option.map(Array.length) {
  | Some(size) if size > 0 =>
    Null.fromOption(
      mod(size, 2) == 1
        ? solveOddSizeOrientations(captured, size)
        : solveEvenSizeOrientations(captured),
    )
  | _ => Null.null
  }

// How many stickers already sit on the face of their own color - used to
// pick which of the 24 whole-cube orientations to present an arrangement
// in. Centers count far more on odd sizes, since they pin each face's
// identity; even sizes have none.
let standardLookScore = (faces: faceSet<grid>) => {
  let n = Array.length(faces.u)
  let mid = n / 2
  faceKeys->Array.reduce(0, (score, face) => {
    let color = solvedColor(face)
    let grid = faceValue(faces, face)
    let stickers =
      grid->Array.reduce(0, (count, row) =>
        row->Array.reduce(count, (count, sticker) => sticker == color ? count + 1 : count)
      )
    let centre =
      mod(n, 2) == 1 && grid->Array.getUnsafe(mid)->Array.getUnsafe(mid) == color ? 1000 : 0
    score + stickers + centre
  })
}

let allOrientations = faces =>
  CubeGeometry.allOrientations(toGeometry(faces))->Array.map(fromGeometry)

// On odd sizes validity depends on how the whole cube is held: pieces and
// parity are judged against the standard color scheme with white on U, so
// an arrangement in the capture's own frame is turned into standard
// orientation first. On even sizes this only picks a familiar-looking one.
let toStandardOrientation = faces => {
  let best = ref(faces)
  let bestScore = ref(-1)
  allOrientations(faces)->Array.forEach(oriented => {
    let score = standardLookScore(oriented)
    if score > bestScore.contents {
      best := oriented
      bestScore := score
    }
  })
  best.contents
}

// Same content held differently is the same cube: the smallest signature
// over all 24 orientations identifies it regardless of how it's held.
let orientationFreeSignature = faces =>
  allOrientations(faces)
  ->Array.map(faceSetSignature)
  ->Array.reduce(None, (smallest, signature) =>
    switch smallest {
    | Some(smallest) if smallest <= signature => Some(smallest)
    | _ => Some(signature)
    }
  )
  ->Option.getOr("")

type scored = {
  faces: faceSet<grid>,
  arrangement: guidedArrangement,
  fullyValid: bool,
  cornerScore: int,
  edgeScore: float,
}

let rankOf = (a: scored) => [
  a.fullyValid ? 1.0 : 0.0,
  Int.toFloat(a.cornerScore),
  Float.isNaN(a.edgeScore) ? 0.0 : a.edgeScore,
]

// Best first: fully valid, then more valid corners, then edges.
let compareScored = (a, b) => {
  let (ra, rb) = (rankOf(a), rankOf(b))
  let result = ref(0.0)
  for i in 2 downto 0 {
    let (x, y) = (ra->Array.getUnsafe(i), rb->Array.getUnsafe(i))
    if x != y {
      result := y -. x
    }
  }
  result.contents
}

// Guided capture: the 64 arrangements the turning pattern allows, each in
// standard orientation, best first and deduped by content regardless of
// how the cube is held. None when a photo is missing or sizes differ.
let solveGuidedCapture = (capture: guidedCapture) => {
  let grids = [...capture.sides, ...capture.caps]->Array.map(Nullable.toOption)
  let n = grids[0]->Option.flatMap(grid => grid)->Option.map(Array.length)
  let complete =
    Array.length(capture.sides) == 4 &&
    Array.length(capture.caps) == 2 &&
    switch n {
    | Some(n) if n > 0 =>
      grids->Array.every(grid => grid->Option.mapOr(false, grid => Array.length(grid) == n))
    | _ => false
    }
  if !complete {
    Null.null
  } else {
    let n = n->Option.getOrThrow
    let photo = i => grids->Array.getUnsafe(i)->Option.getOrThrow
    let (s1, s2, s3, s4, c1, c2) = (photo(0), photo(1), photo(2), photo(3), photo(4), photo(5))
    let scored = []
    [CubeTypes.Left, CubeTypes.Right]->Array.forEach(turn =>
      [false, true]->Array.forEach(capsSwapped =>
        for r1 in 0 to 3 {
          for r2 in 0 to 3 {
            let cap1 = rotateGrid(c1, r1)
            let cap2 = rotateGrid(c2, r2)
            // Turning left brings the right-hand face to the front, so the
            // second side photo is R; turning right, it's L.
            let frame = {
              f: s1,
              r: turn == CubeTypes.Left ? s2 : s4,
              b: s3,
              l: turn == CubeTypes.Left ? s4 : s2,
              u: capsSwapped ? cap2 : cap1,
              d: capsSwapped ? cap1 : cap2,
            }
            let faces = toStandardOrientation(frame)
            scored->Array.push({
              faces,
              arrangement: {turn, capsSwapped, capRotations: (r1, r2)},
              fullyValid: isFullyValid(faces),
              cornerScore: scoreCorners(faces),
              edgeScore: n > 2 ? Int.toFloat(scoreEdges(faces)) : Float.Constants.nan,
            })
          }
        }
      )
    )
    let sorted = scored->Array.toSorted(compareScored)
    let leader = sorted->Array.getUnsafe(0)
    let seen = Set.make()
    let unique =
      sorted
      ->Array.filter(candidate => compareScored(candidate, leader) == 0.0)
      ->Array.filter(candidate => {
        let signature = orientationFreeSignature(candidate.faces)
        let fresh = !(seen->Set.has(signature))
        seen->Set.add(signature)
        fresh
      })
    let kept = unique->Array.slice(~start=0, ~end=maxAlternatives)
    let first = kept->Array.getUnsafe(0)
    let none = {u: 0, r: 0, f: 0, d: 0, l: 0, b: 0}
    Null.make({
      faces: first.faces,
      rotations: none,
      cornerScore: first.cornerScore,
      edgeScore: first.edgeScore,
      fullyValid: first.fullyValid,
      alternatives: kept->Array.map(candidate => {faces: candidate.faces, rotations: none}),
      arrangements: kept->Array.map(candidate => candidate.arrangement),
      truncated: Array.length(unique) > Array.length(kept),
    })
  }
}
