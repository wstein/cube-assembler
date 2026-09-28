// One live camera frame analyzed on raw pixels - what the capture dialog's
// preview shows - so it can run in a worker (liveAnalysis.worker.ts) off
// the page's thread. The face's square is read once and serves both the
// colors and the cube check, so both judge the same pixels.
type rgb = StickerGeometry.rgb

type mode =
  | @as("aligned") Aligned
  | @as("fixed") Fixed

type request = {
  gridSize: int,
  // Aligned (Detect face) or Fixed (Guide grid: the drawn square).
  mode: mode,
  // Detect face insists on a visible face outline (see faceVisibility).
  requireOutline: bool,
  sampling: StickerGeometry.samplingGeometry,
  palette?: Dict.t<rgb>,
  autoProfiles?: array<ProfileSettings.colorProfile>,
  capturedBackgrounds?: Dict.t<Nullable.t<rgb>>,
}

type analysis = {
  // In the analyzed frame's pixels.
  bounds: FaceSampling.faceBounds,
  detection: Recalibration.colorDetection,
  visible: bool,
  backgroundColor: Null.t<rgb>,
  gains: rgb,
  colorProfileId?: string,
}

// The pixels of `area` from a width-wide RGBA frame.
let cropArea = (frame, width, area: FaceSampling.area) => {
  let x0 = Float.toInt(area.x0)
  let y0 = Float.toInt(area.y0)
  let x1 = Float.toInt(area.x1)
  let w = x1 - x0
  let h = Float.toInt(area.y1) - y0
  let out = Pixels.make(w * h * 4)
  for y in 0 to h - 1 {
    out->Pixels.setFrom(
      frame->Pixels.subarray(((y0 + y) * width + x0) * 4, ((y0 + y) * width + x1) * 4),
      y * w * 4,
    )
  }
  out
}

// The square of `bounds`, upright: copied as is when it isn't tilted (the
// same pixels getImageData returns), otherwise sampled bilinearly through
// the rotation, as a canvas draws it.
let readFaceSquare = (frame, width, height, bounds: FaceSampling.faceBounds) => {
  let size = bounds.faceWidth
  switch (bounds.corners, bounds.angle) {
  | (Some(corners), _) =>
    Perspective.warpQuadToSquare(frame, width, height, corners, Float.toInt(size))
  | (None, Some(angle)) if angle != 0.0 && !Float.isNaN(angle) =>
    let sizeInt = Float.toInt(size)
    let out = Pixels.make(sizeInt * sizeInt * 4)
    let cx = bounds.startX +. size /. 2.0
    let cy = bounds.startY +. size /. 2.0
    let cos = Math.cos(angle)
    let sin = Math.sin(angle)
    let widthF = Int.toFloat(width)
    let heightF = Int.toFloat(height)
    let at = (x, y, c) =>
      frame->Pixels.getAt(
        (Math.min(heightF -. 1.0, Math.max(0.0, y)) *. widthF +.
          Math.min(widthF -. 1.0, Math.max(0.0, x))) *. 4.0 +. c,
      )
    for y in 0 to sizeInt - 1 {
      for x in 0 to sizeInt - 1 {
        let u = Int.toFloat(x) +. 0.5 -. size /. 2.0
        let v = Int.toFloat(y) +. 0.5 -. size /. 2.0
        let sx = cx +. cos *. u -. sin *. v -. 0.5
        let sy = cy +. sin *. u +. cos *. v -. 0.5
        let x0 = Math.floor(sx)
        let y0 = Math.floor(sy)
        let fx = sx -. x0
        let fy = sy -. y0
        let to = (y * sizeInt + x) * 4
        for c in 0 to 2 {
          let c' = Int.toFloat(c)
          out->Pixels.setFloat(
            to + c,
            (at(x0, y0, c') *. (1.0 -. fx) +. at(x0 +. 1.0, y0, c') *. fx) *. (1.0 -. fy) +.
              (at(x0, y0 +. 1.0, c') *. (1.0 -. fx) +. at(x0 +. 1.0, y0 +. 1.0, c') *. fx) *. fy,
          )
        }
        out->Pixels.set(to + 3, 255)
      }
    }
    out
  | _ =>
    cropArea(
      frame,
      width,
      {
        x0: bounds.startX,
        y0: bounds.startY,
        x1: bounds.startX +. size,
        y1: bounds.startY +. bounds.faceHeight,
      },
    )
  }
}

