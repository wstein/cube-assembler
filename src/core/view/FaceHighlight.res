open CubeState
@genType
type outline = {
  normal: (float, float, float),
  edgeStart: float,
  neighbors: array<faceKey>,
}
let axis = face =>
  switch face {
  | U => (0.0, 1.0, 0.0)
  | R => (1.0, 0.0, 0.0)
  | F => (0.0, 0.0, 1.0)
  | D => (0.0, -1.0, 0.0)
  | L => (-1.0, 0.0, 0.0)
  | B => (0.0, 0.0, -1.0)
  }
let faceHighlight = (face: Null.t<faceKey>, size): outline => {
  let edgeStart = Int.toFloat(size) /. 2.0 -. 0.18
  switch face->Null.toOption {
  | None => {normal: (0.0, 0.0, 0.0), edgeStart, neighbors: []}
  | Some(face) =>
    let (x, y, z) = axis(face)
    let neighbors = [U, R, F, D, L, B]->Array.filter(other => {
      let (a, b, c) = axis(other)
      x *. a +. y *. b +. z *. c == 0.0
    })
    {normal: (x, y, z), edgeStart, neighbors}
  }
}
