import { R as KPattern, gt as Alg, z as KPuzzle } from "./index-BXHm_6gm.js";
//#region src/cubing/search/inside/solve/puzzles/3x3x3/index.d.ts
declare function random333Pattern(): Promise<KPattern>;
//#endregion
//#region src/cubing/search/inside/api.d.ts
declare enum PrefetchLevel {
  Auto = "auto",
  None = "none",
  Immediate = "immediate"
}
//#endregion
//#region src/cubing/search/outside.d.ts
declare function randomScrambleForEvent(eventID: string): Promise<Alg>;
declare function deriveScrambleForEvent(derivationSeedHex: string, derivationSaltHierarchy: string[], eventID: string): Promise<Alg>;
declare function experimentalSolve3x3x3IgnoringCenters(pattern: KPattern): Promise<Alg>;
declare function experimentalSolve2x2x2(pattern: KPattern): Promise<Alg>;
declare function solveSkewb(pattern: KPattern): Promise<Alg>;
declare function solvePyraminx(pattern: KPattern): Promise<Alg>;
declare function solveMegaminx(pattern: KPattern): Promise<Alg>;
interface SolveTwipsOptions {
  generatorMoves?: string[];
  targetPattern?: KPattern;
  minDepth?: number;
  maxDepth?: number;
}
declare function solveTwips(kpuzzle: KPuzzle, pattern: KPattern, options?: SolveTwipsOptions): Promise<Alg>;
interface SearchOutsideDebugGlobals {
  logPerf: boolean;
  scramblePrefetchLevel: `${PrefetchLevel}`;
  forceNewWorkerForEveryScramble: boolean;
  showWorkerInstantiationWarnings: boolean;
  forceTwipsForScrambles: boolean;
  allowLegacyPatternsForWorkerInstantiation: boolean;
  prioritizeEsbuildWorkaroundForWorkerInstantiation: boolean;
  allowDerivedScrambles: boolean;
}
declare function setSearchDebug(options: Partial<SearchOutsideDebugGlobals>): void;
//#endregion
export { setSearchDebug as a, solveSkewb as c, randomScrambleForEvent as i, solveTwips as l, experimentalSolve2x2x2 as n, solveMegaminx as o, experimentalSolve3x3x3IgnoringCenters as r, solvePyraminx as s, deriveScrambleForEvent as t, random333Pattern as u };