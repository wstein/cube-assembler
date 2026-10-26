export {
  colorDelta,
  countDeviations,
  hueAxis,
  hueBarColor,
  hueCut as HUE_CUT,
  hueScatter,
  meansByLabel,
  neutralChroma as NEUTRAL_CHROMA,
  pointsInPolygon,
  selectionCounts,
} from '../../core/color/HueScatter.gen'
export type {
  point as HuePoint,
  sample as HueSample,
} from '../../core/color/HueScatter.gen'

import type { sample } from '../../core/color/HueScatter.gen'

// A sticker with where it is on the cube, for naming it in the chart.
export type LocatedSample = sample & { where?: string }
