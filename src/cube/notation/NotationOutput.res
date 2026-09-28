open CubeState
type cubeState = CubeState.cubeState

type notationFormat = | @as("wrg") Wrg | @as("urf") Urf

let faces = (cube: cubeState) => [cube.u, cube.r, cube.f, cube.d, cube.l, cube.b]
let letters = ["U", "R", "F", "D", "L", "B"]

let toBlocks = (cube, translate) =>
  cube->faces->Array.map(face => face->Array.map(translate)->Array.join(""))->Array.join(" ")

let faceletsPerFace = total => {
  if total <= 0 || total % 6 != 0 {
    None
  } else {
    let perFace = total / 6
    let size = perFace->Int.toFloat->Math.sqrt->Int.fromFloat

    // The smallest cube is 2x2: six single facelets are no cube.
    if size >= 2 && size * size == perFace {
      Some(perFace)
    } else {
      None
    }
  }
}

let parse = (input, valid, translate, label) => {
  let compact = input->String.trim->String.replaceAllRegExp(/\s+/g, "")
  switch faceletsPerFace(String.length(compact)) {
  | None =>
    Console.warn(
      `Invalid ${label} facelets string: length ${Int.toString(
          String.length(compact),
        )} is not 6 perfect-square blocks of at least 2x2`,
    )
    Null.null
  | Some(perFace) =>
    let chars = String.split(compact, "")
    switch Array.find(chars, char => !String.includes(valid, char)) {
    | Some(char) =>
      Console.warn(`Invalid ${label} facelet letter: ${char}`)
      Null.null
    | None =>
      let colors = chars->Array.map(translate)
      let face = i => colors->Array.slice(~start=i * perFace, ~end=(i + 1) * perFace)
      Null.make({u: face(0), r: face(1), f: face(2), d: face(3), l: face(4), b: face(5)})
    }
  }
}

let colorToFace = color =>
  switch color {
  | "W" => "U"
  | "G" => "F"
  | "Y" => "D"
  | "O" => "L"
  | "R" | "B" => color
  | _ => "?"
  }

let faceToColor = face =>
  switch face {
  | "U" => "W"
  | "F" => "G"
  | "D" => "Y"
  | "L" => "O"
  | _ => face
  }

let toWRGFacelets = cube => toBlocks(cube, color => color)
let fromWRGFacelets = input => parse(String.toUpperCase(input), "WYORGB", color => color, "WRG")
let toURFFacelets = cube => toBlocks(cube, colorToFace)
let fromURFFacelets = input => parse(String.toUpperCase(input), "URFDLB", faceToColor, "URF")

let gridsToWRGFacelets = grids => {
  let face = key =>
    switch Dict.get(grids, key) {
    | Some(rows) => Array.concatMany([], rows)
    | None => panic(`Missing ${key} face grid`)
    }
  toWRGFacelets({
    u: face("U"),
    r: face("R"),
    f: face("F"),
    d: face("D"),
    l: face("L"),
    b: face("B"),
  })
}

let wrgFaceletsToGrids = input =>
  switch fromWRGFacelets(input)->Null.toOption {
  | None => Null.null
  | Some(cube) =>
    let byFace = faces(cube)
    let size = cube.u->Array.length->Int.toFloat->Math.sqrt->Int.fromFloat
    let result = Dict.make()
    for i in 0 to 5 {
      let cells = Array.getUnsafe(byFace, i)
      let rows = []
      for row in 0 to size - 1 {
        rows->Array.push(cells->Array.slice(~start=row * size, ~end=(row + 1) * size))->ignore
      }
      Dict.set(result, Array.getUnsafe(letters, i), rows)
    }
    Null.make(result)
  }

let detectNotationFormat = input => {
  let chars = input->String.toUpperCase->String.split("")
  let hasWrgOnly = chars->Array.some(char => String.includes("WYOG", char))
  let hasUrfOnly = chars->Array.some(char => String.includes("UFDL", char))
  if hasWrgOnly && !hasUrfOnly {
    Null.make(Wrg)
  } else if hasUrfOnly && !hasWrgOnly {
    Null.make(Urf)
  } else {
    Null.null
  }
}
