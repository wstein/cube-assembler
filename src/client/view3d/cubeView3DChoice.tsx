// Switch between the existing 3D view and the PuzlWerk viewer. The URL parameter
// `?viewer=puzlwerk` selects the new one; anything else keeps the existing view.
// The viewer is a dynamic import: without the flag its chunk is never requested.
import { lazy } from 'preact/compat'
import type { CubeView3DProps } from './cubeView3D'
import { mainViewerKind, puzlwerkMainViewProps } from './puzlwerkMainView'

const CubeView3D = lazy(() =>
  import('./cubeView3D').then((m) => ({ default: m.CubeView3D })),
)
const PuzlwerkCubeView = lazy(() =>
  import('./puzlwerkCubeView').then((m) => ({ default: m.PuzlwerkCubeView })),
)

export const puzlwerkViewerRequested = (search: string): boolean =>
  new URLSearchParams(search).get('viewer') === 'puzlwerk'

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

// The main view of the app (view mode): with the flag a static PuzlWerk view of the
// current state (no turns, bars or hints yet), otherwise the existing interactive view.
export function MainCubeView(props: CubeView3DProps) {
  if (mainViewerKind(window.location.search) === 'puzlwerk')
    return (
      <PuzlwerkCubeView
        {...puzlwerkMainViewProps(props)}
        colorFrame={props.initialFrame}
      />
    )
  return <CubeView3D {...props} />
}
