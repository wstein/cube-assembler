type rgb = {r: float, g: float, b: float}

// Fraction of each sticker cell actually sampled, centered - the rest is a
// dead zone the color/edge detectors ignore. The UI draws the same boundary.
let sampleCoreFraction = 0.6

// The centered part of each sticker cell to sample. Cube profiles adjust
// this for different sticker gaps; backdrop exclusion stays fixed.
type samplingGeometry = {stickerCore: float}

let defaultSampling = {stickerCore: sampleCoreFraction}

// Where the grid lines of a face fall, as fractions of its size. Outer
// rows and columns can be `outer` times as wide as the inner ones.
let cellEdges = (gridSize, outer) =>
  if gridSize <= 2 || outer == 1.0 {
    Array.fromInitializer(~length=gridSize + 1, i => Int.toFloat(i) /. Int.toFloat(gridSize))
  } else {
    let total = Int.toFloat(gridSize - 2) +. 2.0 *. outer
    [
      0.0,
      ...Array.fromInitializer(~length=gridSize - 1, i => (outer +. Int.toFloat(i)) /. total),
      1.0,
    ]
  }

type rect = {x: float, y: float, width: float, height: float}

// A sticker cell's sampled rectangle within a face of the given size -
// shared by the detector and the UI overlay so both draw the same zones.
// `outerCellRatio` widens the outer rows and columns (see cellEdges).
let stickerSampleRect = (row, col, gridSize, faceWidth, faceHeight, sampling, outerCellRatio) => {
  let inset = (1.0 -. sampling.stickerCore) /. 2.0
  if outerCellRatio == 1.0 {
    // Even cells, computed exactly as always so saved readings still match.
    let cellWidth = faceWidth /. Int.toFloat(gridSize)
    let cellHeight = faceHeight /. Int.toFloat(gridSize)
    {
      x: (Int.toFloat(col) +. inset) *. cellWidth,
      y: (Int.toFloat(row) +. inset) *. cellHeight,
      width: cellWidth *. sampling.stickerCore,
      height: cellHeight *. sampling.stickerCore,
    }
  } else {
    let edges = cellEdges(gridSize, outerCellRatio)
    let edge = i => edges->Array.getUnsafe(i)
    let cellWidth = (edge(col + 1) -. edge(col)) *. faceWidth
    let cellHeight = (edge(row + 1) -. edge(row)) *. faceHeight
    {
      x: edge(col) *. faceWidth +. inset *. cellWidth,
      y: edge(row) *. faceHeight +. inset *. cellHeight,
      width: cellWidth *. sampling.stickerCore,
      height: cellHeight *. sampling.stickerCore,
    }
  }
}

// Standard cube sticker colors (WCA compliant).
let stickerColors = Dict.fromArray([
  ("W", {r: 255.0, g: 255.0, b: 255.0}),
  ("Y", {r: 255.0, g: 255.0, b: 0.0}),
  ("O", {r: 255.0, g: 127.0, b: 0.0}),
  ("R", {r: 255.0, g: 0.0, b: 0.0}),
  ("G", {r: 0.0, g: 128.0, b: 0.0}),
  ("B", {r: 0.0, g: 0.0, b: 255.0}),
])
