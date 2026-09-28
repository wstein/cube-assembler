// Picking a block of layers on a held sticker: the first clear move across
// layers chooses the axis, later moves stretch the block to the layer under
// the finger, and a move the other way starts turning it. The caller keeps
// the gesture and applies each step.
type point = (float, float)

// The layers from `from` to `to` along `axis`, and where the finger was
// when it last moved across them.
type block = {axis: int, from: int, to: int, anchor: point}

@tag("kind")
type step =
  // No clear move yet: nothing to pick.
  | @as("none") NoStep
  // Start turning `layer`, measured from `from` on `hit`.
  | @as("turn") Turn({layer: CubeGesture.swipeLayer, from: point, hit: CubeGesture.surfaceHit})
  // Still picking: the block so far, lit up as `layer`.
  | @as("pick") Pick({block: block, layer: CubeGesture.swipeLayer})

let coordinate = ((x, y, z): CubeGesture.vec, axis) =>
  switch axis {
  | 0 => x
  | 1 => y
  | _ => z
  }

// `here` and `start` are client coordinates of the pointer now and where
// the gesture began; `origin` is the canvas's top-left corner.
let pickBlockStep = (
  block: Nullable.t<block>,
  hit: CubeGesture.surfaceHit,
  (hereX, hereY) as here: point,
  (startX, startY): point,
  (left, top): point,
  camera,
  startPx,
  size,
) => {
  let sizeF = Int.toFloat(size)
  let onPlane = ((x, y)) =>
    CubeGesture.facePlanePoint(x -. left, y -. top, camera, hit)->Null.toOption
  let layerOf = (point, axis) => Float.toInt(CubeGesture.layerIndex(coordinate(point, axis), sizeF))
  let picked = switch Nullable.toOption(block) {
  | None =>
    CubeGesture.swipeMoveAxis(hit, hereX -. startX, hereY -. startY, camera, startPx)
    ->Null.toOption
    ->Option.map(axis => {
      let start = layerOf(hit.point, axis)
      Ok({axis, from: start, to: start, anchor: here})
    })
  | Some(block) =>
    switch onPlane(block.anchor) {
    | None => Some(Ok(block))
    | Some(anchorPoint) =>
      let anchorHit = {...hit, point: anchorPoint}
      let (anchorX, anchorY) = block.anchor
      switch CubeGesture.pickSwipeLayer(
        anchorHit,
        hereX -. anchorX,
        hereY -. anchorY,
        camera,
        startPx,
      )->Null.toOption {
      | Some(move) if move.axis == block.axis =>
        Some(
          Error(
            Turn({
              layer: CubeGesture.blockLayer(block.axis, block.from, block.to, size),
              from: block.anchor,
              hit: anchorHit,
            }),
          ),
        )
      | Some(_) => Some(Ok({...block, anchor: here}))
      | None => Some(Ok(block))
      }
    }
  }
  switch picked {
  | None => NoStep
  | Some(Error(turn)) => turn
  | Some(Ok(block)) =>
    let block = switch onPlane(here) {
    | Some(point) => {...block, to: layerOf(point, block.axis)}
    | None => block
    }
    Pick({block, layer: CubeGesture.blockLayer(block.axis, block.from, block.to, size)})
  }
}
