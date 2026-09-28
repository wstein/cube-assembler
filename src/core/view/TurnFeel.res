// How a layer turn feels: magnetic cubes hold a layer briefly, then snap it
// a little past the quarter turn and let it settle.

// Overshoot strength of the snap; 1.0 goes about 3.7% past the turn.
let snap = 1.0

let clamp01 = progress => Math.min(1.0, Math.max(0.0, progress))

let magneticEase = progress => {
  let t = clamp01(progress)
  if t == 0.0 || t == 1.0 {
    t
  } else {
    // A slow start, then an ease-out that overshoots near the end and
    // settles.
    let x = t *. t -. 1.0
    1.0 +. (snap +. 1.0) *. x *. x *. x +. snap *. x *. x
  }
}

// A plain ease-out for those who turn the magnetic snap off.
let smoothEase = progress => {
  let rest = 1.0 -. clamp01(progress)
  1.0 -. rest *. rest *. rest
}

let turnEase = (progress, overshoot) => overshoot ? magneticEase(progress) : smoothEase(progress)

// ─── Magnets while dragging and on release ────────────────────────────────────
let quarter = Math.Constants.pi /. 2.0

// How far from a quarter turn a dragged layer feels its magnet (about
// 17 degrees).
let magnetReach = 0.3

// The angle a dragged layer shows for the finger's angle: within reach of
// a quarter turn the magnet holds it, letting it follow ever faster as the
// finger pulls away, until it breaks free at magnetReach; in between it
// follows the finger exactly. Continuous, and it never runs backwards.
let magneticDragAngle = raw => {
  let detent = Math.round(raw /. quarter) *. quarter
  let d = raw -. detent
  let distance = Math.abs(d)
  distance >= magnetReach
    ? raw
    : detent +. (d >= 0.0 ? 1.0 : -1.0) *. magnetReach *. (distance /. magnetReach) ** 2.0
}

// When a let-go layer reaches its quarter turn, as a fraction of the settle.
let magnetImpact = 0.82

// How much faster than its average a let-go layer arrives at the magnet.
let magnetSuck = 2.4

// A let-go layer's angle, `progress` of the way through a settle of
// `duration` ms from `from` to `target`: it keeps the speed it was let go
// with (radians per ms), is sucked in ever faster, snaps a little past the
// quarter turn on impact and settles back onto it.
let magneticSettleAngle = (from, target, speed, duration, progress) => {
  let u = clamp01(progress)
  let distance = target -. from
  if u <= magnetImpact {
    // A cubic from the release, at its speed, to the magnet, arriving
    // magnetSuck times faster than the average.
    let s = u /. magnetImpact
    let s2 = s *. s
    let s3 = s2 *. s
    // A fast flick carries in at most twice the way left, so it never
    // flings the layer far past the magnet.
    let limit = 2.0 *. Math.abs(distance)
    let startSlope = Math.max(-.limit, Math.min(limit, speed *. duration *. magnetImpact))
    let endSlope = magnetSuck *. distance
    (2.0 *. s3 -. 3.0 *. s2 +. 1.0) *. from +.
    (s3 -. 2.0 *. s2 +. s) *. startSlope +.
    (-2.0 *. s3 +. 3.0 *. s2) *. target +.
    (s3 -. s2) *. endSlope
  } else {
    // The snap past it: at most 3.5% of a quarter turn, less for a short
    // spring back, dying away by the end.
    let w = (u -. magnetImpact) /. (1.0 -. magnetImpact)
    let amplitude =
      Math.min(0.035 *. quarter, 0.3 *. Math.abs(distance)) *. (distance >= 0.0 ? 1.0 : -1.0)
    target +. amplitude *. Math.sin(Math.Constants.pi *. w) *. (1.0 -. w)
  }
}

// A quarter turn's animation at the default speed. A released drag settles
// in proportion to how far it has left, between three quarters and one and
// a half of that; scrambles run at about half of it.
let defaultTurnMs = 160.0

let settleDuration = (quarters, turnMs) =>
  Math.max(0.75 *. turnMs, Math.min(1.5 *. turnMs, turnMs *. quarters))

let scrambleDuration = turnMs => Math.round(turnMs *. 85.0 /. defaultTurnMs)

// Scrambles turn every 85 ms; full-volume clicks would rattle.
let turnClickGain = (durationMs, soundOn) =>
  if !soundOn {
    0.0
  } else if durationMs < 120.0 {
    0.05
  } else {
    0.12
  }

type note = {frequency: float, start: float, duration: float}

// Selecting a wide turn plays one short tone (seconds, hertz).
let wideCueNotes = [{frequency: 660.0, start: 0.0, duration: 0.06}]

let modeCueGain = 0.08
