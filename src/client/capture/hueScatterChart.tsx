import { useState } from 'preact/hooks'
import {
  HUE_CUT,
  hueBarColor,
  hueScatter,
  type LocatedSample,
} from './hueScatter'

const NAME: Record<string, string> = {
  W: 'white',
  Y: 'yellow',
  O: 'orange',
  R: 'red',
  G: 'green',
  B: 'blue',
}
const name = (label: string) => NAME[label] ?? label

const WIDTH = 360
const HEIGHT = 150
const GRAY_WIDTH = 100
const GAP = 14
const LEFT = 38
const TOP = 22
const BOTTOM = 58
// Room right of the gray panel, so its last tick label is not cut off.
const RIGHT = 14
// Lightness shown: below this no sticker sits, above 1 nothing can.
const L_MIN = 0.3
// Both panels are cut at HUE_CUT, so both edges are the same hue tick. The
// axis runs 0 to 360 degrees past the cut; the main panel ticks every 30
// degrees, the small gray one every 90.
const HUE_TICKS = Array.from({ length: 13 }, (_, i) => i * 30)
const GRAY_TICKS = [0, 90, 180, 270, 360]
// Hue tick labels are turned by this many degrees so they never touch.
const TICK_ANGLE = 45
// The turned labels end a little right of their tick, so each ends under it.
const TICK_SHIFT = 7
// The lens: radius and magnification, in chart units.
const LENS_R = 62
// The lens magnification starts here and follows the wheel or a pinch.
const LENS_ZOOM_START = 5
const LENS_ZOOM_MIN = 4
const LENS_ZOOM_MAX = 10
// A wheel step of 100 units changes the magnification by this factor.
const LENS_ZOOM_STEP = 1.25
// Dots keep their on-screen size in the lens, so overlapping ones part.
const DOT_RADIUS = 3
// How near the pointer must be to a dot to point at it.
const HIT_RADIUS = 8
// Thickness of the color bars along the axes.
const BAR = 5
const BAR_GAP = 2
// The bar shows each hue at its most saturated, at a middle lightness.
const bar = (hue: number) => {
  const c = hueBarColor(hue, 0.65)
  return `rgb(${c.r} ${c.g} ${c.b})`
}
// Gray at OKLCH lightness l: the sRGB value is the cube of l, gamma encoded.
const grayBar = (l: number) => {
  const linear = l ** 3
  const v = Math.round(
    255 *
      (linear <= 0.0031308
        ? linear * 12.92
        : 1.055 * linear ** (1 / 2.4) - 0.055),
  )
  return `rgb(${v} ${v} ${v})`
}
// The hue bar: each stop is the true hue at its axis position.
const HUE_STOPS = Array.from({ length: 25 }, (_, i) => ({
  offset: i / 24,
  color: bar((i * 15 + HUE_CUT) % 360),
}))
// The lightness bar, gray from L 1 at the top down to L_MIN.
const L_STOPS = Array.from({ length: 8 }, (_, i) => ({
  offset: i / 7,
  color: grayBar(1 - ((1 - L_MIN) * i) / 7),
}))
// Lightness from 1 down to L_MIN in steps of 0.1.
const L_TICKS = Array.from({ length: 8 }, (_, i) => 1 - i / 10)
const trueHue = (axisHue: number) => (axisHue + HUE_CUT) % 360

// The lens always sits up and to the right of the pointer, so it is where
// the eye expects it; the chart lets it reach past its own edges.
const CHART_WIDTH = LEFT + WIDTH + GAP + GRAY_WIDTH + RIGHT
const CHART_HEIGHT = TOP + HEIGHT + BOTTOM
const LENS_OFFSET = LENS_R + 12
const lensX = (p: { x: number }) => p.x + LENS_OFFSET
const lensY = (p: { y: number }) => p.y - LENS_OFFSET

// Positions take the hue on the cut axis, 0 to 360.
const x = (axis: number) => LEFT + (axis / 360) * WIDTH
const grayX = (axis: number) => LEFT + WIDTH + GAP + (axis / 360) * GRAY_WIDTH
const dotX = (point: { neutral: boolean; hue: number }) =>
  point.neutral ? grayX(point.hue) : x(point.hue)
// A sticker darker than the lowest tick stays at the panel's floor.
const y = (l: number) => TOP + Math.min(1, (1 - l) / (1 - L_MIN)) * HEIGHT

