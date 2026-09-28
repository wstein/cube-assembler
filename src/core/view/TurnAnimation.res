// How the 3D cube's turns play out over time: the queue of turns, the
// angle of the one animating, what a finished turn does to the cube and
// the move list, settling a released drag, and turning the view. The
// component keeps the refs, the frame loop and the WebGL drawing.
type faceKey = CubeState.faceKey

// A turn waiting in the queue. `from` is where a released drag left the
// layer; `duration` falls back to the queue's default.
type queuedTurn = {
  face: faceKey,
  depth?: int,
  width?: int,
  turns: int,
  from?: float,
  duration?: float,
  undo?: bool,
}

// The turn animating now. `overshoot` snaps it a little past like a
// magnetic cube.
type activeTurn = {
  face: faceKey,
  depth?: int,
  width?: int,
  turns: int,
  from?: float,
  startTime: float,
  duration: float,
  overshoot: bool,
  undo?: bool,
}

let quarter = Math.Constants.pi /. 2.0

// Starts a queued turn at `time`.
let startTurn = (next: queuedTurn, time, overshoot, fallbackDuration): activeTurn => {
  face: next.face,
  depth: ?next.depth,
  width: ?next.width,
  turns: next.turns,
  from: ?next.from,
  startTime: time,
  duration: next.duration->Option.getOr(fallbackDuration),
  overshoot,
  undo: ?next.undo,
}

type frame = {angle: float, finished: bool}

// Where the animating layer is at `time`, eased from where it started to
// its whole quarter turns.
let turnFrame = (turn: activeTurn, time) => {
  let progress = Math.min(1.0, Math.max(0.0, (time -. turn.startTime) /. turn.duration))
  let ease = TurnFeel.turnEase(progress, turn.overshoot)
  let from = turn.from->Option.getOr(0.0)
  let target = Int.toFloat(turn.turns) *. quarter
  {angle: from +. ease *. (target -. from), finished: progress >= 1.0}
}

type turned = {cube: CubeState.cubeState, moves: array<CubeMoves.cubeTurn>}

// The cube and move list once a turn has finished; null for a drag
// released short of a quarter turn, which springs back and changes
// nothing. An undo removes the last move instead of recording one.
let finishTurn = (cube, size, moves: array<CubeMoves.cubeTurn>, turn: activeTurn) =>
  if turn.turns == 0 {
    Null.null
  } else {
    let depth = turn.depth->Option.getOr(1)
    Null.make({
      cube: CubeMoves.applyCubeLayerMove(
        cube,
        size,
        turn.face,
        depth,
        turn.turns,
        turn.width->Option.getOr(1),
      ),
      moves: turn.undo == Some(true)
        ? moves->Array.slice(~start=0, ~end=Array.length(moves) - 1)
        : CubeMoves.recordTurn(
            moves,
            {face: turn.face, depth, width: ?turn.width, turns: turn.turns},
          ),
    })
  }

// A released drag, settling on `turns` quarter turns from where the finger
// left the layer, in time proportional to how far it has left.
let settleTurn = (layer: CubeGesture.swipeLayer, angle, turns, turnMs): queuedTurn => {
  let distance = Math.abs(Int.toFloat(turns) *. quarter -. angle) /. quarter
  {
    face: layer.face,
    depth: layer.depth,
    width: ?layer.width,
    turns,
    from: angle,
    duration: TurnFeel.settleDuration(distance, turnMs),
  }
}

// A scramble's moves, each at the scramble speed.
let scrambleQueue = (moves: array<CubeMoves.cubeTurn>, duration) =>
  moves->Array.map((move): queuedTurn => {
    face: move.face,
    depth: move.depth,
    width: ?move.width,
    turns: move.turns,
    duration,
  })

// What a dragged layer's mesh shows, so it is rebuilt only when that
// changes.
let dragMeshKey = (layer: CubeGesture.swipeLayer, angle, highlight) =>
  `${(layer.face :> string)}${Int.toString(layer.depth)}/${Int.toString(
      layer.width->Option.getOr(1),
    )}:${Float.toString(angle)}:${highlight ? "1" : "0"}`

// ─── The view ─────────────────────────────────────────────────────────────────

let pitchLimit = Math.Constants.pi /. 2.0 -. 0.05
let clampPitch = pitch => Math.max(-.pitchLimit, Math.min(pitchLimit, pitch))

type viewTurn = {yaw: float, pitch: float, yawVelocity: float, pitchVelocity: float}

// Dragging the view by (dx, dy) pixels over `elapsedMs`: how far it turns,
// and the speed it keeps turning at once released (capped).
let viewTurn = (dx, dy, elapsedMs) => {
  let speed = 0.008
  let capped = v => Math.max(-0.006, Math.min(0.006, v))
  {
    yaw: dx *. speed,
    pitch: dy *. speed,
    yawVelocity: capped(dx *. speed /. elapsedMs),
    pitchVelocity: capped(dy *. speed /. elapsedMs),
  }
}

// Whether a cube still shows its starting position.
let isInitialCube = (current: CubeState.cubeState, cube: CubeState.cubeState) =>
  current === cube || {
      let same = (a, b) => a->Array.everyWithIndex((value, i) => value == b->Array.getUnsafe(i))
      same(current.u, cube.u) &&
      same(current.r, cube.r) &&
      same(current.f, cube.f) &&
      same(current.d, cube.d) &&
      same(current.l, cube.l) &&
      same(current.b, cube.b)
    }
