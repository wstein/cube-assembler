// Detect face's live display holds a confirmed face through a weak frame or
// two - motion blur, a finger passing - instead of flickering between the
// colors and "Align face in view". Display only: automatic capture still
// judges every frame on its own, and a held face never lends its bounds to
// a new frame.

let liveHoldFrames = 2

type liveHold<'a> = {
  // The last confirmed frame's result, while it may still be shown.
  shown: Null.t<'a>,
  // Weak frames in a row since it was confirmed.
  weak: int,
}

// Nothing held yet.
let noHold = () => {shown: Null.null, weak: 0}

type held<'a> = {hold: liveHold<'a>, show: 'a, visible: bool}

// What to show for `frame`: itself when `confirmed`, otherwise the last
// confirmed result for up to liveHoldFrames weak frames, then `frame` as
// not found.
let holdConfirmedFace = (hold: liveHold<'a>, frame: 'a, confirmed) =>
  if confirmed {
    {hold: {shown: Null.make(frame), weak: 0}, show: frame, visible: true}
  } else {
    switch hold.shown->Null.toOption {
    | Some(shown) if hold.weak < liveHoldFrames => {
        hold: {shown: Null.make(shown), weak: hold.weak + 1},
        show: shown,
        visible: true,
      }
    | _ => {hold: {shown: Null.null, weak: 0}, show: frame, visible: false}
    }
  }
