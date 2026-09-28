// Cube validity (color balance, corners, edges, wings and their parity)
// with the stickers to point at when a check fails. Runs in the browser, so
// the check also works on the static GitHub Pages site. The pieces and how
// a reading is identified come from CubePieces, shared with the
// orientation search's faster yes/no check (CubeAssembly's isFullyValid).
open CubeState

type faceletRef = {face: string, index: int}

// One corner/edge/wing reading implicated in a failure: its facelets, plus
// `group` - the color combination (or matched piece name) it read as.
// Entries sharing a group are the same physical piece read at different
// positions, or wings that all matched the same over-represented pair -
// the set to cross-highlight, since one of them is the misread one.
type highlightGroup = {group: string, facelets: array<faceletRef>}

type parityResult = {
  valid: bool,
  result: string,
  checks: Dict.t<bool>,
  // The stickers implicated in `result` when the failure is local enough
  // to point at; omitted for global failures (an orientation-sum or
  // permutation parity mismatch). An invalid color balance highlights
  // every sticker of each over-represented color.
  highlight?: array<highlightGroup>,
  // More explanation of `result`, where there is more to say.
  detail?: string,
}

type wingResult = {
  valid: bool,
  result?: string,
  highlight?: array<highlightGroup>,
}

let colorOrder = ["W", "O", "G", "R", "B", "Y"]
let colorName = color =>
  switch color {
  | "W" => "White"
  | "O" => "Orange"
  | "G" => "Green"
  | "R" => "Red"
  | "B" => "Blue"
  | "Y" => "Yellow"
  | other => other
  }

let faceNames = ["u", "r", "f", "d", "l", "b"]

let getFace = (cube: cubeIR, key) =>
  switch key {
  | "u" => cube.u
  | "r" => cube.r
  | "f" => cube.f
  | "d" => cube.d
  | "l" => cube.l
  | "b" => cube.b
  | _ => JsError.throwWithMessage(`Unknown cube face: ${key}`)
  }

// The first Some that `f` returns for a value and its index.
let findMapWithIndex = (values, f) => {
  let result = ref(None)
  let i = ref(0)
  while result.contents->Option.isNone && i.contents < Array.length(values) {
    result := f(values->Array.getUnsafe(i.contents), i.contents)
    i := i.contents + 1
  }
  result.contents
}

let sticker = (cube, face, index) => getFace(cube, face).data->Array.getUnsafe(index)

// ─── Color balance ────────────────────────────────────────────────────────────

let countColors = (cube: cubeIR) => {
  let counts = Dict.fromArray(colorOrder->Array.map(color => (color, 0)))
  faceNames->Array.forEach(face =>
    getFace(cube, face).data->Array.forEach(color =>
      switch counts->Dict.get(color) {
      | Some(count) => counts->Dict.set(color, count + 1)
      | None => ()
      }
    )
  )
  counts
}

let countOf = (counts, color) => counts->Dict.get(color)->Option.getOr(0)

let validateColorBalance = (cube: cubeIR) => {
  let counts = countColors(cube)
  colorOrder->Array.every(color => countOf(counts, color) == cube.size * cube.size)
}

// Which colors are off, for an invalid color balance: a sentence for the
// customer, and every sticker of each over-represented color as one
// highlight group - one of those is the misread (or hand-set) sticker.
let colorBalanceReport = (cube: cubeIR) => {
  let counts = countColors(cube)
  let expected = cube.size * cube.size
  let off = colorOrder->Array.filter(color => countOf(counts, color) != expected)
  let detail =
    off
    ->Array.map(color => `${colorName(color)} ${Int.toString(countOf(counts, color))}`)
    ->Array.join(", ") ++ ` - each color should appear ${Int.toString(expected)} times`
  let highlight =
    off
    ->Array.filter(color => countOf(counts, color) > expected)
    ->Array.map(color => {
      group: `${colorName(color)} ×${Int.toString(countOf(counts, color))}`,
      facelets: faceNames->Array.flatMap(face =>
        getFace(cube, face).data->Array.flatMapWithIndex(
          (c, index) => c == color ? [{face, index}] : [],
        )
      ),
    })
  (detail, highlight)
}

