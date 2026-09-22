/* IRBridge.res - STUB
 * Full cubing.js integration pending ReScript array access fixes
 */

open CubeIR

type kPatternData = Js.Dict.t<int>

let irToKPatternData = (_cube: cubeIR): kPatternData => {
  Js.Dict.empty()
}

let kPatternDataToIR = (_data: kPatternData, _size: puzzleSize): result<cubeIR, string> => {
  Error("Not implemented")
}

let applyWCAMove = (_cube: cubeIR, _move: string): result<cubeIR, string> => {
  Error("Not implemented")
}
