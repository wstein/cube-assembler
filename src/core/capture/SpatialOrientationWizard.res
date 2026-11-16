open CubeTypes

@genType type decision = CaptureFaceMapping.placement
@genType
type candidate = {
  id: string,
  mapping: CaptureFaceMapping.mapping,
  faces: faceSet<grid>,
  valid: bool,
  issues: array<string>,
  fullCubeValidityKnown: bool,
}
@genType
type session = {
  candidates: array<candidate>,
  truncated: bool,
  guided: bool,
  equivalenceReduced: bool,
  issues: array<string>,
}
@genType
type choice = {
  slot: string,
  target: CubeState.faceKey,
  quarterTurns: int,
  grid: grid,
  candidateIds: array<string>,
}
let slots = ["U", "R", "F", "D", "L", "B"]
let agrees = (a: decision, b: decision) =>
  a.slot == b.slot && a.target == b.target && a.quarterTurns == b.quarterTurns
let remaining = (session: session, decisions: array<decision>) =>
  session.candidates->Array.filter(candidate =>
    decisions->Array.every(decision =>
      candidate.mapping->Array.some(entry => agrees(decision, entry))
    )
  )
let options = (session, decisions, slot) => {
  let groups: array<choice> = []
  remaining(session, decisions)->Array.forEach(candidate => {
    switch candidate.mapping->Array.find(entry => entry.slot == slot) {
    | None => ()
    | Some(entry) =>
      switch groups->Array.findIndex(group =>
        group.target == entry.target && group.quarterTurns == entry.quarterTurns
      ) {
      | -1 =>
        groups->Array.push({
          slot,
          target: entry.target,
          quarterTurns: entry.quarterTurns,
          grid: faceValue(candidate.faces, entry.target),
          candidateIds: [candidate.id],
        })
      | index => (groups->Array.getUnsafe(index)).candidateIds->Array.push(candidate.id)
      }
    }
  })
  groups
}
let nextSlot = (session, decisions: array<decision>) =>
  slots
  ->Array.find(slot =>
    !(decisions->Array.some(decision => decision.slot == slot)) &&
    Array.length(options(session, decisions, slot)) > 1
  )
  ->Null.fromOption
let select = (decisions: array<decision>, decision: decision) => {
  let others = decisions->Array.filter(previous => previous.slot != decision.slot)
  [...others, decision]
}
let previous = (decisions: array<decision>) =>
  decisions->Array.filterWithIndex((_, i) => i < Array.length(decisions) - 1)

let generate = (captured: Dict.t<grid>, size, guided): session => {
  let result = if guided {
    let photos = slots->Array.map(slot => captured->Dict.get(slot)->Nullable.fromOption)
    let capture = {
      sides: photos->Array.filterWithIndex((_, i) => i < 4),
      caps: photos->Array.filterWithIndex((_, i) => i >= 4),
    }
    CubeAssembly.solveGuidedCapture(capture)
    ->Null.toOption
    ->Option.map(solution => (solution.alternatives, solution.truncated))
  } else {
    CubeAssembly.solveFaceOrientations(captured)
    ->Null.toOption
    ->Option.map(solution => (solution.alternatives, solution.truncated))
  }
  let (alternatives, truncated) = result->Option.getOr(([], false))
  let candidates = alternatives->Array.filterMapWithIndex((value, index) => {
    let mapping = CaptureFaceMapping.initializeMapping(captured, Null.make(value))
    let checked = CaptureFaceMapping.validateMapping(captured, mapping, size)
    checked.valid
      ? Some({
          id: `candidate-${Int.toString(index)}`,
          mapping,
          faces: value.faces,
          valid: checked.valid,
          issues: checked.issues,
          fullCubeValidityKnown: size <= 3,
        })
      : None
  })
  let issues = [
    "Candidates are retained representatives of whole-cube equivalence classes; photo identity is inferred when source grids are symmetric.",
  ]
  if size >= 4 {
    issues->Array.push("Existing checks do not establish complete large-cube reachability.")
  }
  if truncated {
    issues->Array.push("The candidate search was capped; omitted arrangements remain possible.")
  }
  if Array.length(candidates) == 0 {
    issues->Array.push(
      guided
        ? "No retained candidate satisfies the guided capture constraints and existing validation. Advanced manual recovery remains available."
        : "No retained candidate passes existing validation. Advanced manual recovery remains available.",
    )
  }
  {candidates, truncated, guided, equivalenceReduced: true, issues}
}

// Existing exact photo identities win over inferred matches whenever they
// produce the candidate's same face grids, including symmetric artwork.
let preserveMapping = (captured, mapping, candidate: candidate) => {
  let size = captured->Dict.valuesToArray->Array.get(0)->Option.mapOr(0, Array.length)
  let checked = CaptureFaceMapping.validateMapping(captured, mapping, size)
  switch checked.faces->Null.toOption {
  | Some(faces)
    if faceKeys->Array.every(face =>
      OrientationWizard.faceContentKey(faceValue(faces, face)) ==
        OrientationWizard.faceContentKey(faceValue(candidate.faces, face))
    ) => mapping
  | _ => candidate.mapping
  }
}
@genType type reconciliation = {decisions: array<decision>, conflicts: array<decision>}
let reconcile = (session, decisions: array<decision>, selected: decision): reconciliation => {
  let index = decisions->Array.findIndex(previous => previous.slot == selected.slot)
  let ordered =
    index < 0
      ? [...decisions, selected]
      : decisions->Array.map(previous => previous.slot == selected.slot ? selected : previous)
  let kept = ref([])
  let conflicts = []
  ordered->Array.forEach(decision => {
    let proposed = [...kept.contents, decision]
    if agrees(decision, selected) || Array.length(remaining(session, proposed)) > 0 {
      kept := proposed
    } else {
      conflicts->Array.push(decision)
    }
  })
  {decisions: kept.contents, conflicts}
}

