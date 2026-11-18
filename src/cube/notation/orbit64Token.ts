// Orbit64 state tokens of the app (V2, color model, framed pose) for cubes of
// size 2..15: typed entry point for the ReScript module (Orbit64Token.res).
import {
  decodeState,
  encodeState,
  looksLikeToken,
} from './Orbit64Token.gen'

export function looksLikeOrbit64Token(input: string): boolean {
  return looksLikeToken(input)
}

export function encodeOrbit64Token(facelets: string): string | null {
  return encodeState(facelets)
}

export function decodeOrbit64Token(token: string): string | null {
  return decodeState(token)
}
