// Versioned review decisions. Photos, raw readings, logical mapping and display
// pose remain separate; a camera mirror is metadata, never a cube reflection.
type observation = {
  slot: string,
  step: int,
  mirrored: bool,
  displayedArrow: Null.t<int>,
  protocol: string,
}
type pose = {
  guideObservations: array<observation>,
  frontSlot: string,
  upSlot: string,
  confirmed: bool,
  displayTransform: int,
  canonicalTransform: int,
  photoTransforms: CaptureFaceMapping.mapping,
  protocol: Null.t<string>,
  mirrored: bool,
  turnDirection: string,
  capOrder: string,
  displayedArrows: array<int>,
}
type recovery = {
  stateRelation: string,
  version: int,
  transformConvention: string,
  mapping: CaptureFaceMapping.mapping,
  captureFrame: pose,
  view: string,
}
external asJson: 'a => JSON.t = "%identity"
let field = (value, name) =>
  switch value {
  | JSON.Object(v) => v->Dict.get(name)
  | _ => None
  }
let string = value =>
  switch value {
  | JSON.String(v) => Some(v)
  | _ => None
  }
let boolean = value =>
  switch value {
  | JSON.Boolean(v) => Some(v)
  | _ => None
  }
let integer = (value, low, high) =>
  switch value {
  | JSON.Number(v)
    if Float.isFinite(v) && Math.floor(v) == v && v >= Int.toFloat(low) && v <= Int.toFloat(high) =>
    Some(Int.fromFloat(v))
  | _ => None
  }
let textAt = (v, k) => field(v, k)->Option.flatMap(string)
let intAt = (v, k, lo, hi) => field(v, k)->Option.flatMap(v => integer(v, lo, hi))
let boolAt = (v, k) => field(v, k)->Option.flatMap(boolean)
let keys = ["U", "R", "F", "D", "L", "B"]
let readPlacement = value =>
  switch (textAt(value, "slot"), textAt(value, "target"), intAt(value, "quarterTurns", 0, 3)) {
  | (Some(slot), Some(target), Some(quarterTurns))
    if keys->Array.includes(slot) && keys->Array.includes(target) =>
    Some(({slot, target: Obj.magic(target), quarterTurns}: CaptureFaceMapping.placement))
  | _ => None
  }
let readMapping = value =>
  switch value {
  | JSON.Array(values) if Array.length(values) == 6 =>
    let parsed = values->Array.filterMap(readPlacement)
    let unique = key =>
      keys->Array.every(k => Array.length(parsed->Array.filter(p => key(p) == k)) == 1)
    Array.length(parsed) == 6 && unique(p => p.slot) && unique(p => (p.target :> string))
      ? Some(parsed)
      : None
  | _ => None
  }
let readObservation = value =>
  switch (
    textAt(value, "slot"),
    intAt(value, "step", 0, 5),
    boolAt(value, "mirrored"),
    textAt(value, "protocol"),
    field(value, "displayedArrow"),
  ) {
  | (Some(slot), Some(step), Some(mirrored), Some(protocol), Some(arrow))
    if keys->Array.includes(slot) &&
      [
        GuidedCaptureProtocol.legacyProtocol,
        GuidedCaptureProtocol.physicalProtocol,
        "retake/v1",
      ]->Array.includes(protocol) =>
    let parsed = switch arrow {
    | JSON.Null => Some(Null.null)
    | _ => integer(arrow, 0, 359)->Option.map(Null.make)
    }
    parsed->Option.map(displayedArrow => {slot, step, mirrored, displayedArrow, protocol})
  | _ => None
  }
// Inline photo observations share the recovery decoder's version/type checks.
// The enclosing face supplies its source slot; no absent observation is invented.
let readCaptureGuide = (value, slot): Null.t<CaptureFlow.captureGuide> => {
  switch value {
  | JSON.Object(fields) =>
    let fields = Dict.copy(fields)
    fields->Dict.set("slot", JSON.String(slot))
    readObservation(JSON.Object(fields))
    ->Option.map((observation): CaptureFlow.captureGuide => {
      step: observation.step,
      mirrored: observation.mirrored,
      displayedArrow: observation.displayedArrow,
      protocol: observation.protocol,
    })
    ->Null.fromOption
  | _ => Null.null
  }
}

