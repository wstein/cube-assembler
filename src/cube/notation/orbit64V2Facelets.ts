// Orbit64 V2 facelet bridge for 2x2-15x15 cubes: typed entry point for the
// ReScript module (Orbit64V2Facelets.res). The color model only; a picture
// type is an error. The generated functions are used as they are.
// Format: FORMAT-V2.md of flix-orbit64@d701008 (Apache-2.0).
export type {
  decodedFacelets as Orbit64V2DecodedFacelets,
  slots as Orbit64V2Slots,
} from './Orbit64V2Facelets.gen'
export {
  decodeFacelets as decodeOrbit64V2Facelets,
  encodeFacelets as encodeOrbit64V2Facelets,
  frameFaces as orbit64V2FrameFaces,
  fromFacelets as orbit64V2FromFacelets,
  slotTables as orbit64V2Slots,
  toFacelets as orbit64V2ToFacelets,
} from './Orbit64V2Facelets.gen'
