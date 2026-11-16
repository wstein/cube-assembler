open CubeTypes
let physicalProtocol = "sides-then-top-bottom/v2"
let currentProtocol = "left-front-right-back-up-down/v3"
let mirroredProtocol = "right-back-left-front-up-down/v3"
let incompleteProtocol = "incomplete-physical-guide/v3"
let isCurrentProtocol = protocol => protocol == currentProtocol || protocol == mirroredProtocol
let isPhysicalProtocol = protocol => protocol == physicalProtocol || isCurrentProtocol(protocol)
let legacyProtocol = "sides-then-top-bottom/v1"
let slots = ["U", "R", "F", "D", "L", "B"]
let physicalMapping: CaptureFaceMapping.mapping = [
  {slot: "U", target: F, quarterTurns: 0},
  {slot: "R", target: R, quarterTurns: 0},
  {slot: "F", target: B, quarterTurns: 0},
  {slot: "D", target: L, quarterTurns: 0},
  {slot: "L", target: D, quarterTurns: 3},
  {slot: "B", target: U, quarterTurns: 1},
]
let currentMapping: CaptureFaceMapping.mapping = [
  {slot: "U", target: L, quarterTurns: 0},
  {slot: "R", target: F, quarterTurns: 0},
  {slot: "F", target: R, quarterTurns: 0},
  {slot: "D", target: B, quarterTurns: 0},
  {slot: "L", target: U, quarterTurns: 2},
  {slot: "B", target: D, quarterTurns: 2},
]
let mirroredMapping: CaptureFaceMapping.mapping = [
  {slot: "U", target: R, quarterTurns: 0},
  {slot: "R", target: B, quarterTurns: 0},
  {slot: "F", target: L, quarterTurns: 0},
  {slot: "D", target: F, quarterTurns: 0},
  {slot: "L", target: U, quarterTurns: 0},
  {slot: "B", target: D, quarterTurns: 0},
]
@genType
type seed = {
  mapping: CaptureFaceMapping.mapping,
  validation: CaptureFaceMapping.validation,
  canonicalTransform: Null.t<int>,
}
let placedFaces = (captured, placements: CaptureFaceMapping.mapping) =>
  Dict.fromArray(
    placements->Array.map(entry => {
      let key = slots->Array.getUnsafe(faceKeys->Array.indexOf(entry.target))
      (key, CubeGeometry.rotateGrid(captured->Dict.getUnsafe(entry.slot), entry.quarterTurns))
    }),
  )->fromGeometry
let seedForMapping = (captured: Dict.t<grid>, size, placements): seed => {
  let complete =
    size >= 2 &&
    size <= 8 &&
    slots->Array.every(slot =>
      captured
      ->Dict.get(slot)
      ->Option.mapOr(false, grid =>
        Array.length(grid) == size && grid->Array.every(row => Array.length(row) == size)
      )
    )
  if !complete {
    {
      mapping: placements,
      validation: CaptureFaceMapping.validateMapping(captured, placements, size),
      canonicalTransform: Null.null,
    }
  } else {
    let sourceFrame = placedFaces(captured, placements)
    let canonical = CubeAssembly.standardOrientation(sourceFrame)
    // Unique source-pixel labels carry identity through the same global
    // rotation, even when photographed color grids happen to be symmetric.
    let photos = Dict.fromArray(
      slots->Array.map(slot => (
        slot,
        Array.fromInitializer(~length=3, row =>
          Array.fromInitializer(~length=3, col => `${slot}${Int.toString(row * 3 + col)}`)
        ),
      )),
    )
    let sourceLabels = placedFaces(photos, placements)
    let labels =
      CaptureFaceMapping.transformFaces(sourceLabels, canonical.index)
      ->Null.toOption
      ->Option.getOrThrow
    let mapping = faceKeys->Array.map(target => {
      let grid = faceValue(labels, target)
      let slot = grid->Array.getUnsafe(1)->Array.getUnsafe(1)->String.slice(~start=0, ~end=1)
      let original = photos->Dict.getUnsafe(slot)
      let quarterTurns =
        [0, 1, 2, 3]
        ->Array.find(turns =>
          OrientationWizard.faceContentKey(CubeGeometry.rotateGrid(original, turns)) ==
            OrientationWizard.faceContentKey(grid)
        )
        ->Option.getOrThrow
      {CaptureFaceMapping.slot, target, quarterTurns}
    })
    {
      mapping,
      validation: CaptureFaceMapping.validateMapping(captured, mapping, size),
      canonicalTransform: Null.make(canonical.index),
    }
  }
}

let physicalSeed = (captured, size) => seedForMapping(captured, size, physicalMapping)
let seedForProtocol = (captured, size, protocol) =>
  seedForMapping(
    captured,
    size,
    protocol == currentProtocol
      ? currentMapping
      : protocol == mirroredProtocol
      ? mirroredMapping
      : physicalMapping,
  )