// Rendering a draft is independent of validating it. Missing or conflicting
// assignments stay visible as blank faces; validation continues to explain them.
let previewFaces = (captured: Dict.t<grid>, mapping: CaptureFaceMapping.mapping, size) => {
  let extent = size > 0 ? size : 0
  let blank = () =>
    Array.fromInitializer(~length=extent, _ => Array.fromInitializer(~length=extent, _ => ""))
  let faces = faceKeys->Array.mapWithIndex((target, index) => {
    let selected = mapping->Array.find(entry => {
      let turns = Int.toFloat(entry.quarterTurns)
      entry.target == target &&
      slots->Array.includes(entry.slot) &&
      Float.isFinite(turns) &&
      Math.floor(turns) == turns &&
      entry.quarterTurns >= 0 &&
      entry.quarterTurns <= 3 &&
      switch captured->Dict.get(entry.slot) {
      | Some(grid) =>
        Array.length(grid) == size && grid->Array.every(row => Array.length(row) == size)
      | None => false
      }
    })
    let grid = switch selected {
    | Some(entry) =>
      CubeGeometry.rotateGrid(captured->Dict.getUnsafe(entry.slot), entry.quarterTurns)
    | None => blank()
    }
    (slots->Array.getUnsafe(index), grid)
  })
  Dict.fromArray(faces)->fromGeometry
}

let matchesDecision = (mapping: CaptureFaceMapping.mapping, decision: decision) =>
  mapping->Array.some(entry => agrees(entry, decision))

// Membership is an exact source-photo statement, not a validity verdict.
// Search caps and symmetry reduction can omit legal owner-selected mappings.
let retainsMapping = (session: session, mapping: CaptureFaceMapping.mapping) => {
  let complete = (entries: CaptureFaceMapping.mapping) =>
    Array.length(entries) == 6 &&
    slots->Array.every(slot =>
      entries->Array.filter(entry => entry.slot == slot)->Array.length == 1
    ) &&
    faceKeys->Array.every(target =>
      entries->Array.filter(entry => entry.target == target)->Array.length == 1
    ) &&
    entries->Array.every(entry => {
      let turns = Int.toFloat(entry.quarterTurns)
      Float.isFinite(turns) &&
      Math.floor(turns) == turns &&
      entry.quarterTurns >= 0 &&
      entry.quarterTurns <= 3
    })
  complete(mapping) &&
  session.candidates->Array.some(candidate =>
    complete(candidate.mapping) &&
    mapping->Array.every(decision => matchesDecision(candidate.mapping, decision))
  )
}

@genType
type proposal = {
  mapping: CaptureFaceMapping.mapping,
  decisions: array<decision>,
  conflicts: array<decision>,
}
let propose = (captured, session, decisions, choice, currentMapping): Null.t<proposal> => {
  let adjusted = reconcile(session, decisions, choice)
  switch remaining(session, adjusted.decisions)->Array.get(0) {
  | None => Null.null
  | Some(candidate) =>
    let preserved = preserveMapping(captured, currentMapping, candidate)
    let mapping =
      adjusted.decisions->Array.every(decision => matchesDecision(preserved, decision))
        ? preserved
        : candidate.mapping
    Null.make({mapping, decisions: adjusted.decisions, conflicts: adjusted.conflicts})
  }
}
@genType
type choicePreview = {
  grid: grid,
  target: CubeState.faceKey,
  mapping: CaptureFaceMapping.mapping,
  displayTransform: int,
}
let previewChoice = (
  captured,
  session,
  decisions,
  choice: decision,
  currentMapping,
  frontSlot,
  upSlot,
  captureView,
): Null.t<choicePreview> => {
  switch propose(captured, session, decisions, choice, currentMapping)->Null.toOption {
  | None => Null.null
  | Some(proposal) =>
    let selectedFrame = if captureView {
      CaptureFaceMapping.captureFrame(captured, proposal.mapping, frontSlot, upSlot)
    } else {
      // Derive the identity from the frozen orientation convention; never
      // assume a particular numeric index represents the logical frame.
      switch (
        proposal.mapping->Array.find(entry => entry.target == F),
        proposal.mapping->Array.find(entry => entry.target == U),
      ) {
      | (Some(front), Some(up)) =>
        CaptureFaceMapping.captureFrame(captured, proposal.mapping, front.slot, up.slot)
      | _ => Null.null
      }
    }
    switch selectedFrame->Null.toOption {
    | None => Null.null
    | Some(frame) =>
      switch frame.mapping->Array.find(entry => entry.slot == choice.slot) {
      | None => Null.null
      | Some(placed) =>
        Null.make({
          grid: faceValue(frame.faces, placed.target),
          target: placed.target,
          mapping: frame.mapping,
          displayTransform: frame.displayTransform,
        })
      }
    }
  }
}
