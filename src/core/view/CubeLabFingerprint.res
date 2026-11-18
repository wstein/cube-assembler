// The machine-readable moves block for the CubeLab browser extension: the
// cube size and the move history written exactly as the Moves line shows it.
// Nothing else goes in (see docs/cubelab-fingerprint.md).

let format = "layer-prefix/v1"
let formatV2 = "layer-prefix/v2"

// The largest cube layer-prefix/v1 can describe: its layer numbers have one
// digit. Larger cubes use layer-prefix/v2 (see docs/cubelab-fingerprint.md).
let maxSizeV1 = 7

let formatFor = size => size <= maxSizeV1 ? format : formatV2

type payload = {
  size: int,
  moves: string,
  format: string,
}

let movesText = (moves: array<CubeMoves.cubeTurn>, size) =>
  moves->Array.map(move => CubeMoves.formatCubeTurn(move, size))->Array.join(" ")

let payload = (moves, size) => {size, moves: movesText(moves, size), format: formatFor(size)}

// JSON text that is safe inside a script element: "<" becomes <, so
// neither </script nor <!-- can occur.
let escapeForScript = json => json->String.replaceAll("<", "\\u003c")

let json = (moves, size) =>
  payload(moves, size)->JSON.stringifyAny->Option.getOr("{}")->escapeForScript
