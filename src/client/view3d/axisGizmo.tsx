// The 3D view's X/Y/Z gizmo (see src/core/view/AxisGizmo.res): arrows from
// the cube's center through R, U and F, colored by the virtual reference
// frame. It only shows the orientation; touches pass
// through to the canvas.
import {
  gizmoAxes,
  gizmoCamera,
  type colorFrame as ColorFrame,
} from '../../core/view/AxisGizmo.gen'

// The gizmo's drawing units; CSS scales it.
const UNITS = 96

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
  const back = 8,
    wide = 4.5
  return points([
    [tip[0] + ux * 2, tip[1] + uy * 2],
    [tip[0] - ux * back - uy * wide, tip[1] - uy * back + ux * wide],
    [tip[0] - ux * back + uy * wide, tip[1] - uy * back - ux * wide],
  ])
}

interface AxisGizmoProps {
  frame: ColorFrame
  pitch: number
  yaw: number
  palette: Record<string, string>
}

export function AxisGizmo({ frame, pitch, yaw, palette }: AxisGizmoProps) {
  const colors = {
    U: frame.u,
    R: frame.r,
    F: frame.f,
    D: frame.d,
    L: frame.l,
    B: frame.b,
  }
  return (
    <svg
      class="cube-3d-gizmo"
      viewBox={`0 0 ${UNITS} ${UNITS}`}
      role="img"
      aria-label="X, Y and Z axes of the cube, through its R, U and F faces"
    >
      {gizmoAxes(gizmoCamera(UNITS, UNITS, pitch, yaw)).map(
        ({ name, face, center, tip, label, front }) => (
          <g
            key={name}
            data-axis={name}
            class={`cube-3d-gizmo-axis${front ? '' : ' behind'}`}
            style={{ color: palette[colors[face]] ?? '#888' }}
          >
            <line
              x1={center[0]}
              y1={center[1]}
              x2={tip[0]}
              y2={tip[1]}
              class="cube-3d-gizmo-outline"
            />
            <line
              x1={center[0]}
              y1={center[1]}
              x2={tip[0]}
              y2={tip[1]}
              class="cube-3d-gizmo-shaft"
            />
            <polygon
              points={arrowhead(center, tip)}
              class="cube-3d-gizmo-tip"
            />
            <text x={label[0]} y={label[1]} class="cube-3d-gizmo-label">
              {name.toUpperCase()}
            </text>
          </g>
        ),
      )}
    </svg>
  )
}
