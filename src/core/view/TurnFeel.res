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

type modeLevel =
  | @as("block") Block
  | @as("cube") Cube

type note = {frequency: float, start: float, duration: float}

// A held sticker announces that it now turns more: one short tone for a
// block of layers, two rising tones for the whole cube (seconds, hertz).
let modeCueNotes = level =>
  switch level {
  | Block => [{frequency: 660.0, start: 0.0, duration: 0.06}]
  | Cube => [
      {frequency: 660.0, start: 0.0, duration: 0.05},
      {frequency: 990.0, start: 0.07, duration: 0.06},
    ]
  }

let modeCueGain = 0.08