// ─── Pieces (see CubePieces) ──────────────────────────────────────────────────

// A face as the facelet references name it: "u" .. "b".
let faceName = (face: faceKey) => String.toLowerCase((face :> string))

let pairName = ((a, b)) => `${a}-${b}`

exception UnknownWing(wingResult)

// Validates wing stickers by counting, not full permutation/orientation
// parity: every wing pair must be one of the 12 real color pairs, and each
// must appear exactly N-2 times. Wings of every depth are pooled (on N>=5
// they are separate orbits), which can only make this weaker, never reject
// a valid cube.
let validateWingEdges = (cube: cubeIR): wingResult => {
  let n = cube.size
  let counts = Array.make(~length=Array.length(CubePieces.solvedEdges), 0)
  // Every wing reading's facelets, grouped by the pair it matched, so an
  // over-represented pair can point at exactly its wings.
  let faceletsByPair = CubePieces.solvedEdges->Array.map(_ => [])
  try {
    CubePieces.edgeLines->Array.forEachWithIndex((
      ((keyA, lineA, reverseA), (keyB, lineB, reverseB)),
      edge,
    ) =>
      for w in 1 to n - 2 {
        let edgeName = CubePieces.edgeNames->Array.getUnsafe(edge)
        let faceA = faceName(keyA)
        let faceB = faceName(keyB)
        let indexA = CubePieces.edgeLineFaceletIndex(n, lineA, reverseA, w)
        let indexB = CubePieces.edgeLineFaceletIndex(n, lineB, reverseB, w)
        let colors = (sticker(cube, faceA, indexA), sticker(cube, faceB, indexB))
        let facelets = [{face: faceA, index: indexA}, {face: faceB, index: indexB}]
        switch CubePieces.identifyEdge(colors) {
        | Some((pi, _)) =>
          counts->Array.setUnsafe(pi, counts->Array.getUnsafe(pi) + 1)
          faceletsByPair->Array.getUnsafe(pi)->Array.push(facelets)
        | None =>
          // Names the two colors and exactly where they were read, since
          // two same or opposite colors can never touch on a real cube.
          let (c0, c1) = colors
          throw(
            UnknownWing({
              valid: false,
              result: `Unknown wing edge color pair "${c0}-${c1}" at edge ${edgeName} (wing ${Int.toString(
                  w,
                )} of ${Int.toString(
                  n - 2,
                )}, reading ${faceA}+${faceB}) - two same or opposite colors can never physically touch, so one of these two stickers was misread`,
              highlight: [{group: `${c0}-${c1}`, facelets}],
            }),
          )
        }
      }
    )
    let expected = n - 2
    if counts->Array.every(count => count == expected) {
      {valid: true}
    } else {
      // Every pair that is off, with its count - the over/under pattern
      // shows which two colors are being confused.
      let offending =
        CubePieces.solvedEdges
        ->Array.mapWithIndex((pair, i) => (pairName(pair), counts->Array.getUnsafe(i)))
        ->Array.filter(((_, count)) => count != expected)
        ->Array.map(((pair, count)) =>
          `${pair} has ${Int.toString(count)} (expected ${Int.toString(expected)})`
        )
      // A pair with fewer than expected is simply missing; the misread
      // stickers hide among the over-represented pairs' wings.
      let highlight = counts->Array.flatMapWithIndex((count, i) =>
        count > expected
          ? faceletsByPair
            ->Array.getUnsafe(i)
            ->Array.map(facelets => {
              group: pairName(CubePieces.solvedEdges->Array.getUnsafe(i)),
              facelets,
            })
          : []
      )
      {
        valid: false,
        result: `Wing edge color-pair counts unbalanced: ${offending->Array.join(", ")}`,
        highlight,
      }
    }
  } catch {
  | UnknownWing(result) => result
  }
}

let validResult = "Valid — all parity checks passed"