let readPose = value =>
  switch (
    textAt(value, "frontSlot"),
    textAt(value, "upSlot"),
    boolAt(value, "confirmed"),
    intAt(value, "displayTransform", 0, 23),
    intAt(value, "canonicalTransform", 0, 23),
    field(value, "photoTransforms")->Option.flatMap(readMapping),
    boolAt(value, "mirrored"),
    textAt(value, "turnDirection"),
    textAt(value, "capOrder"),
  ) {
  | (
      Some(frontSlot),
      Some(upSlot),
      Some(confirmed),
      Some(displayTransform),
      Some(canonicalTransform),
      Some(photoTransforms),
      Some(mirrored),
      Some(turnDirection),
      Some(capOrder),
    )
    if keys->Array.includes(frontSlot) &&
    keys->Array.includes(upSlot) &&
    frontSlot != upSlot &&
    ["unknown", "left", "right"]->Array.includes(turnDirection) &&
    ["unknown", "top-bottom", "bottom-top"]->Array.includes(capOrder) &&
    CaptureFaceMapping.inverseTransform(displayTransform)->Null.toOption ==
      Some(canonicalTransform) =>
    let protocol = textAt(value, "protocol")->Null.fromOption
    let parsedArrows = switch field(value, "displayedArrows") {
    | Some(JSON.Array(values)) if Array.length(values) == 0 || Array.length(values) == 5 =>
      let parsed = values->Array.map(v => integer(v, 0, 359))
      parsed->Array.every(Option.isSome) ? Some(parsed->Array.filterMap(v => v)) : None
    | _ => None
    }
    let parsedObservations = switch field(value, "guideObservations") {
    | Some(JSON.Array(values)) if Array.length(values) <= 6 =>
      let parsed = values->Array.map(readObservation)
      parsed->Array.every(Option.isSome) ? Some(parsed->Array.filterMap(v => v)) : None
    | _ => None
    }
    let guideObservations = parsedObservations->Option.getOr([])
    let uniqueSlots =
      Set.fromArray(guideObservations->Array.map(o => o.slot))->Set.size ==
        Array.length(guideObservations)
    let arrows = parsedArrows->Option.getOr([])
    parsedArrows->Option.isSome && parsedObservations->Option.isSome && uniqueSlots
      ? Some({
          guideObservations,
          frontSlot,
          upSlot,
          confirmed,
          displayTransform,
          canonicalTransform,
          photoTransforms,
          protocol,
          mirrored,
          turnDirection,
          capOrder,
          displayedArrows: arrows,
        })
      : None
  | _ => None
  }
let readRecovery = value => {
  let value = asJson(value)
  switch (
    textAt(value, "stateRelation"),
    textAt(value, "transformConvention"),
    intAt(value, "version", 1, 1),
    field(value, "mapping")->Option.flatMap(readMapping),
    field(value, "captureFrame")->Option.flatMap(readPose),
    textAt(value, "view"),
  ) {
  | (
      Some(stateRelation),
      Some("cube-geometry-orientations/v1"),
      Some(version),
      Some(mapping),
      Some(captureFrame),
      Some(view),
    )
    if ["capture", "after-viewer-moves"]->Array.includes(stateRelation) &&
      ["capture", "canonical"]->Array.includes(view) =>
    Null.make({
      stateRelation,
      version,
      transformConvention: "cube-geometry-orientations/v1",
      mapping,
      captureFrame,
      view,
    })
  | _ => Null.null
  }
}

