// Properties of the 3D view's gesture math on random input: releasing a
// drag, the live magnet, swiping, two-finger locks, touchpad swipes and
// zoom.
open Vitest
module Fc = FastCheck

let quarter = Math.Constants.pi /. 2.0
// Evenly spread in thousandths; fast-check's doubles crowd around zero.
let num = (min, max) =>
  Fc.integer({min: Float.toInt(min *. 1000.0), max: Float.toInt(max *. 1000.0)})->Fc.map(v =>
    Int.toFloat(v) /. 1000.0
  )
let camera: CubeGesture.camera = {
  width: 600.0,
  height: 400.0,
  zoom: 8.4,
  pitch: 0.52,
  yaw: -0.74,
  size: 3.0,
}
let near = (a, b) => Math.abs(a -. b) < 1e-9

describe("releasing a drag", () => {
  test(
    "always settles on whole quarter turns, never the wrong way",
    () =>
      Fc.check(Fc.tuple3(num(-10.0, 10.0), num(0.15, 0.6), num(0.0, 240.0)), ((
        angle,
        commit,
        flick,
      )) => {
        let turns = CubeGesture.releasedQuarterTurns(angle, 0.0, commit, flick)
        Math.floor(turns) == turns &&
        (turns == 0.0 || Math.sign(turns) == Math.sign(angle)) &&
        // A slow release goes to the nearest quarter turn past the commit
        // point, so it is never more than a quarter away.
        Math.abs(angle /. quarter -. turns) < 1.0
      }),
    60000,
  )

  test(
    "lets a flick carry it on, never against the flick",
    () =>
      Fc.check(Fc.tuple4(num(-10.0, 10.0), num(-0.05, 0.05), num(0.15, 0.6), num(0.0, 240.0)), ((
        angle,
        velocity,
        commit,
        flick,
      )) => {
        let slow = CubeGesture.releasedQuarterTurns(angle, 0.0, commit, flick)
        let thrown = CubeGesture.releasedQuarterTurns(angle, velocity, commit, flick)
        // Where the throw carries the layer, at most half a quarter turn.
        let carried =
          angle +. Math.max(-.quarter /. 2.0, Math.min(quarter /. 2.0, velocity *. flick))
        (thrown == slow || Math.sign(thrown -. slow) == Math.sign(velocity)) &&
          Math.abs(carried /. quarter -. thrown) < 1.0
      }),
    60000,
  )
})

describe("the live magnet", () => {
  test(
    "stays within its reach of the finger and holds every quarter turn",
    () =>
      Fc.check(Fc.tuple2(num(-20.0, 20.0), Fc.integer({min: -8, max: 8})), ((raw, k)) =>
        Math.abs(TurnFeel.magneticDragAngle(raw) -. raw) <= TurnFeel.magnetReach &&
          near(TurnFeel.magneticDragAngle(Int.toFloat(k) *. quarter), Int.toFloat(k) *. quarter)
      ),
    60000,
  )

  test(
    "never runs backwards",
    () =>
      Fc.check(Fc.tuple2(num(-20.0, 20.0), num(0.0, 2.0)), ((raw, step)) =>
        TurnFeel.magneticDragAngle(raw +. step) >= TurnFeel.magneticDragAngle(raw) -. 1e-12
      ),
    60000,
  )
})

describe("swiping a sticker", () => {
  test(
    "turns the same layer the other way for the reverse swipe",
    () =>
      Fc.check(
        Fc.tuple4(num(0.0, 600.0), num(0.0, 400.0), num(-120.0, 120.0), num(-120.0, 120.0)),
        ((x, y, dx, dy)) =>
          switch CubeGesture.pickCubeSurface(x, y, camera)->Null.toOption {
          | None => true
          | Some(hit) =>
            switch (
              CubeGesture.pickSwipeLayer(hit, dx, dy, camera, 18.0)->Null.toOption,
              CubeGesture.pickSwipeLayer(hit, -.dx, -.dy, camera, 18.0)->Null.toOption,
            ) {
            | (None, None) => true
            | (Some(layer), Some(reverse)) =>
              layer == reverse &&
                near(
                  CubeGesture.swipeLayerAngle(hit, layer, -.dx, -.dy, camera),
                  -.CubeGesture.swipeLayerAngle(hit, layer, dx, dy, camera),
                )
            | _ => false
            }
          },
      ),
    60000,
  )
})