// A dot is drawn in the sticker's own measured color, so its lightness,
// chroma and hue are what the picture shows.
const css = (c: { r: number; g: number; b: number }) =>
  `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)})`

// Each sticker as a dot by hue (across) and lightness (up), in its own
// color. Red and orange share hues but orange is lighter, so they form two
// clouds. Each cloud is named with its sticker count. Gray stickers (white) have no hue
// and stand in their own column.
export function HueScatterChart({
  samples,
  hovered,
  onHover,
}: {
  samples: LocatedSample[]
  // The sticker pointed at, here or in the net: a sample index.
  hovered: number | null
  onHover: (index: number | null) => void
}) {
  const [zoom, setZoom] = useState(LENS_ZOOM_START)
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null)
  const grayLeft = LEFT + WIDTH + GAP
  const points = hueScatter(samples)
  const sums: Record<string, { hue: number; l: number; n: number }> = {}
  for (const point of points) {
    if (point.neutral) continue
    const sum = (sums[point.label] ??= { hue: 0, l: 0, n: 0 })
    sum.hue += point.hue
    sum.l += point.l
    sum.n++
  }
  const info = (i: number) => {
    const point = points[i]
    const where = samples[i].where ? `${samples[i].where}: ` : ''
    const hue = Math.round(trueHue(point.hue)) % 360
    const kind = `L ${point.l.toFixed(2)}, C ${point.chroma.toFixed(2)}, h ${hue}°`
    return `${where}${name(point.label)} (${kind})`
  }
  return (
    <>
      <svg
        class="hue-scatter"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label="Stickers by hue and lightness"
        onMouseMove={(e) => {
          const svg = e.currentTarget
          const m = svg.getScreenCTM()
          if (!m) return
          const at = svg.createSVGPoint()
          at.x = e.clientX
          at.y = e.clientY
          const p = at.matrixTransform(m.inverse())
          setLens({ x: p.x, y: p.y })
          // The dot nearest the pointer is the one pointed at, however
          // many dots overlap there.
          let nearest: number | null = null
          let best = HIT_RADIUS ** 2
          points.forEach((point, i) => {
            const d = (dotX(point) - p.x) ** 2 + (y(point.l) - p.y) ** 2
            if (d <= best) {
              best = d
              nearest = i
            }
          })
          if (nearest !== hovered) onHover(nearest)
        }}
        onWheel={(e) => {
          // The wheel (or a pinch, which arrives as a wheel with ctrl) sets
          // the magnification while the lens is open.
          e.preventDefault()
          setZoom((z) =>
            Math.min(
              LENS_ZOOM_MAX,
              Math.max(LENS_ZOOM_MIN, z * LENS_ZOOM_STEP ** (-e.deltaY / 100)),
            ),
          )
        }}
        onMouseLeave={() => {
          setLens(null)
          onHover(null)
        }}
      >
        <g id="hue-scatter-plot">
          <rect
            class="hue-scatter-gray"
            x={grayLeft}
            y={TOP}
            width={GRAY_WIDTH}
            height={HEIGHT}
          />
          {L_TICKS.map((l) => (
            <g key={l}>
              <line
                class="hue-scatter-grid"
                x1={LEFT}
                x2={LEFT + WIDTH}
                y1={y(l)}
                y2={y(l)}
              />
              <line
                class="hue-scatter-grid"
                x1={grayLeft}
                x2={grayLeft + GRAY_WIDTH}
                y1={y(l)}
                y2={y(l)}
              />
              <text
                class="hue-scatter-l-tick"
                x={LEFT - BAR - BAR_GAP - 3}
                y={y(l) + 3}
                text-anchor="end"
              >
                {Number(l.toFixed(1))}
              </text>
            </g>
          ))}
          <defs>
            <linearGradient
              id="hue-scatter-hue-bar"
              x1="0"
              x2="1"
              y1="0"
              y2="0"
            >
              {HUE_STOPS.map((stop) => (
                <stop
                  key={stop.offset}
                  offset={stop.offset}
                  stop-color={stop.color}
                />
              ))}
            </linearGradient>
            <linearGradient id="hue-scatter-l-bar" x1="0" x2="0" y1="0" y2="1">
              {L_STOPS.map((stop) => (
                <stop
                  key={stop.offset}
                  offset={stop.offset}
                  stop-color={stop.color}
                />
              ))}
            </linearGradient>
          </defs>
          <rect
            class="hue-scatter-bar hue-scatter-l-bar"
            x={LEFT - BAR - BAR_GAP}
            y={TOP}
            width={BAR}
            height={HEIGHT}
            fill="url(#hue-scatter-l-bar)"
          />
          {[
            { position: x, ticks: HUE_TICKS, left: LEFT, width: WIDTH },
            {
              position: grayX,
              ticks: GRAY_TICKS,
              left: grayLeft,
              width: GRAY_WIDTH,
            },
          ].map(({ position, ticks, left, width }, panel) => (
            <g key={panel}>
              <rect
                class="hue-scatter-bar hue-scatter-hue-bar"
                x={left}
                y={TOP + HEIGHT + BAR_GAP}
                width={width}
                height={BAR}
                fill="url(#hue-scatter-hue-bar)"
              />
              {ticks.map((axis) => {
                const hue = (axis + HUE_CUT) % 360
                return (
                  <g key={axis}>
                    <line
                      class="hue-scatter-hue-grid"
                      x1={position(axis)}
                      x2={position(axis)}
                      y1={TOP}
                      y2={TOP + HEIGHT + BAR_GAP + BAR}
                    />
                    <text
                      class={`hue-scatter-hue-tick${panel === 0 && axis % 60 !== 0 ? ' hue-scatter-tick-minor' : ''}`}
                      x={position(axis) + TICK_SHIFT}
                      y={TOP + HEIGHT + BAR_GAP + BAR + 10}
                      text-anchor="end"
                      transform={`rotate(${-TICK_ANGLE} ${position(axis) + TICK_SHIFT} ${TOP + HEIGHT + BAR_GAP + BAR + 10})`}
                    >
                      {`${hue}°`}
                    </text>
                  </g>
                )
              })}
            </g>
          ))}
          {[...points.keys()]
            .sort((a, b) => Number(a === hovered) - Number(b === hovered))
            .map((i) => {
              const point = points[i]
              const cx = dotX(point)
              return (
                <circle
                  key={i}
                  class={`hue-scatter-dot${hovered === i ? ' hue-scatter-hovered' : ''}`}
                  cx={cx}
                  cy={y(point.l)}
                  r={3}
                  fill={css(samples[i].rgb)}
                />
              )
            })}
          {Object.entries(sums).map(([label, sum]) => (
            <text
              key={label}
              class="hue-scatter-label"
              x={x(sum.hue / sum.n)}
              y={y(sum.l / sum.n) - 22}
              text-anchor="middle"
            >
              {label}
            </text>
          ))}
          {points.some((point) => point.label === 'W') && (
            <text
              class="hue-scatter-label"
              x={grayLeft + GRAY_WIDTH / 2}
              y={TOP + 8}
              text-anchor="middle"
            >
              W
            </text>
          )}
          <text x={LEFT + WIDTH / 2} y={TOP + HEIGHT + 54} text-anchor="middle">
            hue
          </text>
          <text x={4} y={TOP - 10}>
            lighter ↑
          </text>
          <text
            x={grayLeft + GRAY_WIDTH / 2}
            y={TOP + HEIGHT + 54}
            text-anchor="middle"
          >
            gray
          </text>
        </g>
        {lens && (
          <g class="hue-scatter-lens" pointer-events="none">
            <clipPath id="hue-scatter-lens-clip">
              <circle cx={lensX(lens)} cy={lensY(lens)} r={LENS_R} />
            </clipPath>
            <circle
              class="hue-scatter-lens-glass"
              cx={lensX(lens)}
              cy={lensY(lens)}
              r={LENS_R}
            />
            <g clip-path="url(#hue-scatter-lens-clip)">
              <g
                transform={`translate(${lensX(lens)} ${lensY(lens)}) scale(${zoom}) translate(${-lens.x} ${-lens.y})`}
              >
                <use
                  href="#hue-scatter-plot"
                  style={`--hue-dot-r: ${DOT_RADIUS / zoom}px; --hue-text-display: none`}
                />
              </g>
            </g>
            <circle
              class="hue-scatter-lens-ring"
              cx={lensX(lens)}
              cy={lensY(lens)}
              r={LENS_R}
            />
            <path
              class="hue-scatter-lens-cross"
              d={`M${lensX(lens) - 5} ${lensY(lens)}h10M${lensX(lens)} ${lensY(lens) - 5}v10`}
            />
          </g>
        )}
      </svg>
      <p class="hue-scatter-info" role="status">
        {hovered === null
          ? 'Point at a dot to see which sticker it is.'
          : info(hovered)}
      </p>
    </>
  )
}
