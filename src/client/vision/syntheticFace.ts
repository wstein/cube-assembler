// Synthetic face photos from a color grid (see
// src/core/vision/SyntheticFace.res).
import {
  renderFace as renderFaceRes,
  type options,
} from '../../core/vision/SyntheticFace.gen'

export { presets as PRESETS } from '../../core/vision/SyntheticFace.gen'
export type { options as SyntheticOptions }

// The photo of one face; `options` is optional (see SyntheticOptions).
export function renderFace(
  grid: string[][],
  preset: string,
  seed: number,
  size: number,
  options: options = {},
) {
  return renderFaceRes(grid, preset, seed, size, options)
}
