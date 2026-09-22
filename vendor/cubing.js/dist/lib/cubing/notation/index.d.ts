import { M as LeafCount, c as PuzzleLoader, gt as Alg } from "../index-BXHm_6gm.js";

//#region src/cubing/notation/CountAnimatedLeaves.d.ts
declare const countAnimatedLeaves: (alg: Alg) => LeafCount;
//#endregion
//#region src/cubing/notation/commonMetrics.d.ts
declare enum CommonMetric {
  OuterBlockTurnMetric = "OBTM",
  RangeBlockTurnMetric = "RBTM",
  SingleSliceTurnMetric = "SSTM",
  OuterBlockQuantumTurnMetric = "OBQTM",
  RangeBlockQuantumTurnMetric = "RBQTM",
  SingleSliceQuantumTurnMetric = "SSQTM",
  ExecutionTurnMetric = "ETM"
}
declare enum CommonMetricAlias {
  QuantumTurnMetric = "OBQTM",
  HandTurnMetric = "OBTM",
  SliceTurnMetric = "RBTM"
}
//#endregion
//#region src/cubing/notation/CountMoves.d.ts
declare const countMoves: (alg: Alg) => number;
declare const countMovesETM: (alg: Alg) => number;
/**
 * Only implemented so far:
 *
 * - 3x3x3: OBTM, RBTM, ETM
 */
declare function countMetricMoves(puzzleLoader: PuzzleLoader, metric: CommonMetric, alg: Alg): number;
//#endregion
export { CommonMetric as ExperimentalCommonMetric, CommonMetricAlias as ExperimentalCommonMetricAlias, countAnimatedLeaves as experimentalCountAnimatedLeaves, countMetricMoves as experimentalCountMetricMoves, countMoves as experimentalCountMoves, countMovesETM as experimentalCountMovesETM };