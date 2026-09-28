// The 3D cube's touch and mouse math: which sticker a pointer is on, which
// layer a swipe turns and how far, and what a drag, pinch or wheel does.
type vec = (float, float, float)

type camera = {
  width: float,
  height: float,
  zoom: float,
  pitch: float,
  yaw: float,
  size: float,
}

type surfaceHit = {face: CubeState.faceKey, point: vec, normalAxis: int}

let get = ((x, y, z): vec, axis) =>
  switch axis {
  | 0 => x
  | 1 => y
  | _ => z
  }

let rotateX = ((x, y, z): vec, angle) => (
  x,
  y *. Math.cos(angle) -. z *. Math.sin(angle),
  y *. Math.sin(angle) +. z *. Math.cos(angle),
)

let rotateY = ((x, y, z): vec, angle) => (
  x *. Math.cos(angle) +. z *. Math.sin(angle),
  y,
  -.x *. Math.sin(angle) +. z *. Math.cos(angle),
)

let along = ((ox, oy, oz): vec, distance, (dx, dy, dz): vec) => (
  ox +. distance *. dx,
  oy +. distance *. dy,
  oz +. distance *. dz,
)

// The pointer's ray from the camera, in cube coordinates.
let pointerRay = (x, y, camera) => {
  let tangent = Math.tan(Math.Constants.pi /. 8.0)
  let ray = (
    (2.0 *. x /. camera.width -. 1.0) *. tangent *. (camera.width /. camera.height),
    (1.0 -. 2.0 *. y /. camera.height) *. tangent,
    -1.0,
  )
  let unrotate = v => rotateY(rotateX(v, -.camera.pitch), -.camera.yaw)
  (unrotate((0.0, 0.0, camera.zoom)), unrotate(ray))
}

let pickCubeSurface = (x, y, camera) =>
  if camera.width <= 0.0 || camera.height <= 0.0 {
    Null.null
  } else {
    let (origin, direction) = pointerRay(x, y, camera)
    let half = camera.size /. 2.0
    let closest = ref(Float.Constants.positiveInfinity)
    let hit = ref(Null.null)
    [
      (0, 1.0, CubeState.R),
      (0, -1.0, L),
      (1, 1.0, U),
      (1, -1.0, D),
      (2, 1.0, F),
      (2, -1.0, B),
    ]->Array.forEach(((axis, sign, face)) => {
      let d = get(direction, axis)
      if Math.abs(d) >= 1e-8 {
        let distance = (sign *. half -. get(origin, axis)) /. d
        if distance > 0.0 && distance < closest.contents {
          let point = along(origin, distance, direction)
          let (px, py, pz) = point
          let inside = value => Math.abs(value) <= half +. 1e-6
          if inside(px) && inside(py) && inside(pz) {
            closest := distance
            hit := Null.make({face, point, normalAxis: axis})
          }
        }
      }
    })
    hit.contents
  }

let project = (point, camera) => {
  let (x, y, z) = rotateX(rotateY(point, camera.yaw), camera.pitch)
  let focal = camera.height /. (2.0 *. Math.tan(Math.Constants.pi /. 8.0))
  (focal *. x /. (camera.zoom -. z), -.focal *. y /. (camera.zoom -. z))
}

// The point's motion when turning about `axis`, without its motion along
// the face's normal.
let tangentInPlane = (axis, (x, y, z): vec, normalAxis) => {
  let (tx, ty, tz) = switch axis {
  | 0 => (0.0, -.z, y)
  | 1 => (z, 0.0, -.x)
  | _ => (-.y, x, 0.0)
  }
  (normalAxis == 0 ? 0.0 : tx, normalAxis == 1 ? 0.0 : ty, normalAxis == 2 ? 0.0 : tz)
}

let inPlaneAxes = normalAxis => [0, 1, 2]->Array.filter(axis => axis != normalAxis)

