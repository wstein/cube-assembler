// Pure choices of the main 3D view on the PuzlWerk viewer (flag `?viewer=puzlwerk`).
// No viewer import here: this module loads with the default view, the viewer stays in its own chunk.
import type { colorFrame as ColorFrame } from '../../core/view/AxisGizmo.gen'
import type { CubeState } from '../../cube/cubeAssembly'

export type MainViewerKind = 'classic' | 'puzlwerk'

export const mainViewerKind = (search: string): MainViewerKind =>
  new URLSearchParams(search).get('viewer') === 'puzlwerk'
    ? 'puzlwerk'
    : 'classic'

export interface MainViewSource {
  cube: CubeState
  initialCube?: CubeState
  puzzleSize: number
  palette?: Record<string, string>
}

// The static view shows the state the app is in (`initialCube`, else `cube`); turns are not played yet.
export const puzlwerkMainViewProps = (source: MainViewSource) => ({
  cube: source.initialCube ?? source.cube,
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
