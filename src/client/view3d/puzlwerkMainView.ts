// Pure choices of the main 3D view on the PuzlWerk viewer (flag `?viewer=puzlwerk`).
// No viewer import here: this module loads with the default view, the viewer stays in its own chunk.
import type { colorFrame as ColorFrame } from '../../core/view/AxisGizmo.gen'
import type { CubeState } from '../../cube/cubeAssembly'
import type { CubeTurn } from './cubeView3DState'

export type MainViewerKind = 'classic' | 'puzlwerk'

export const mainViewerKind = (search: string): MainViewerKind =>
  new URLSearchParams(search).get('viewer') === 'puzlwerk'
    ? 'puzlwerk'
    : 'classic'

export interface MainViewSource {
  // The source state: what Reset returns to.
  cube: CubeState
  // The state the app is in: shown at first, with the moves that led there.
  initialCube?: CubeState
  initialMoves?: CubeTurn[]
  puzzleSize: number
  palette?: Record<string, string>
}

// The view starts at the state the app is in (`initialCube`, else `cube`) and resets to `cube`.
export const puzlwerkMainViewProps = (source: MainViewSource) => ({
  cube: source.cube,
  initialCube: source.initialCube ?? source.cube,
  initialMoves: source.initialMoves ?? [],
  puzzleSize: source.puzzleSize,
  palette: source.palette,
})

// Hex colors of the U, R, F, D, L, B faces of a color frame, the order of `indicatorColorsFromFrame`.
export const frameHexes = (
  frame: ColorFrame | undefined,
  palette: Record<string, string>,
): string[] | undefined => {
  if (!frame) return undefined
  const hexes = [frame.u, frame.r, frame.f, frame.d, frame.l, frame.b].map(
    (name) => palette[name],
  )
  return hexes.every((hex) => typeof hex === 'string') ? hexes : undefined
}