// The approved source mapping remains the initial photo state. A separately
// saved current state may include later viewport edits; no move provenance is
// inferred from two arbitrary states.
let restoredCandidate = (record: recovery, captured, size, saved) => {
  let checked = CaptureFaceMapping.validateMapping(captured, record.mapping, size)
  let frame =
    CaptureFaceMapping.captureFrame(
      captured,
      record.mapping,
      record.captureFrame.frontSlot,
      record.captureFrame.upSlot,
    )->Null.toOption
  let sameMapping = (a, b) =>
    a->Array.every((p: CaptureFaceMapping.placement) =>
      b->Array.some((q: CaptureFaceMapping.placement) =>
        p.slot == q.slot && p.target == q.target && p.quarterTurns == q.quarterTurns
      )
    )
  switch (checked.valid, checked.candidate->Null.toOption, frame) {
  | (true, Some(initial), Some(frame))
    if frame.displayTransform == record.captureFrame.displayTransform &&
    frame.canonicalTransform == record.captureFrame.canonicalTransform &&
    sameMapping(frame.mapping, record.captureFrame.photoTransforms) =>
    switch (record.stateRelation, Null.toOption(saved)) {
    | ("after-viewer-moves", Some(faces)) =>
      let normalized = if mod(size, 2) == 0 {
        Some(faces)
      } else {
        CubeGeometry.allOrientations(faces)->Array.find(frame =>
          CubeTypes.faceKeys->Array.every(face => {
            let grid = frame->Dict.getUnsafe((face :> string))
            grid->Array.getUnsafe(size / 2)->Array.getUnsafe(size / 2) ==
              CubePieces.solvedColor(face)
          })
        )
      }
      let passes = normalized->Option.mapOr(false, frame => {
        let checked = CubeAssembly.assembleCubeFromFaces(frame, size)
        Parity.runFullParity(CubeAssembly.toCubeIR(checked, size)).valid
      })
      passes
        ? Null.make(
            ({faces: Obj.magic(faces), rotations: initial.rotations}: CubeTypes.orientedCandidate),
          )
        : Null.null
    | ("after-viewer-moves", None) => Null.null
    | (_, Some(faces)) =>
      let wanted = CubeAssembly.assembleCubeFromFaces(faces, size)->NotationOutput.toWRGFacelets
      let actual =
        CubeAssembly.assembleCubeFromFaces(
          Obj.magic(initial.faces),
          size,
        )->NotationOutput.toWRGFacelets
      wanted == actual ? Null.make(initial) : Null.null
    | (_, None) => Null.make(initial)
    }
  | _ => Null.null
  }
}

// The prompt/arrow actually used for this shot, not the number of occupied
// slots. Retakes do not claim to have followed a guided turn cue.
let recordGuide = (slot, mirrored, retake) => {
  let step = keys->Array.indexOf(slot)
  step < 0
    ? Null.null
    : Null.make(
        (
          {
            step,
            mirrored,
            protocol: retake ? "retake/v1" : CaptureSteps.guidedProtocol,
            displayedArrow: retake || step == 0
              ? Null.null
              : Null.make(CaptureSteps.turnHintArrowAngle(step)),
          }: CaptureFlow.captureGuide
        ),
      )
}

// Retaken photos override only their own old observation. Imported untouched
// photos keep the observation saved with the manual review record.
let mergeGuideObservations = (
  previous: array<observation>,
  captured: Dict.t<CaptureFlow.faceCaptureData>,
) =>
  keys->Array.filterMap(slot =>
    switch captured->Dict.get(slot)->Option.flatMap(f => f.captureGuide) {
    | Some(guide) =>
      Some(
        (
          {
            slot,
            step: guide.step,
            mirrored: guide.mirrored,
            displayedArrow: guide.displayedArrow,
            protocol: guide.protocol,
          }: observation
        ),
      )
    | None => previous->Array.find(o => o.slot == slot)
    }
  )

// A versioned expectation is usable only when all six original shot records
// agree. Imports without observations must never be upgraded to physical v2.
let captureProtocol = (
  captured: Dict.t<CaptureFlow.faceCaptureData>,
  uploadedProtocol: Null.t<string>,
) => {
  let guides = keys->Array.mapWithIndex((slot, step) =>
    captured
    ->Dict.get(slot)
    ->Option.flatMap(photo => photo.captureGuide)
    ->Option.filter(guide => guide.step == step)
  )
  let allProtocol = protocol =>
    Array.length(Dict.keysToArray(captured)) == 6 &&
      guides->Array.every(guide => guide->Option.mapOr(false, guide => guide.protocol == protocol))
  if allProtocol(GuidedCaptureProtocol.physicalProtocol) {
    Null.make(GuidedCaptureProtocol.physicalProtocol)
  } else if allProtocol(GuidedCaptureProtocol.legacyProtocol) {
    Null.make(GuidedCaptureProtocol.legacyProtocol)
  } else {
    let anyObservation =
      captured->Dict.valuesToArray->Array.some(photo => photo.captureGuide->Option.isSome)
    !anyObservation && uploadedProtocol->Null.toOption == Some(GuidedCaptureProtocol.legacyProtocol)
      ? Null.make(GuidedCaptureProtocol.legacyProtocol)
      : Null.null
  }
}