let analyzeLiveFrame = (frame, width, height, request: request) => {
  let {gridSize, sampling} = request
  let widthF = Int.toFloat(width)
  let heightF = Int.toFloat(height)
  let guide = FaceSampling.guideBounds(widthF, heightF, FaceSampling.sampleFaceFraction)
  let bounds = switch request.mode {
  | Fixed => guide
  | Aligned =>
    let area = FaceSampling.alignmentArea(guide, widthF, heightF)
    let region = cropArea(frame, width, area)
    FaceSampling.alignedBoundsInArea(
      region,
      Float.toInt(area.x1 -. area.x0),
      Float.toInt(area.y1 -. area.y0),
      guide,
      {x0: area.x0, y0: area.y0},
      gridSize,
      widthF,
      heightF,
    )
  }
  // Colors and the cube check on one read of the square.
  let square = readFaceSquare(frame, width, height, bounds)
  let visible =
    (request.mode == Fixed || bounds.gridFound == Some(true)) &&
      FaceDetection.faceVisibility(
        square,
        bounds.faceWidth,
        bounds.faceHeight,
        gridSize,
        () => FaceDetection.outlineVisible(frame, widthF, heightF, bounds),
        request.requireOutline,
      ).visible
  let captured = request.capturedBackgrounds->Option.getOr(Dict.make())
  let capturedCount =
    captured
    ->Dict.valuesToArray
    ->Array.filter(bg => Nullable.toOption(bg)->Option.isSome)
    ->Array.length
  let backgroundColor =
    visible && capturedCount >= 2
      ? FaceSampling.extractBackgroundColorFromPixels(frame, width, height, bounds)
      : Null.null
  let gains = switch Null.toOption(backgroundColor) {
  | Some(background) =>
    let withCurrent = captured->Dict.copy
    withCurrent->Dict.set("current", Nullable.make(background))
    FaceSampling.computeBackgroundGains(withCurrent)
    ->Null.toOption
    ->Option.flatMap(gains => gains->Dict.get("current"))
    ->Option.getOr(ColorMath.neutralGains)
  | None => ColorMath.neutralGains
  }
  let read = palette =>
    FaceDetection.extractColorsFromImageData(
      square,
      bounds.faceWidth,
      bounds.faceHeight,
      gridSize,
      gains,
      sampling,
      palette,
    )
  let firstPass = read(request.palette)
  let selected = switch (visible, request.palette, request.autoProfiles) {
  | (true, None, Some(profiles)) =>
    ColorProfileLearning.matchPartialColorProfile(
      profiles,
      firstPass.cellColors->Array.flat,
    )->Null.toOption
  | _ => None
  }
  let detection = FaceDetection.withGridOffset(
    switch selected {
    | Some(profile) => read(Some(profile.colors))
    | None => firstPass
    },
    bounds,
    guide,
  )
  let analysis = {bounds, detection, visible, backgroundColor, gains}
  switch selected {
  | Some(profile) => {...analysis, colorProfileId: profile.id}
  | None => analysis
  }
}

// `bounds` of a frame analyzed at `scale` times the camera's size, in the
// camera frame's own pixels.
let scaleBounds = (bounds: FaceSampling.faceBounds, scale) =>
  if scale == 1.0 {
    bounds
  } else {
    let scaled = {
      ...bounds,
      startX: Math.round(bounds.startX /. scale),
      startY: Math.round(bounds.startY /. scale),
      faceWidth: Math.round(bounds.faceWidth /. scale),
      faceHeight: Math.round(bounds.faceHeight /. scale),
    }
    // A capture warps the full-resolution frame through these.
    switch bounds.corners {
    | Some(corners) => {
        ...scaled,
        corners: corners->Array.map(((x, y)) => (x /. scale, y /. scale)),
      }
    | None => scaled
    }
  }
