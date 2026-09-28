open CubeTypes

// The visual guide suggests clockwise side turns, then top before bottom.
// Those moves correspond to a right turn and cap rotations 3/1 in the
// photographed frame. Equally valid cube states can still differ on a
// patterned cube, so this only chooses which one to ask about first.
let preferredGuidedArrangementIndex = (arrangements: array<guidedArrangement>) => {
  let quarterDistance = (a, b) => {
    let forward = mod(a - b + 4, 4)
    let backward = mod(b - a + 4, 4)
    forward < backward ? forward : backward
  }
  let rank = (a: guidedArrangement) => {
    let (cap1, cap2) = a.capRotations
    [
      a.turn == Right ? 0 : 1,
      a.capsSwapped ? 1 : 0,
      quarterDistance(cap1, 3) + quarterDistance(cap2, 1),
      quarterDistance(cap1, 3),
    ]
  }
  // Lexicographically smaller rank wins; the first of equals is kept.
  let smaller = (next, current) => {
    let decided = ref(None)
    next->Array.forEachWithIndex((value, j) =>
      if decided.contents->Option.isNone && value != current->Array.getUnsafe(j) {
        decided := Some(value < current->Array.getUnsafe(j))
      }
    )
    decided.contents->Option.getOr(false)
  }
  arrangements->Array.reduceWithIndex(0, (best, arrangement, i) =>
    i > 0 && smaller(rank(arrangement), rank(arrangements->Array.getUnsafe(best))) ? i : best
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Orientation wizard: narrows solveFaceOrientations' tied `alternatives`
// down to one, one face at a time, instead of showing every alternative
// (which can number in the dozens) in a single overwhelming grid. Each step
// asks about the not-yet-agreed face with the most distinct values among
// the remaining candidates (the question that eliminates the most options),
// filters to the customer's answer, and repeats. Faces that already agree
// are shown as settled without being asked about.
// ─────────────────────────────────────────────────────────────────────────────

// U last: for even sizes the solver fixes U as its anchor, so it already
// agrees across every alternative; for odd sizes U is only asked about if
// it ties with another face on "most distinct values".
let wizardFaceOrder: array<CubeState.faceKey> = [F, R, D, L, B, U]

let faceContentKey = (colors: grid) => colors->Array.map(row => row->Array.join(""))->Array.join("")

// The face (if any) worth asking about next: the one with the most
// distinct remaining values. Null once every face already agrees - i.e.
// `remaining` is down to exactly one candidate.
let pickWizardFace = (remaining: array<orientedCandidate>) => {
  let best = ref(None)
  let bestCount = ref(1)
  wizardFaceOrder->Array.forEach(face => {
    let distinct = Set.fromArray(
      remaining->Array.map(candidate => faceContentKey(faceValue(candidate.faces, face))),
    )
    if Set.size(distinct) > bestCount.contents {
      best := Some(face)
      bestCount := Set.size(distinct)
    }
  })
  Null.fromOption(best.contents)
}

type wizardOption = {grid: grid, candidates: array<orientedCandidate>}

// Groups the remaining candidates by their value for `face`, one option per
// distinct grid, in the order they first appear.
let groupWizardOptions = (remaining: array<orientedCandidate>, face) => {
  let groups: array<wizardOption> = []
  let indexByKey = Dict.make()
  remaining->Array.forEach(candidate => {
    let grid = faceValue(candidate.faces, face)
    let key = faceContentKey(grid)
    switch indexByKey->Dict.get(key) {
    | Some(index) => (groups->Array.getUnsafe(index)).candidates->Array.push(candidate)
    | None =>
      indexByKey->Dict.set(key, Array.length(groups))
      groups->Array.push({grid, candidates: [candidate]})
    }
  })
  groups
}
