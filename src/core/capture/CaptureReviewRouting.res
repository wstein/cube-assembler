// What the user sees after checking sticker colors. The UI owns the
// dialogs; this owns the guided and free-search fallback order.
open CubeTypes

type captureReviewFace = {
  colors: array<array<string>>,
  detectedColors?: array<array<string>>,
  cellConfidences?: array<array<float>>,
  cellLookalikes?: array<array<Null.t<string>>>,
  confidence: float,
}

let highConfidence = 0.8

type captureApproval = {
  candidates: array<orientedCandidate>,
  arrangements?: array<guidedArrangement>,
  valid: bool,
  note?: string,
  suggestedFrom?: int,
  fallback: Null.t<orientationSolution>,
  page?: int,
}

// The fallback's arrangements other than the ones already turned down.
let rejectAlternatives = (approval: captureApproval) => {
  let rejected =
    approval.candidates->Array.map(candidate =>
      CubeAssembly.orientationFreeSignature(candidate.faces)
    )
  switch Null.toOption(approval.fallback) {
  | Some(fallback) =>
    fallback.alternatives->Array.filter(candidate =>
      !(rejected->Array.includes(CubeAssembly.orientationFreeSignature(candidate.faces)))
    )
  | None => []
  }
}

@tag("kind")
type captureReviewPlan =
  | @as("approval") Approval({approval: captureApproval})
  | @as("wizard") Wizard({remaining: array<orientedCandidate>, truncated: bool})
  | @as("choose") Choose({candidate: orientedCandidate})
  | @as("notice") Notice({message: string})

// A face of a candidate by its capture slot letter.
let faceBySlot = (faces: faceSet<grid>, slot): grid => Obj.magic(faces)->Dict.getUnsafe(slot)

let asSolution = (solution: guidedSolution): orientationSolution => {
  faces: solution.faces,
  rotations: solution.rotations,
  cornerScore: solution.cornerScore,
  edgeScore: solution.edgeScore,
  fullyValid: solution.fullyValid,
  alternatives: solution.alternatives,
  truncated: solution.truncated,
}

let misfitNote = "These photos don't fit together the way they were taken - the cube may have been turned the other way partway through, or tipped over."

let planCaptureReview = (
  faces: Dict.t<grid>,
  order: array<string>,
  guided,
  describeIssue: CapturedFaceMatching.guidedCenterIssue => string,
  precomputedFree: option<Null.t<orientationSolution>>,
) => {
  let free = switch precomputedFree {
  | Some(free) => Null.toOption(free)
  | None => Null.toOption(CubeAssembly.solveFaceOrientations(faces))
  }
  let photos = order->Array.map(face => faces->Dict.get(face))
  let guidedPlan = if !guided {
    None
  } else {
    let photo = i => photos[i]->Option.flatMap(p => p)->Nullable.fromOption
    let solution = CubeAssembly.solveGuidedCapture({
      sides: [photo(0), photo(1), photo(2), photo(3)],
      caps: [photo(4), photo(5)],
    })->Null.toOption
    switch solution {
    | Some(solution) if solution.fullyValid =>
      let preferred = OrientationWizard.preferredGuidedArrangementIndex(solution.arrangements)
      let suggestion = solution.alternatives->Array.getUnsafe(preferred)
      // Keep every guided fit available after "No" even if the free search
      // stopped before reaching it.
      let seen = []
      let alternatives = [
        suggestion,
        ...solution.alternatives,
        ...free->Option.mapOr([], free => free.alternatives),
      ]->Array.filter(candidate => {
        let key =
          order
          ->Array.map(face => OrientationWizard.faceContentKey(faceBySlot(candidate.faces, face)))
          ->Array.join("|")
        let fresh = !(seen->Array.includes(key))
        seen->Array.push(key)
        fresh
      })
      let base = free->Option.getOr(asSolution(solution))
      Some(
        Approval({
          approval: {
            candidates: [suggestion],
            arrangements: [solution.arrangements->Array.getUnsafe(preferred)],
            valid: true,
            suggestedFrom: Array.length(solution.alternatives),
            fallback: Null.make({
              ...base,
              alternatives,
              truncated: free->Option.mapOr(false, free => free.truncated) || solution.truncated,
            }),
          },
        }),
      )
    | _ =>
      let why =
        CapturedFaceMatching.checkGuidedCenters(photos)[0]->Option.mapOr(misfitNote, describeIssue)
      switch free {
      | Some(free) if free.fullyValid =>
        Some(
          Approval({
            approval: {
              candidates: free.alternatives,
              valid: true,
              note: `${why} They do fit together another way:`,
              fallback: Null.null,
            },
          }),
        )
      | _ =>
        let closest = switch solution {
        | Some(solution) => Some(asSolution(solution))
        | None => free
        }
        closest->Option.map(closest => Approval({
          approval: {
            candidates: [closest.alternatives->Array.getUnsafe(0)],
            valid: false,
            note: `${why} No arrangement makes a valid cube, so a color was probably misread - check the colors, or use the closest match anyway.`,
            fallback: Null.fromOption(free),
          },
        }))
      }
    }
  }
  switch (guidedPlan, free) {
  | (Some(plan), _) => plan
  | (None, None) =>
    Notice({
      message: "⚠️ Couldn't work out how the faces fit together (a duplicate or unreadable center?) - check the colors, or retake a face.",
    })
  | (None, Some(free)) if !free.fullyValid =>
    Approval({
      approval: {
        candidates: [free.alternatives->Array.getUnsafe(0)],
        valid: false,
        note: "No arrangement of these faces makes a valid cube, so a color was probably misread - check the colors, or use the closest match anyway.",
        fallback: Null.make(free),
      },
    })
  | (None, Some(free)) if Array.length(free.alternatives) > 1 =>
    Wizard({remaining: free.alternatives, truncated: free.truncated})
  | (None, Some(free)) => Choose({candidate: free.alternatives->Array.getUnsafe(0)})
  }
}

