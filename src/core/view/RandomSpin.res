// The spin that hides the Random State swap: the whole cube turns once about
// the vertical axis, and its stickers change at the midpoint, when the turn is
// fastest.

@genType let spinMs = 450.0

@genType
type frame = {angle: float, swapped: bool, finished: bool}

// The turn `elapsed` milliseconds in: ease in and out, 0 to a full turn.
@genType
let spinFrame = (elapsed: float): frame => {
  let t = Math.min(1.0, Math.max(0.0, elapsed /. spinMs))
  {
    angle: (0.5 -. 0.5 *. Math.cos(Math.Constants.pi *. t)) *. 2.0 *. Math.Constants.pi,
    swapped: t >= 0.5,
    finished: t >= 1.0,
  }
}
