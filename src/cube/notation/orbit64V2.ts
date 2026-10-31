// Orbit64 V2 state tokens for 2x2-15x15 cubes: typed entry point for the
// ReScript codec (Orbit64V2.res). It works on orbit coordinates, not
// facelets. The generated functions are used as they are.
// Format: FORMAT-V2.md of flix-orbit64@8dc17fb (Apache-2.0).
import { type entry, entries } from './Orbit64V2.gen'

export type {
  cube as Orbit64V2Cube,
  decoded as Orbit64V2Decoded,
  entry as Orbit64V2Entry,
  model as Orbit64V2Model,
  pose as Orbit64V2Pose,
} from './Orbit64V2.gen'
export {
  decodeOrbit64V2State,
  encodeOrbit64V2State,
  entryById as orbit64V2Entry,
  solved as orbit64V2Solved,
  stateCount as orbit64V2StateCount,
} from './Orbit64V2.gen'

// The registry is frozen; the type says so too.
export const orbit64V2Entries: readonly entry[] = entries