// 3x3 edges: which piece each position shows, then their flip sum and the
// corner/edge permutation parity.
let runEdgeChecks = (cube, checks, cornerPieces): parityResult => {
  let edgePieces = []
  let edgeOrients = []
  let edgeFacelets = []
  let unknown = CubePieces.edgeLines->Array.findMap(((
    (keyA, lineA, reverseA),
    (keyB, lineB, reverseB),
  )) => {
    // A 3x3's one wing is the edge itself.
    let (fa, ia) = (faceName(keyA), CubePieces.edgeLineFaceletIndex(3, lineA, reverseA, 1))
    let (fb, ib) = (faceName(keyB), CubePieces.edgeLineFaceletIndex(3, lineB, reverseB, 1))
    let (c0, c1) = (sticker(cube, fa, ia), sticker(cube, fb, ib))
    let facelets = [{face: fa, index: ia}, {face: fb, index: ib}]
    let found = CubePieces.identifyEdge((c0, c1))
    switch found {
    | Some((piece, flip)) =>
      edgePieces->Array.push(piece)
      edgeOrients->Array.push(flip)
      edgeFacelets->Array.push(facelets)
      None
    | None => Some({group: `${c0}-${c1}`, facelets})
    }
  })
  switch unknown {
  | Some(group) =>
    checks->Dict.set("edgeColors", false)
    {valid: false, result: "Unknown edge color pair", checks, highlight: [group]}
  | None =>
    // The same distinctness gap as for corners.
    let duplicate = edgePieces->findMapWithIndex((piece, slot) =>
      edgePieces
      ->Array.slice(~start=0, ~end=slot)
      ->Array.findIndexOpt(earlier => earlier == piece)
      ->Option.map(first => (piece, first, slot))
    )
    switch duplicate {
    | Some((piece, first, slot)) =>
      checks->Dict.set("edgeColors", false)
      let name = CubePieces.edgeNames->Array.getUnsafe(piece)
      {
        valid: false,
        result: "Duplicate edge piece (two positions read the same physical edge)",
        checks,
        highlight: [
          {group: name, facelets: edgeFacelets->Array.getUnsafe(first)},
          {group: name, facelets: edgeFacelets->Array.getUnsafe(slot)},
        ],
      }
    | None =>
      checks->Dict.set("edgeColors", true)
      let edgeOrientSum = CubePieces.sum(edgeOrients)
      checks->Dict.set("edgeOrientation", mod(edgeOrientSum, 2) == 0)
      if mod(edgeOrientSum, 2) != 0 {
        {
          valid: false,
          result: `Edge orientation sum ${Int.toString(edgeOrientSum)} ≢ 0 (mod 2)`,
          checks,
          highlight: edgeFacelets->Array.mapWithIndex((facelets, slot) => {
            group: CubePieces.edgeNames->Array.getUnsafe(edgePieces->Array.getUnsafe(slot)),
            facelets,
          }),
        }
      } else {
        let parityMatches = CubePieces.permParity(cornerPieces) == CubePieces.permParity(edgePieces)
        checks->Dict.set("permutationParity", parityMatches)
        parityMatches
          ? {valid: true, result: validResult, checks}
          : {valid: false, result: "Corner perm parity ≠ edge perm parity", checks}
      }
    }
  }
}

