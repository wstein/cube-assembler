// Display orientation of the PuzlWerk viewer as a unit quaternion [x, y, z, w]: the XYZ Euler rotation
// (pitch about x, then yaw about y) of the existing isometric view, written out so the app needs no direct
// dependency on three.
export function eulerPitchYaw(pitch: number, yaw: number): [number, number, number, number] {
  const c1 = Math.cos(pitch / 2)
  const s1 = Math.sin(pitch / 2)
  const c2 = Math.cos(yaw / 2)
  const s2 = Math.sin(yaw / 2)
  return [s1 * c2, c1 * s2, s1 * s2, c1 * c2]
}
