// Orbit64 state tokens for 2x2-7x7 cubes: typed entry point for the
// ReScript codec (Orbit64.res). Format and slot convention:
// flix-orbit64@00c0a97 (Apache-2.0).
import {
  decodeOrbit64State as decodeOrbit64StateRes,
  encodeOrbit64State as encodeOrbit64StateRes,
  looksLikeOrbit64StateToken as looksLikeOrbit64StateTokenRes,
} from './Orbit64.gen'

export function looksLikeOrbit64StateToken(input: string): boolean {
  return looksLikeOrbit64StateTokenRes(input)
}

export function encodeOrbit64State(facelets: string): string | null {
  return encodeOrbit64StateRes(facelets)
}

export function decodeOrbit64State(token: string): string | null {
  return decodeOrbit64StateRes(token)
}