let runFullParity = (cube: cubeIR): parityResult => {
  let checks = Dict.make()
  let n = cube.size
  checks->Dict.set("colorBalance", validateColorBalance(cube))
  if !(checks->Dict.getUnsafe("colorBalance")) {
    let (detail, highlight) = colorBalanceReport(cube)
    {valid: false, result: "Invalid color balance", checks, highlight, detail}
  } else {
    // Corners - meaningful for every N.
    let cornerPieces = []
    let cornerOrients = []
    // Facelets behind each slot's corner, same order as cornerPieces, so a
    // failure can point at exactly those stickers.
    let cornerFacelets = []
    let unknownCorners = []
    CubePieces.cornerSlots->Array.forEach(slots => {
      let facelets = slots->Array.map(((face, slot)) => {
        face: faceName(face),
        index: CubePieces.cornerFaceletIndex(n, slot),
      })
      let colors = facelets->Array.map(({face, index}) => sticker(cube, face, index))
      let color = i => colors->Array.getUnsafe(i)
      let found = CubePieces.identifyCorner((color(0), color(1), color(2)))
      switch found {
      | Some((piece, rot)) =>
        cornerPieces->Array.push(piece)
        cornerOrients->Array.push(rot)
        cornerFacelets->Array.push(facelets)
      | None => unknownCorners->Array.push({group: colors->Array.join("-"), facelets})
      }
    })
    // Each slot was only checked for being SOME real corner; two slots
    // matching the same piece makes the list no permutation at all (a real
    // capture read [0,1,1,0,7,6,6,7]), mirrored in CubeAssembly's
    // isFullyValid.
    let piecesInOrder = []
    cornerPieces->Array.forEach(piece =>
      if !(piecesInOrder->Array.includes(piece)) {
        piecesInOrder->Array.push(piece)
      }
    )
    let duplicates = piecesInOrder->Array.flatMap(piece => {
      let slots =
        cornerPieces
        ->Array.mapWithIndex((p, slot) => p == piece ? Some(slot) : None)
        ->Array.filterMap(x => x)
      Array.length(slots) > 1
        ? slots->Array.map(slot => {
            group: CubePieces.cornerNames->Array.getUnsafe(piece),
            facelets: cornerFacelets->Array.getUnsafe(slot),
          })
        : []
    })
    if Array.length(unknownCorners) > 0 || Array.length(duplicates) > 0 {
      checks->Dict.set("cornerColors", false)
      let duplicateNames = []
      duplicates->Array.forEach(({group}) =>
        if !(duplicateNames->Array.includes(group)) {
          duplicateNames->Array.push(group)
        }
      )
      let result =
        Array.length(unknownCorners) > 0
          ? "Unknown corner color triplet"
          : "Duplicate corner piece (two positions read the same physical corner)"
      let highlight = [...unknownCorners, ...duplicates]
      Array.length(unknownCorners) > 0 && Array.length(duplicateNames) > 0
        ? {
            valid: false,
            result,
            checks,
            highlight,
            detail: `also duplicate corner pieces: ${duplicateNames->Array.join(", ")}`,
          }
        : {valid: false, result, checks, highlight}
    } else {
      checks->Dict.set("cornerColors", true)
      // The twist sum belongs to all 8 corners together, so all of them are
      // highlighted, each under its own piece.
      let cornerOrientSum = CubePieces.sum(cornerOrients)
      checks->Dict.set("cornerOrientation", mod(cornerOrientSum, 3) == 0)
      if mod(cornerOrientSum, 3) != 0 {
        {
          valid: false,
          result: `Corner orientation sum ${Int.toString(cornerOrientSum)} ≢ 0 (mod 3)`,
          checks,
          highlight: cornerFacelets->Array.mapWithIndex((facelets, slot) => {
            group: CubePieces.cornerNames->Array.getUnsafe(cornerPieces->Array.getUnsafe(slot)),
            facelets,
          }),
        }
      } else if n == 2 {
        // Only corners; a quarter turn is already an odd corner
        // permutation, so there is nothing further to check.
        {valid: true, result: validResult, checks}
      } else if n != 3 {
        // 4x4-7x7: wings are validated by counting. Centers need no check:
        // color balance plus the exact corner and wing counts leave each
        // color's center count no choice, and center pieces of one color
        // are indistinguishable.
        let wings = validateWingEdges(cube)
        checks->Dict.set("wingEdgeColors", wings.valid)
        if !wings.valid {
          switch wings.highlight {
          | Some(highlight) => {
              valid: false,
              result: wings.result->Option.getOr(""),
              checks,
              highlight,
            }
          | None => {valid: false, result: wings.result->Option.getOr(""), checks}
          }
        } else {
          {valid: true, result: "Valid (structural + corner + wing-edge count check)", checks}
        }
      } else {
        runEdgeChecks(cube, checks, cornerPieces)
      }
    }
  }
}