describe("two fingers", () => {
  test(
    "keep a tilt or pinch once decided, whatever they do next",
    () =>
      Fc.check(Fc.tuple4(num(0.0, 400.0), num(0.0, 400.0), num(0.0, 300.0), Fc.boolean()), ((
        start,
        spread,
        travel,
        pinch,
      )) => {
        let lock: CubeGesture.twoFingerLock = pinch ? Pinch : TiltLock
        CubeGesture.twoFingerLock(start, spread, travel, lock) == lock
      }),
    60000,
  )
})

describe("touchpad swipes", () => {
  let deltas = Fc.array(num(-40.0, 40.0), {minLength: 1, maxLength: 40})
  // A push, then the momentum macOS adds: each delta a steady fraction of
  // the one before, clear of the detector's float-sensitive limits.
  let pushAndMomentum =
    Fc.tuple4(deltas, num(5.0, 60.0), num(0.62, 0.97), Fc.integer({min: 0, max: 30}))->Fc.map(((
      push,
      start,
      ratio,
      count,
    )) =>
      push->Array.concat(
        Array.fromInitializer(~length=count, i => start *. Math.pow(ratio, ~exp=Int.toFloat(i))),
      )
    )

  test(
    "add up exactly until they coast, and then stop",
    () =>
      Fc.check(pushAndMomentum, list => {
        let swipe = ref(Null.null)
        let counted = ref(0.0)
        let ok = ref(true)
        list->Array.forEachWithIndex(
          (delta, i) => {
            let before = swipe.contents->Null.toOption
            let next = CubeGesture.nextWheelSwipe(
              swipe.contents,
              1000.0 +. 16.0 *. Int.toFloat(i),
              delta,
              0.0,
            )
            let coastingBefore = before->Option.mapOr(false, s => s.coasting)
            if !next.coasting {
              counted := counted.contents -. delta
            }
            if coastingBefore && next.dx != (before->Option.getUnsafe).dx {
              ok := false
            }
            swipe := Null.make(next)
          },
        )
        ok.contents && near((swipe.contents->Null.getUnsafe).dx, counted.contents)
      }),
    60000,
  )

  test(
    "coast within a few deltas of the momentum",
    () =>
      Fc.check(Fc.tuple3(num(5.0, 60.0), num(0.62, 0.97), Fc.integer({min: 5, max: 30})), ((
        start,
        ratio,
        count,
      )) => {
        let last =
          Array.fromInitializer(
            ~length=count,
            i => start *. Math.pow(ratio, ~exp=Int.toFloat(i)),
          )->Array.reduceWithIndex(
            Null.null,
            (swipe, delta, i) =>
              Null.make(CubeGesture.nextWheelSwipe(swipe, 16.0 *. Int.toFloat(i), delta, 0.0)),
          )
        (last->Null.getUnsafe).coasting
      }),
    60000,
  )

  test(
    "start again after a pause",
    () =>
      Fc.check(Fc.tuple2(deltas, num(150.1, 5000.0)), ((list, pause)) => {
        let last =
          list->Array.reduceWithIndex(
            Null.null,
            (swipe, delta, i) =>
              Null.make(CubeGesture.nextWheelSwipe(swipe, 16.0 *. Int.toFloat(i), delta, 0.0)),
          )
        let time = 16.0 *. Int.toFloat(Array.length(list) - 1) +. pause
        let fresh = CubeGesture.nextWheelSwipe(last, time, 5.0, 0.0)
        fresh.startTime == time && fresh.dx == -5.0 && !fresh.coasting
      }),
    60000,
  )
})

describe("zoom", () => {
  test(
    "always stays within the size's range",
    () =>
      Fc.check(Fc.tuple2(num(-100.0, 100.0), Fc.integer({min: 2, max: 7})), ((zoom, size)) => {
        let s = Int.toFloat(size)
        let clamped = CubeGesture.clampZoom(zoom, s)
        clamped >= 2.0 +. s &&
        clamped <= 8.0 +. s *. 3.0 &&
        CubeGesture.clampZoom(clamped, s) == clamped
      }),
    60000,
  )
})
