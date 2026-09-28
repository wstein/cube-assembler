// After all six photos are re-read together: compare Automatic's latest
// preview with the palette learned from this capture, and gather what the
// caller keeps provisional until the assembled cube is approved.
open StickerGeometry

type options = {
  faces: Dict.t<CaptureFlow.faceCaptureData>,
  order: array<string>,
  automatic: bool,
  palette?: Dict.t<rgb>,
  autoProfiles: array<ProfileSettings.colorProfile>,
  colorProfile: ProfileSettings.colorProfile,
  glareToWarn: array<Recalibration.location> => array<string>,
}

type pendingPalette = {colors: Dict.t<rgb>, confidentFraction: float, recalibrated: bool}

type recalibration = {
  finalFaces: Dict.t<CaptureFlow.faceCaptureData>,
  applied: bool,
  glare: array<string>,
  mixedUp: array<string>,
  learnedPalette: Null.t<Dict.t<rgb>>,
  pendingPalette: Null.t<pendingPalette>,
  resolution: Null.t<ColorProfileLearning.automaticResolution>,
  reference: Null.t<Dict.t<rgb>>,
  resolvedProfile: Null.t<ProfileSettings.usedColorProfile>,
}

let finishRecalibration = (options: options, measured: Recalibration.classified) => {
  let learned = Null.toOption(measured.learned)
  let latestPreview =
    options.order
    ->Array.filterMap(face => options.faces->Dict.get(face))
    ->Array.filter(data => data.previewColorProfile->Option.isSome)
    ->Array.toSorted((a, b) => b.timestamp -. a.timestamp)
    ->Array.get(0)
    ->Option.flatMap(data => data.previewColorProfile)
  let resolution = switch learned {
  | Some(learned) if options.automatic =>
    Some(
      ColorProfileLearning.resolveAutomaticProfile(
        options.autoProfiles,
        learned.colors,
        latestPreview->Option.map(preview => preview.id)->Null.fromOption,
      ),
    )
  | _ => None
  }
  let matched = resolution->Option.flatMap(resolution => Null.toOption(resolution.profile))
  let compared = switch matched {
  | Some(profile) => Some(profile)
  | None => options.automatic ? None : Some(options.colorProfile)
  }
  let colorFit = switch (compared, learned) {
  | (Some(profile), Some(learned)) =>
    Some(ColorProfileLearning.profileColorFitPercent(profile.colors, learned.colors))
  | _ => None
  }
  // Profiles are compared on colors balanced against this capture's White.
  let matchedReference = switch (matched, learned) {
  | (Some(profile), Some(learned)) =>
    Some(ColorProfileReview.colorsUnderWhite(profile.colors, learned.colors->Dict.getUnsafe("W")))
  | _ => None
  }
  let measured = switch matchedReference {
  | Some(reference) => Recalibration.classifyAcrossFaces(measured.faces, Some(reference))
  | None => measured
  }
  let learned = Null.toOption(measured.learned)
  let reference = switch matchedReference {
  | Some(reference) => Some(reference)
  | None => options.automatic ? None : options.palette
  }
  let resolvedProfile = if options.automatic {
    switch (matched, learned) {
    | (Some(profile), _) =>
      Some(ProfileSettings.resolvedColorProfileSnapshot(profile, Automatic, colorFit))
    | (None, Some(learned)) => Some(ProfileSettings.captureColorProfileSnapshot(learned.colors))
    | (None, None) => None
    }
  } else {
    Some(ProfileSettings.resolvedColorProfileSnapshot(options.colorProfile, Manual, colorFit))
  }
  let confidences = options.order->Array.flatMap(face =>
    measured.faces
    ->Dict.get(face)
    ->Option.mapOr([], detection => detection.cellConfidences->Array.flat)
  )
  let pendingPalette = learned->Option.map(learned => {
    colors: learned.colors,
    confidentFraction: Array.length(confidences) > 0
      ? Int.toFloat(confidences->Array.filter(value => value >= 0.7)->Array.length) /.
        Int.toFloat(Array.length(confidences))
      : 0.0,
    recalibrated: measured.applied,
  })
  let finalFaces = if measured.applied {
    let faces = Dict.copy(options.faces)
    options.order->Array.forEach(face => {
      let detected = measured.faces->Dict.getUnsafe(face)
      let current = faces->Dict.getUnsafe(face)
      faces->Dict.set(
        face,
        {
          ...current,
          colors: detected.colors,
          detectedColors: detected.colors,
          cellConfidences: detected.cellConfidences,
          cellColors: detected.cellColors,
          cellLookalikes: ?detected.cellLookalikes,
          confidence: detected.confidence,
        },
      )
    })
    faces
  } else {
    options.faces
  }
  {
    finalFaces,
    applied: measured.applied,
    glare: options.glareToWarn(measured.glare),
    mixedUp: learned->Option.mapOr([], learned => learned.mixedUpColors),
    learnedPalette: learned->Option.map(learned => learned.colors)->Null.fromOption,
    pendingPalette: Null.fromOption(pendingPalette),
    resolution: Null.fromOption(resolution),
    reference: Null.fromOption(reference),
    resolvedProfile: Null.fromOption(resolvedProfile),
  }
}