let highConfidenceColorReadings = (
  faces: Dict.t<captureReviewFace>,
  order: array<string>,
  glareFaces: array<string>,
  mixedUpColors: array<string>,
) =>
  Array.length(glareFaces) == 0 &&
  Array.length(mixedUpColors) == 0 && {
    let size =
      order[0]
      ->Option.flatMap(key => faces->Dict.get(key))
      ->Option.mapOr(0, face => Array.length(face.colors))
    size > 0 &&
      order->Array.every(key =>
        switch faces->Dict.get(key) {
        | Some({colors, confidence, ?detectedColors, ?cellConfidences, ?cellLookalikes}) =>
          let sized = grid => grid->Option.mapOr(false, grid => Array.length(grid) == size)
          confidence >= highConfidence &&
          Array.length(colors) == size &&
          sized(detectedColors) &&
          sized(cellConfidences) &&
          sized(cellLookalikes) &&
          colors->Array.everyWithIndex((row, r) => {
            let detected = detectedColors->Option.flatMap(grid => grid[r])
            let confidences = cellConfidences->Option.flatMap(grid => grid[r])
            let lookalikes = cellLookalikes->Option.flatMap(grid => grid[r])
            let rowSized = row => row->Option.mapOr(false, row => Array.length(row) == size)
            Array.length(row) == size &&
            rowSized(detected) &&
            rowSized(confidences) &&
            rowSized(lookalikes) &&
            row->Array.everyWithIndex(
              (color, c) =>
                detected->Option.flatMap(row => row[c]) == Some(color) &&
                confidences->Option.flatMap(row => row[c])->Option.getOr(0.0) >= highConfidence &&
                lookalikes->Option.mapOr(false, row => row->Array.getUnsafe(c) === Null.null),
            )
          })
        | None => false
        }
      )
  }

let canSkipColorReview = (faces, order, assembledValid, glareFaces, mixedUpColors) =>
  assembledValid && highConfidenceColorReadings(faces, order, glareFaces, mixedUpColors)

let readyAssemblyAfterCapture = (
  faces: Dict.t<captureReviewFace>,
  order,
  glareFaces,
  mixedUpColors,
) =>
  if !highConfidenceColorReadings(faces, order, glareFaces, mixedUpColors) {
    Null.null
  } else {
    let faceData = Dict.fromArray(
      order->Array.map(face => (face, (faces->Dict.getUnsafe(face)).colors)),
    )
    let solution = CubeAssembly.solveFaceOrientations(faceData)
    let valid = solution->Null.toOption->Option.mapOr(false, solution => solution.fullyValid)
    canSkipColorReview(faces, order, valid, glareFaces, mixedUpColors) ? solution : Null.null
  }
