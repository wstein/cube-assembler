type faces = Dict.t<array<array<string>>>
type colors = Dict.t<string>
type axis = | @as("x") X | @as("y") Y | @as("z") Z
type faceKey = CubeState.faceKey
type vec = (int, int, int)
type cell = (string, int, int)

let faceKeys = ["U", "R", "F", "D", "L", "B"]

let cellPosition = (face, row, col, n): vec => {
  let a = -(n - 1) + 2 * col
  let b = n - 1 - 2 * row
  switch face {
  | "F" => (a, b, n)
  | "B" => (-a, b, -n)
  | "R" => (n, b, -a)
  | "L" => (-n, b, a)
  | "U" => (a, n, -b)
  | "D" => (a, -n, b)
  | _ => panic(`Unknown face ${face}`)
  }
}

let quarterTurn = ((x, y, z), axis): vec =>
  switch axis {
  | X => (x, z, -y)
  | Y => (-z, y, x)
  | Z => (y, -x, z)
  }

let key = ((x, y, z)) => `${Int.toString(x)},${Int.toString(y)},${Int.toString(z)}`
let cellLookup: Dict.t<Dict.t<cell>> = Dict.make()

let cellsBySize = n => {
  let sizeKey = Int.toString(n)
  switch Dict.get(cellLookup, sizeKey) {
  | Some(cells) => cells
  | None =>
    let cells = Dict.make()
    faceKeys->Array.forEach(face => {
      for row in 0 to n - 1 {
        for col in 0 to n - 1 {
          Dict.set(cells, key(cellPosition(face, row, col, n)), (face, row, col))
        }
      }
    })
    Dict.set(cellLookup, sizeKey, cells)
    cells
  }
}

let faceGrid = (faces, face) =>
  switch Dict.get(faces, face) {
  | Some(grid) => grid
  | None => panic(`Missing ${face} face`)
  }

let transform = (faces, move) => {
  let n = faceGrid(faces, "U")->Array.length
  let out = Dict.make()
  faceKeys->Array.forEach(face => {
    let rows = []
    for _row in 0 to n - 1 {
      rows->Array.push(Array.make(~length=n, ""))->ignore
    }
    Dict.set(out, face, rows)
  })
  let cellOf = cellsBySize(n)
  faceKeys->Array.forEach(face => {
    let source = faceGrid(faces, face)
    for row in 0 to n - 1 {
      for col in 0 to n - 1 {
        let target = move(cellPosition(face, row, col, n))
        let (targetFace, targetRow, targetCol) = switch Dict.get(cellOf, key(target)) {
        | Some(cell) => cell
        | None => panic("Rotated sticker position is missing")
        }
        let sticker = source->Array.getUnsafe(row)->Array.getUnsafe(col)
        faceGrid(out, targetFace)->Array.getUnsafe(targetRow)->Array.set(targetCol, sticker)
      }
    }
  })
  out
}

let rec repeatTurns = (point, axis, remaining) =>
  if remaining == 0 {
    point
  } else {
    repeatTurns(quarterTurn(point, axis), axis, remaining - 1)
  }

let repeat = (point, axis, times) => repeatTurns(point, axis, (times % 4 + 4) % 4)

let rotateCube = (faces, axis, quarterTurns) =>
  transform(faces, point => repeat(point, axis, quarterTurns))

let turnFace = (faces, face: faceKey, quarterTurns, depth) => {
  let n = faceGrid(faces, "U")->Array.length
  let axis = switch face {
  | U | D => Y
  | R | L => X
  | F | B => Z
  }
  let positive = switch face {
  | U | R | F => true
  | D | L | B => false
  }
  let axisValue = ((x, y, z)) =>
    switch axis {
    | X => x
    | Y => y
    | Z => z
    }
  let turns = if positive {
    quarterTurns
  } else {
    -quarterTurns
  }
  transform(faces, point => {
    let value = if positive {
      axisValue(point)
    } else {
      -axisValue(point)
    }
    if value >= n - 1 - 2 * (depth - 1) {
      repeat(point, axis, turns)
    } else {
      point
    }
  })
}

let allOrientations = faces => {
  let tops = [(X, 0), (X, 1), (X, 2), (X, 3), (Z, 1), (Z, 3)]
  tops->Array.flatMap(((axis, turns)) => {
    let topped = rotateCube(faces, axis, turns)
    [0, 1, 2, 3]->Array.map(y => rotateCube(topped, Y, y))
  })
}

let solvedCubeFaces = (n, colors) => {
  let out = Dict.make()
  faceKeys->Array.forEach(face => {
    let color = switch Dict.get(colors, face) {
    | Some(color) => color
    | None => panic(`Missing ${face} color`)
    }
    let rows = []
    for _row in 0 to n - 1 {
      rows->Array.push(Array.make(~length=n, color))->ignore
    }
    Dict.set(out, face, rows)
  })
  out
}