// How far a swipe moved the touched point along the face for each of the
// two layers it can turn, in tenths of a radian. The layers rotate about the
// face's two in-plane axes; each moves the point across the other axis, and
// its motion into the face would only skew the projection.
let swipeAlong = (hit: surfaceHit, dx, dy, camera: camera) => {
  let axes = inPlaneAxes(hit.normalAxis)
  let (ax, ay) = project(hit.point, camera)
  let screen = axis => {
    let direction = tangentInPlane(axis, hit.point, hit.normalAxis)
    let (bx, by) = project(along(hit.point, 0.1, direction), camera)
    (bx -. ax, by -. ay)
  }
  // Express the swipe in those two on-screen directions.
  let (ux, uy) = screen(axes->Array.getUnsafe(0))
  let (vx, vy) = screen(axes->Array.getUnsafe(1))
  let det = ux *. vy -. uy *. vx
  Math.abs(det) < 1e-9
    ? None
    : Some((axes, [(dx *. vy -. dy *. vx) /. det, (ux *. dy -. uy *. dx) /. det]))
}

type swipeLayer = {
  face: CubeState.faceKey,
  depth: int,
  // Layers turning together, ending at `depth`; 1 when omitted.
  width?: int,
  axis: int,
  // Turns the rotation about +axis into the face's clockwise turns.
  sign: int,
}

// A swipe turns a layer once it has moved swipeStartPx (by default; the
// settings page can change it) and clearly along one of the face's axes.
let swipeStartPx = 18.0

let axisFaces = axis =>
  switch axis {
  | 0 => (CubeState.R, CubeState.L)
  | 1 => (U, D)
  | _ => (F, B)
  }

// The layer a coordinate along an axis falls in, 0 at the negative side.
let layerIndex = (coordinate, size) =>
  Math.max(0.0, Math.min(size -. 1.0, Math.round(coordinate +. (size -. 1.0) /. 2.0)))

let pickLayer = (hit: surfaceHit, dx, dy, camera: camera, startPx) =>
  if Math.hypot(dx, dy) < startPx {
    None
  } else {
    swipeAlong(hit, dx, dy, camera)->Option.flatMap(((axes, along)) => {
      let first = Math.abs(along->Array.getUnsafe(0))
      let second = Math.abs(along->Array.getUnsafe(1))

      // A diagonal swipe across the face is ambiguous.
      if Math.min(first, second) > 0.75 *. Math.max(first, second) {
        None
      } else {
        let axis = axes->Array.getUnsafe(first >= second ? 0 : 1)
        let coordinate = get(hit.point, axis)
        let positive = coordinate >= 0.0
        let (plus, minus) = axisFaces(axis)
        let index = layerIndex(coordinate, camera.size)
        let depth = positive ? camera.size -. index : index +. 1.0
        Some({
          face: positive ? plus : minus,
          depth: Float.toInt(depth),
          axis,
          sign: positive ? -1 : 1,
        })
      }
    })
  }

let pickSwipeLayer = (hit, dx, dy, camera, startPx) =>
  Null.fromOption(pickLayer(hit, dx, dy, camera, startPx))

// The picked layer's angle in its face's clockwise radians, so the touched
// sticker follows the finger. A turn about an in-plane axis moves the point
// along the face by half the cube width per radian, so a tenth of that
// distance is a tenth of a radian.
let swipeLayerAngle = (hit, layer: swipeLayer, dx, dy, camera) =>
  switch swipeAlong(hit, dx, dy, camera) {
  | None => 0.0
  | Some((axes, along)) =>
    Int.toFloat(layer.sign) *. 0.1 *. along->Array.getUnsafe(axes->Array.indexOf(layer.axis))
  }

// Holding a sticker widens its turn after 300 ms, then selects a whole-cube
// x/y/z turn after 800 ms. Moving first keeps the single-layer swipe.
let widePressMs = 300.0
let cubePressMs = 800.0
let pressSlopPx = 10.0

type pressLevel =
  | @as("layer") Layer
  | @as("wide") Wide
  | @as("cube") Cube

