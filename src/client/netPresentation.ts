// What the cube net needs beyond the colors: which stickers belong to one
// piece, and which captured photo each net face shows. Typed entry point
// for the ReScript net topology (src/cube/NetTopology.res).
import {
  faceSources as faceSourcesRes,
  pieceKey as pieceKeyRes,
  sourceIndex as sourceIndexRes,
  type faceSource,
} from '../cube/NetTopology.gen'

export type FaceSource = faceSource

// The same key for every sticker of one physical piece.
export function pieceKey(n: number, face: string, index: number): string {
  return pieceKeyRes(n, face, index)
}

// The photo sticker shown at `index` of a net face that is its photo turned
// `turns` quarter turns clockwise.
export function sourceIndex(n: number, turns: number, index: number): number {
  return sourceIndexRes(n, turns, index)
}

// For each net face, the captured photo (slot) and clockwise turns whose
// colors it shows exactly - each photo used once; null when none matches.
export function faceSources(
  netFaces: Record<string, string[][]>,
  captured: Record<string, string[][]>,
): Record<string, FaceSource | null> {
  return faceSourcesRes(netFaces, captured)
}
