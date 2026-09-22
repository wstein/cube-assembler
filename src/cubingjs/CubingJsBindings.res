/* CubingJsBindings.res
 * External ReScript bindings to cubing.js (wstein/cubing.js fork).
 *
 * These are thin @module bindings exposing the cubing.js API surface
 * we need for: puzzle definitions, KPattern/KTransformation, and Alg.
 *
 * All bindings assume `cubing` is installed as an npm dependency.
 */

/* ─── Alg Module ──────────────────────────────────────────────────────────── */

/** Opaque type for a cubing.js Alg object. */
type alg

/** Opaque type for a Move node within an Alg. */
type move

@module("cubing/alg") @new
external algFromString: string => alg = "Alg"

@send external algToString: alg => string = "toString"

@send external algInvert: alg => alg = "invert"

@send external algNodes: alg => array<move> = "childAlgNodes"

/* ─── KPuzzle Definition Types ────────────────────────────────────────────── */

/** Raw JSON type for KPattern orbit data.
    Shape: { pieces: number[], orientation: number[], orientationMod?: number[] } */
type kPatternOrbitData = {
  pieces: array<int>,
  orientation: array<int>,
}

/** KPatternData is a string-keyed record of orbit data.
    Orbit names vary by puzzle: "CORNERS", "EDGES", "WINGS", "CENTERS", etc. */
type kPatternData = Js.Dict.t<kPatternOrbitData>

/** Opaque type for the cubing.js KPattern class. */
type kPattern

/** Opaque type for the cubing.js KTransformation class. */
type kTransformation

/** Opaque type for the cubing.js KPuzzle class. */
type kPuzzle

/* ─── KPuzzle Methods ─────────────────────────────────────────────────────── */

@send external kpuzzleName: kPuzzle => string = "name"
@send external kpuzzleDefaultPattern: kPuzzle => kPattern = "defaultPattern"
@send external kpuzzleAlgToTransformation: (kPuzzle, alg) => kTransformation = "algToTransformation"
@send external kpuzzleDefinition: kPuzzle => {..} = "definition"

/* ─── KPattern Methods ────────────────────────────────────────────────────── */

@get external kpatternData: kPattern => kPatternData = "patternData"

@send external kpatternApplyTransformation: (kPattern, kTransformation) => kPattern = "applyTransformation"

@send external kpatternIsIdentical: (kPattern, kPattern) => bool = "isIdentical"

@send external kpatternToJSON: kPattern => {..} = "toJSON"

/** Construct a KPattern from a KPuzzle and raw pattern data. */
@module("cubing/kpuzzle") @new
external makeKPattern: (kPuzzle, kPatternData) => kPattern = "KPattern"

/* ─── KTransformation Methods ─────────────────────────────────────────────── */

@send external ktransformationInvert: kTransformation => kTransformation = "invert"
@send external ktransformationCompose: (kTransformation, kTransformation) => kTransformation = "compose"

/* ─── Puzzle Loaders ──────────────────────────────────────────────────────── */

/** Each puzzle loader is a function returning a Promise<KPuzzle>.
    cubing.js uses lazy loading for puzzle definitions. */
type puzzleLoader = unit => promise<kPuzzle>

@module("cubing/puzzles") external cube2x2x2Loader: puzzleLoader = "cube2x2x2"
@module("cubing/puzzles") external cube3x3x3Loader: puzzleLoader = "cube3x3x3"
@module("cubing/puzzles") external cube4x4x4Loader: puzzleLoader = "cube4x4x4"
@module("cubing/puzzles") external cube5x5x5Loader: puzzleLoader = "cube5x5x5"

/** 6x6 and 7x7 are loaded via PG (puzzle geometry) in cubing.js. */
@module("cubing/puzzles") external cube6x6x6Loader: puzzleLoader = "cube6x6x6"
@module("cubing/puzzles") external cube7x7x7Loader: puzzleLoader = "cube7x7x7"

/* ─── Puzzle Loader by Size ───────────────────────────────────────────────── */

open CubeIR

let loaderForSize = (size: puzzleSize): puzzleLoader =>
  switch size {
  | TwoByTwo => cube2x2x2Loader
  | ThreeByThree => cube3x3x3Loader
  | FourByFour => cube4x4x4Loader
  | FiveByFive => cube5x5x5Loader
  | SixBySix => cube6x6x6Loader
  | SevenBySeven => cube7x7x7Loader
  }

/** Load the KPuzzle for a given puzzle size. */
let loadKPuzzle = async (size: puzzleSize): kPuzzle => {
  let loader = loaderForSize(size)
  await loader()
}

/* ─── Orbit Name Constants ────────────────────────────────────────────────── */

/** Standard cubing.js orbit names per puzzle size.
    These match the keys used in KPatternData JSON. */
let orbitNames = (size: puzzleSize): array<string> =>
  switch size {
  | TwoByTwo => ["CORNERS"]
  | ThreeByThree => ["CORNERS", "EDGES", "CENTERS"]
  | FourByFour => ["CORNERS", "WINGS", "X_CENTERS"]
  | FiveByFive => ["CORNERS", "WINGS", "X_CENTERS", "T_CENTERS"]
  | SixBySix => ["CORNERS", "WINGS", "X_CENTERS", "T_CENTERS", "OBLIQUE_CENTERS"]
  | SevenBySeven => ["CORNERS", "WINGS", "X_CENTERS", "T_CENTERS", "OBLIQUE_CENTERS"]
  }