type pressKeys = {shiftKey: bool, altKey: bool}

let pressLevel = (heldMs, keys) =>
  if keys.altKey || heldMs >= cubePressMs {
    Cube
  } else if keys.shiftKey || heldMs >= widePressMs {
    Wide
  } else {
    Layer
  }

// Where the pointer is on the plane of the face `hit` is on, even beyond the
// face's edges, so picking layers can run off the cube.
let facePlanePoint = (x, y, camera: camera, hit: surfaceHit) =>
  if camera.width <= 0.0 || camera.height <= 0.0 {
    Null.null
  } else {
    let (origin, direction) = pointerRay(x, y, camera)
    let axis = hit.normalAxis
    let d = get(direction, axis)
    if Math.abs(d) < 1e-8 {
      Null.null
    } else {
      let distance = (get(hit.point, axis) -. get(origin, axis)) /. d
      distance <= 0.0 ? Null.null : Null.make(along(origin, distance, direction))
    }
  }

// The in-plane axis a clear swipe travels along: the layers it crosses are
// the ones it picks. The layer a swipe would turn rotates about the other.
let swipeMoveAxis = (hit: surfaceHit, dx, dy, camera, startPx) =>
  switch pickLayer(hit, dx, dy, camera, startPx) {
  | None => Null.null
  | Some(layer) =>
    Null.make(
      [0, 1, 2]
      ->Array.find(axis => axis != hit.normalAxis && axis != layer.axis)
      ->Option.getUnsafe,
    )
  }

// The layers between two indexes along an axis, named from the face the
// block reaches, else from the nearer face.
let blockLayer = (axis, from, to, size) => {
  let low = Math.Int.min(from, to)
  let high = Math.Int.max(from, to)
  let positive = high == size - 1 || (low != 0 && low + high >= size - 1)
  let (plus, minus) = axisFaces(axis)
  {
    face: positive ? plus : minus,
    depth: positive ? size - low : high + 1,
    width: high - low + 1,
    axis,
    sign: positive ? -1 : 1,
  }
}

// Every layer about an axis: an x, y or z rotation of the whole cube.
let wholeCubeLayer = (axis, size) => blockLayer(axis, 0, size - 1, size)

// A held sticker turns a standard wide move from the same named face.
// An outer slice widens to two layers; an inner slice includes all layers
// between the named face and the touched slice.
let standardWideLayer = (layer: swipeLayer, size) => {
  let width = size <= 2 ? 1 : Math.Int.min(size - 1, Math.Int.max(2, layer.depth))
  {...layer, depth: width, width}
}

// A released drag settles on whole quarter turns. Each further quarter
// counts once the drag passes turnCommitFraction of it, so a short slow
// drag springs back. A flick carries on for flickMs at its speed, but at
// most half a quarter, so it finishes one more turn and never spins on.
let turnCommitFraction = 0.35
let flickMs = 120.0

// The three can be changed on the settings page.
type swipeTuning = {startPx: float, commitFraction: float, flickMs: float}

let defaultSwipeTuning = {startPx: swipeStartPx, commitFraction: turnCommitFraction, flickMs}

let releasedQuarterTurns = (angle, velocity, commitFraction, flickMs) => {
  let quarter = Math.Constants.pi /. 2.0
  let flick = Math.max(-.quarter /. 2.0, Math.min(quarter /. 2.0, velocity *. flickMs))
  let quarters = (angle +. flick) /. quarter
  let turns = Math.floor(Math.abs(quarters) +. 1.0 -. commitFraction)
  turns == 0.0 ? 0.0 : Math.sign(quarters) *. turns
}

// What a drag does. Mouse and pen: a sticker swipe turns its layer and the
// background rotates the view. Touch: one finger turns layers or, after a
// hold, the cube; two fingers rotate or zoom the camera.
type cubeGesture =
  | @as("pending") Pending
  | @as("turn") Turn
  | @as("camera") Camera
  | @as("two-finger") TwoFinger
  | @as("none") NoGesture

