/* WCANotation.res - STUB
 * WCA notation parsing pending ReScript fixes
 */

open CubeIR

type moveFamily = Wide
type moveModifier = Normal
type parsedMove = {family: moveFamily, modifier: moveModifier, rawToken: string}
type parseError = InvalidDepth | UnknownFace

let parseMove = (_token: string): result<parsedMove, parseError> => {
  Error(InvalidDepth)
}

let tokenizeAlg = (s: string): array<string> => {
  Js.String2.split(s, " ")
}
