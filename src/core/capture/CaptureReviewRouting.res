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
      Some(
        Approval({
          approval: {
            candidates: [suggestion],
            arrangements: [solution.arrangements->Array.getUnsafe(preferred)],
            valid: true,
            suggestedFrom: Array.length(solution.alternatives),
            fallback: Null.null,
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
              candidates: [free.alternatives->Array.getUnsafe(0)],
              valid: true,
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
  | (None, Some(free)) =>
    Approval({
      approval: {
        candidates: [free.alternatives->Array.getUnsafe(0)],
        valid: true,
        fallback: Null.null,
      },
    })
  }
}

// A valid cube needs no color review: how sure the camera was of a sticker
// does not matter, people know their cube.
let canSkipColorReview = assembledValid => assembledValid

let readyAssemblyAfterCapture = (faces: Dict.t<captureReviewFace>, order) => {
  let faceData = Dict.fromArray(
    order->Array.map(face => (face, (faces->Dict.getUnsafe(face)).colors)),
  )
  let solution = CubeAssembly.solveFaceOrientations(faceData)
  let valid = solution->Null.toOption->Option.mapOr(false, solution => solution.fullyValid)
  canSkipColorReview(valid) ? solution : Null.null
}

// The "Which way is your ... face?" wizard: the arrangements still
// possible, whether the solver dropped some, and the faces the customer
// answered directly (every other settled face was inferred).
type wizardState = {
  remaining: array<orientedCandidate>,
  truncated: bool,
  picked: array<CubeState.faceKey>,
}

// "No, let me choose each side": only offered when the photos fit together
// some other way too. The wizard starts from every arrangement, the
// turned-down one included - it only asks about faces the candidates
// disagree on and fills in the rest, so leaving the suggestion out can
// drop a face's one alternative. If the answers lead back to the
// suggestion, it was right after all.
let wizardAfterRejection = (approval: captureApproval) =>
  switch Null.toOption(approval.fallback) {
  | Some(fallback) if Array.length(rejectAlternatives(approval)) > 0 =>
    Null.make({remaining: fallback.alternatives, truncated: fallback.truncated, picked: []})
  | _ => Null.null
  }

@tag("kind")
type wizardAnswer =
  // Every face agrees: assemble this one.
  | @as("chosen") Chosen({candidate: orientedCandidate})
  // Ask the next most informative question.
  | @as("narrowed") Narrowed({wizard: Null.t<wizardState>})

// One answer: the candidates that match the customer's pick for `face`.
let answerWizard = (wizard: Null.t<wizardState>, matched, face) =>
  switch OrientationWizard.pickWizardFace(matched)->Null.toOption {
  | None => Chosen({candidate: matched->Array.getUnsafe(0)})
  | Some(_) =>
    Narrowed({
      wizard: wizard
      ->Null.toOption
      ->Option.map(wizard => {
        remaining: matched,
        truncated: wizard.truncated,
        picked: [...wizard.picked, face],
      })
      ->Null.fromOption,
    })
  }
