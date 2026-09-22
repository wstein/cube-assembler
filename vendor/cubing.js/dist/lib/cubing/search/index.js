import {
  experimentalSolve2x2x2,
  experimentalSolve3x3x3IgnoringCenters,
  setSearchDebug,
  solveMegaminx,
  solvePyraminx,
  solveSkewb,
  solveTwips
} from "../chunks/chunk-6N4GCSFO.js";
import {
  random333Pattern
} from "../chunks/chunk-XVZLWT3A.js";
import "../chunks/chunk-7GUL3OBQ.js";
import "../chunks/chunk-VYAO5FCM.js";
import "../chunks/chunk-WBMKMQAL.js";
import "../chunks/chunk-5ONX3JVC.js";
import "../chunks/chunk-N5FJ5YIA.js";

// src/cubing/search/index.ts
var experimentalSolveTwsearch = (...args) => {
  console.error(
    "`experimentalSolveTwsearch(\u2026)` is deprecated. Please call `experimentalSolveTwips(\u2026)` instead."
  );
  return solveTwips(...args);
};
export {
  experimentalSolve2x2x2,
  experimentalSolve3x3x3IgnoringCenters,
  solveTwips as experimentalSolveTwips,
  experimentalSolveTwsearch,
  random333Pattern,
  setSearchDebug,
  solveMegaminx,
  solvePyraminx,
  solveSkewb
};
//# sourceMappingURL=index.js.map
