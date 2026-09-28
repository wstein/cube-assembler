// The mini cube in the 3D view's corner: the cube turned with the view,
// its faces colored as they are now, and an X/Y/Z triad through R, U and F
// (see src/core/view/MiniCube.res). Swiping a face turns the whole cube;
// the 3D view handles the pointer and draws the turn on the big cube.
import type { CubeState } from '../cube/cubeAssembly'
import {
  miniCamera,
  miniCubeAxes,
  miniCubeFaceColors,
  miniCubeFaces,
} from '../core/view/MiniCube.gen'

export { miniTurnScale as MINI_TURN_SCALE } from '../core/view/MiniCube.gen'

// The gizmo's drawing units; CSS scales it.
export const MINI_CUBE_UNITS = 96

// Where a pointer is on the gizmo, in its drawing units.
export function miniCubePoint(
  element: Element,
  event: { clientX: number; clientY: number },
): [number, number] {
  const rect = element.getBoundingClientRect()
  return [
    ((event.clientX - rect.left) * MINI_CUBE_UNITS) / (rect.width || 1),
    ((event.clientY - rect.top) * MINI_CUBE_UNITS) / (rect.height || 1),
  ]
}

export function miniCubeCamera(pitch: number, yaw: number) {
  return miniCamera(MINI_CUBE_UNITS, MINI_CUBE_UNITS, pitch, yaw)
}

interface MiniCubeGizmoProps {
  cube: CubeState
  puzzleSize: number
  pitch: number
  yaw: number
  palette: Record<string, string>
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
}

const points = (list: ReadonlyArray<readonly [number, number]>) =>
  list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')

// An arrowhead at `tip`, pointing away from `center`.
function arrowhead(
  center: readonly [number, number],
  tip: readonly [number, number],
) {
  const dx = tip[0] - center[0],
    dy = tip[1] - center[1]
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length,
    uy = dy / length
  const back = 7,
    wide = 4
  return points([
    [tip[0] + ux * 2, tip[1] + uy * 2],
    [tip[0] - ux * back - uy * wide, tip[1] - uy * back + ux * wide],
    [tip[0] - ux * back + uy * wide, tip[1] - uy * back - ux * wide],
  ])
}

export function MiniCubeGizmo({
  cube,
  puzzleSize,
  pitch,
  yaw,
  palette,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: MiniCubeGizmoProps) {
  const camera = miniCubeCamera(pitch, yaw)
  const colors = miniCubeFaceColors(cube, puzzleSize)
  const hex = (face: string) => palette[colors[face]] ?? '#888'
  return (
    <svg
      class="cube-3d-minicube"
      viewBox={`0 0 ${MINI_CUBE_UNITS} ${MINI_CUBE_UNITS}`}
      role="img"
      aria-label="Mini cube: swipe a face to turn the whole cube (x, y, z)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {miniCubeFaces(camera).map(({ face, points: corners }) => (
        <polygon
          key={face}
          data-face={face}
          points={points(corners)}
          fill={hex(face)}
          class="cube-3d-minicube-face"
        />
      ))}
      {miniCubeAxes(camera).map(({ name, face, center, tip, label, front }) => (
        <g
          key={name}
          class={`cube-3d-minicube-axis${front ? '' : ' behind'}`}
          style={{ color: hex(face) }}
        >
          <line
            x1={center[0]}
            y1={center[1]}
            x2={tip[0]}
            y2={tip[1]}
            class="cube-3d-minicube-outline"
          />
          <line
            x1={center[0]}
            y1={center[1]}
            x2={tip[0]}
            y2={tip[1]}
            class="cube-3d-minicube-shaft"
          />
          <polygon
            points={arrowhead(center, tip)}
            class="cube-3d-minicube-tip"
          />
          <text x={label[0]} y={label[1]} class="cube-3d-minicube-label">
            {name.toUpperCase()}
          </text>
        </g>
      ))}
    </svg>
  )
}
