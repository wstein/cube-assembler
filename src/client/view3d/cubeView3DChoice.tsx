// Switch between the existing 3D view and the PuzlWerk viewer for the dialogs. The URL parameter
// `?viewer=puzlwerk` selects the new one; anything else keeps the existing view.
import { lazy } from 'preact/compat'
import type { CubeView3DProps } from './cubeView3D'
import { mainViewerKind } from './puzlwerkMainView'

const CubeView3D = lazy(() =>
  import('./cubeView3D').then((m) => ({ default: m.CubeView3D })),
)
const PuzlwerkCubeView = lazy(() =>
  import('./puzlwerkCubeView').then((m) => ({ default: m.PuzlwerkCubeView })),
)

export const puzlwerkViewerRequested = (search: string): boolean =>
  mainViewerKind(search) === 'puzlwerk'

type ChoiceProps = Pick<
  CubeView3DProps,
  'cube' | 'puzzleSize' | 'palette' | 'highlightedFace' | 'allowLayerMoves'
>

export function CubeView3DChoice(props: ChoiceProps) {
  if (puzlwerkViewerRequested(window.location.search))
    return (
      <PuzlwerkCubeView
        cube={props.cube}
        puzzleSize={props.puzzleSize}
        palette={props.palette}
        highlightedFace={props.highlightedFace}
      />
    )
  return <CubeView3D {...props} />
}
