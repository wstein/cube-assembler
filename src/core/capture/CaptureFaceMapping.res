// Explicit photo identities remain separate from the assembled cube. Edits
// create new values and never change the captured grids or detection data.
open CubeTypes

@genType
type placement = {slot: string, target: CubeState.faceKey, quarterTurns: int}
@genType type mapping = array<placement>
@genType
type validation = {
  faces: Null.t<faceSet<grid>>,
  candidate: Null.t<orientedCandidate>,
  valid: bool,
  issues: array<string>,
  parity: Null.t<Parity.parityResult>,
}
@genType
type frame = {
  faces: faceSet<grid>,
  mapping: mapping,
  // Indices in CubeGeometry.allOrientations, fixed by the capture schema version.
  // displayTransform maps canonical to display; canonicalTransform is its inverse.
  displayTransform: int,
  canonicalTransform: int,
}

let letter = (face: CubeState.faceKey) =>
  switch face {
  | U => "U"
  | R => "R"
  | F => "F"
  | D => "D"
  | L => "L"
  | B => "B"
  }
let slots = faceKeys->Array.map(letter)
let normalize = value => mod(mod(value, 4) + 4, 4)
let signature = (grid: grid) => grid->Array.map(row => row->Array.join(","))->Array.join(";")
let centerFace = (grid: grid) => {
  let middle = Array.length(grid) / 2
  grid
  ->Array.get(middle)
  ->Option.flatMap(row => row->Array.get(middle))
  ->Option.flatMap(color => faceKeys->Array.find(face => CubePieces.solvedColor(face) == color))
}
let shape = (grid: grid, size) =>
  Array.length(grid) == size && grid->Array.every(row => Array.length(row) == size)

let initializeMapping = (captured: Dict.t<grid>, candidate: Null.t<orientedCandidate>): mapping => {
  let size = captured->Dict.valuesToArray->Array.get(0)->Option.mapOr(0, Array.length)
  let fallback = slots->Array.mapWithIndex((slot, i) => {
    let target = if mod(size, 2) == 1 {
      captured
      ->Dict.get(slot)
      ->Option.flatMap(centerFace)
      ->Option.getOr(faceKeys->Array.getUnsafe(i))
    } else {
      faceKeys->Array.getUnsafe(i)
    }
    {slot, target, quarterTurns: 0}
  })
  // Older solver results do not carry photo identities. Find a complete
  // bijection, not six independent matches which could reuse one photo.
  // The UI labels this initialization as inferred; persisted edits bypass it.
  let rec match = (index, chosen: mapping, wanted: orientedCandidate) => {
    if index == 6 {
      Some(chosen)
    } else {
      let target = faceKeys->Array.getUnsafe(index)
      let targetGrid = faceValue(wanted.faces, target)
      let found = ref(None)
      slots->Array.forEach(slot => {
        if found.contents->Option.isNone && !(chosen->Array.some(entry => entry.slot == slot)) {
          switch captured->Dict.get(slot) {
          | Some(grid)
            if shape(grid, size) && (mod(size, 2) == 0 || centerFace(grid) == Some(target)) =>
            for quarterTurns in 0 to 3 {
              if (
                found.contents->Option.isNone &&
                  signature(CubeGeometry.rotateGrid(grid, quarterTurns)) == signature(targetGrid)
              ) {
                found := match(index + 1, [...chosen, {slot, target, quarterTurns}], wanted)
              }
            }
          | _ => ()
          }
        }
      })
      found.contents
    }
  }
  switch candidate->Null.toOption->Option.flatMap(wanted => match(0, [], wanted)) {
  | Some(chosen) =>
    slots->Array.map(slot => chosen->Array.find(entry => entry.slot == slot)->Option.getOrThrow)
  | None => fallback
  }
}

let rotateMapping = (mapping: mapping, slot, delta) =>
  mapping->Array.map(entry =>
    entry.slot == slot
      ? {...entry, quarterTurns: normalize(entry.quarterTurns + delta)}
      : {slot: entry.slot, target: entry.target, quarterTurns: entry.quarterTurns}
  )
let assignMapping = (mapping: mapping, slot, target) =>
  mapping->Array.map(entry =>
    entry.slot == slot
      ? {...entry, target}
      : {slot: entry.slot, target: entry.target, quarterTurns: entry.quarterTurns}
  )

