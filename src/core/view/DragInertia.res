let decayMs = 240.0
let stopSpeed = 0.00003

type step = {delta: float, velocity: float}

// Integrates one frame of a released drag with time-based friction.
let stepDragInertia = (velocity, elapsedMs) =>
  if Math.abs(velocity) < stopSpeed || elapsedMs <= 0.0 {
    {delta: 0.0, velocity: 0.0}
  } else {
    let decay = Math.exp(-.elapsedMs /. decayMs)
    let next = velocity *. decay
    {
      delta: velocity *. decayMs *. (1.0 -. decay),
      velocity: Math.abs(next) < stopSpeed ? 0.0 : next,
    }
  }