let gestureForPointerDown = (pointerType, touches, hit: Nullable.t<surfaceHit>, current) => {
  let onSticker = Nullable.toOption(hit)->Option.isSome
  if pointerType != "touch" {
    onSticker ? Pending : Camera
  } else if touches == 1 {
    onSticker ? Pending : NoGesture
  } else if touches == 2 {
    TwoFinger
  } else {
    Nullable.toOption(current)->Option.getOr(NoGesture)
  }
}

let gestureWhenSwipeTurnsNothing = pointerType => pointerType == "touch" ? NoGesture : Camera

// Lifting one of two fingers must not start a layer turn with the
// other.
let gestureAfterPointerUp = (remaining, current: Nullable.t<cubeGesture>) =>
  if remaining == 0 {
    Null.null
  } else {
    switch Nullable.toOption(current) {
    | Some(TwoFinger) => Null.make(NoGesture)
    | Some(gesture) => Null.make(gesture)
    | None => Null.null
    }
  }

type screenPoint = (float, float)
type motion = {dx: float, dy: float, scale: float}

let twoFingerMotion = (before: (screenPoint, screenPoint), after: (screenPoint, screenPoint)) => {
  let mid = (((ax, ay), (bx, by))) => ((ax +. bx) /. 2.0, (ay +. by) /. 2.0)
  let spread = (((ax, ay), (bx, by))) => Math.hypot(ax -. bx, ay -. by)
  let (x0, y0) = mid(before)
  let (x1, y1) = mid(after)
  let s0 = spread(before)
  {dx: x1 -. x0, dy: y1 -. y0, scale: s0 > 0.0 ? spread(after) /. s0 : 1.0}
}

// Two fingers either tilt or pinch, decided once per gesture like map apps.
// Fingers drift apart a little while tilting, so a pinch needs its spread
// to change by at least pinchMinPx and pinchMinRatio, and by more than the
// midpoint moved. A tilt needs the midpoint to travel tiltMinPx and more
// than the spread changed; a pinch with one finger resting moves the
// midpoint only half as far, so it never counts as a tilt.
let pinchMinPx = 24.0
let pinchMinRatio = 0.15
let tiltMinPx = 16.0

type twoFingerLock =
  | @as("undecided") Undecided
  | @as("tilt") TiltLock
  | @as("pinch") Pinch

let twoFingerLock = (startSpread, spread, midpointTravel, lock) =>
  switch lock {
  | Undecided =>
    let spreadChange = Math.abs(spread -. startSpread)
    if (
      spreadChange >= Math.max(pinchMinPx, pinchMinRatio *. startSpread) &&
        spreadChange > midpointTravel
    ) {
      Pinch
    } else if midpointTravel >= tiltMinPx && midpointTravel > spreadChange {
      TiltLock
    } else {
      Undecided
    }
  | decided => decided
  }

let clampZoom = (zoom, size: float) => Math.max(2.0 +. size, Math.min(8.0 +. size *. 3.0, zoom))

type wheel = {deltaX: float, deltaY: float, deltaMode: int, ctrlKey: bool}

type wheelGesture =
  | @as("zoom") Zoom
  | @as("tilt") WheelTilt

// Touchpads send two-finger swipes as wheel events and pinches as wheel
// events with Ctrl held. A swipe tilts the cube like two fingers on a touch
// screen; a pinch or a mouse wheel zooms. Mouse wheels step in whole lines or
// in large whole-pixel notches without sideways movement.
let wheelGesture = (e: wheel) =>
  if e.ctrlKey || e.deltaMode != 0 {
    Zoom
  } else {
    let whole = Float.isFinite(e.deltaY) && Math.floor(e.deltaY) == e.deltaY
    e.deltaX == 0.0 && whole && Math.abs(e.deltaY) >= 50.0 ? Zoom : WheelTilt
  }