let validateMapping = (captured: Dict.t<grid>, mapping: mapping, size): validation => {
  let issues = []
  if size < 2 || size > 8 {
    issues->Array.push("Manual face mapping supports sizes 2 through 8.")
  }
  if Array.length(mapping) != 6 {
    issues->Array.push("Assign all six captured photos.")
  }
  if Dict.keysToArray(captured)->Array.length != 6 {
    issues->Array.push("Exactly six captured photos are required.")
  }
  if mod(size, 2) == 1 {
    let centers = captured->Dict.valuesToArray->Array.map(centerFace)
    let known = centers->Array.filterMap(value => value)
    if Array.length(known) != 6 || Set.fromArray(known)->Set.size != 6 {
      issues->Array.push(
        "The six fixed centers must identify six different cube sides; check conflicting centers or the color scheme.",
      )
    }
  }
  let knownSlots = Set.make()
  let assigned = Set.make()
  mapping->Array.forEach(entry => {
    if !(slots->Array.includes(entry.slot)) || knownSlots->Set.has(entry.slot) {
      issues->Array.push("Each captured photo must be assigned exactly once.")
    }
    knownSlots->Set.add(entry.slot)
    if !(faceKeys->Array.includes(entry.target)) {
      issues->Array.push("Every assigned side must be U, R, F, D, L or B.")
    }
    let target = letter(entry.target)
    if assigned->Set.has(target) {
      issues->Array.push("Each cube side must be assigned exactly once.")
    }
    assigned->Set.add(target)
    let turns = Int.toFloat(entry.quarterTurns)
    if (
      !Float.isFinite(turns) ||
      Math.floor(turns) != turns ||
      entry.quarterTurns < 0 ||
      entry.quarterTurns > 3
    ) {
      issues->Array.push("Photo rotations must be whole quarter turns from 0 through 3.")
    }
    switch captured->Dict.get(entry.slot) {
    | None => issues->Array.push(`The ${entry.slot} photo is missing.`)
    | Some(grid) =>
      if !shape(grid, size) {
        issues->Array.push(`The ${entry.slot} photo has the wrong grid size.`)
      } else {
        if (
          !(
            grid->Array.every(row =>
              row->Array.every(color => ["W", "R", "G", "Y", "O", "B"]->Array.includes(color))
            )
          )
        ) {
          issues->Array.push(`The ${entry.slot} photo contains an unknown sticker color.`)
        }
        if mod(size, 2) == 1 && centerFace(grid) != Some(entry.target) {
          issues->Array.push(
            `The fixed center of photo ${entry.slot} does not identify the assigned ${target} side.`,
          )
        }
      }
    }
  })
  if Array.length(issues) > 0 {
    {faces: Null.null, candidate: Null.null, valid: false, issues, parity: Null.null}
  } else {
    let faces = Dict.make()
    let rotations = Dict.make()
    mapping->Array.forEach(entry => {
      let target = letter(entry.target)
      faces->Dict.set(
        target,
        CubeGeometry.rotateGrid(captured->Dict.getUnsafe(entry.slot), entry.quarterTurns),
      )
      rotations->Dict.set(target, entry.quarterTurns)
    })
    let typed = fromGeometry(faces)
    let cube = CubeAssembly.assembleCubeFromFaces(faces, size)->CubeAssembly.toCubeIR(size)
    let parity = Parity.runFullParity(cube)
    if !parity.valid {
      issues->Array.push(parity.result)
    }
    {
      faces: Null.make(typed),
      candidate: Null.make({faces: typed, rotations: Obj.magic(rotations)}),
      valid: parity.valid,
      issues,
      parity: Null.make(parity),
    }
  }
}

// Unique labels carry coordinate transforms independently of sticker colors.
let labels = () =>
  Dict.fromArray(
    slots->Array.map(slot => (
      slot,
      Array.fromInitializer(~length=3, row =>
        Array.fromInitializer(~length=3, col => `${slot}${Int.toString(row * 3 + col)}`)
      ),
    )),
  )
let faceSignature = faces =>
  slots->Array.map(slot => signature(faces->Dict.getUnsafe(slot)))->Array.join("|")
let transformFaces = (faces: faceSet<grid>, index) => {
  let value = Int.toFloat(index)
  if !Float.isFinite(value) || Math.floor(value) != value || index < 0 || index >= 24 {
    Null.null
  } else {
    Null.make(CubeGeometry.orientationAt(toGeometry(faces), index)->fromGeometry)
  }
}
let inverseTransform = index => {
  let identity = labels()
  switch transformFaces(fromGeometry(identity), index)->Null.toOption {
  | None => Null.null
  | Some(oriented) =>
    Null.make(
      CubeGeometry.allOrientations(toGeometry(oriented))->Array.findIndex(frame =>
        faceSignature(frame) == faceSignature(identity)
      ),
    )
  }
}
let captureFrame = (captured, mapping: mapping, frontSlot, upSlot): Null.t<frame> => {
  let size = captured->Dict.valuesToArray->Array.get(0)->Option.mapOr(0, Array.length)
  let faces = validateMapping(captured, mapping, size).faces->Null.toOption
  let front = mapping->Array.find(entry => entry.slot == frontSlot)
  let up = mapping->Array.find(entry => entry.slot == upSlot)
  switch (faces, front, up) {
  | (Some(faces), Some(front), Some(up)) =>
    let identity = labels()
    let orientations = CubeGeometry.allOrientations(identity)
    let center = (oriented, target) =>
      oriented->Dict.getUnsafe(target)->Array.getUnsafe(1)->Array.getUnsafe(1)
    let displayTransform =
      orientations->Array.findIndex(oriented =>
        center(oriented, "F") == `${letter(front.target)}4` &&
          center(oriented, "U") == `${letter(up.target)}4`
      )
    if displayTransform >= 0 {
      let oriented = orientations->Array.getUnsafe(displayTransform)
      let canonicalTransform =
        CubeGeometry.allOrientations(oriented)->Array.findIndex(frame =>
          faceSignature(frame) == faceSignature(identity)
        )
      let transformed = slots->Array.map(target => {
        let targetLabels = oriented->Dict.getUnsafe(target)
        let sourceFace = center(oriented, target)->String.slice(~start=0, ~end=1)
        let original = identity->Dict.getUnsafe(sourceFace)
        let turns =
          [0, 1, 2, 3]
          ->Array.find(turns =>
            signature(CubeGeometry.rotateGrid(original, turns)) == signature(targetLabels)
          )
          ->Option.getOrThrow
        let photo =
          mapping->Array.find(entry => letter(entry.target) == sourceFace)->Option.getOrThrow
        {
          slot: photo.slot,
          target: faceKeys->Array.find(face => letter(face) == target)->Option.getOrThrow,
          quarterTurns: normalize(photo.quarterTurns + turns),
        }
      })
      Null.make({
        faces: CubeGeometry.allOrientations(toGeometry(faces))
        ->Array.getUnsafe(displayTransform)
        ->fromGeometry,
        mapping: transformed,
        displayTransform,
        canonicalTransform,
      })
    } else {
      Null.null
    }
  | _ => Null.null
  }
}
