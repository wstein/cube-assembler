import { useRef, useState } from 'preact/hooks'
import {
  countDeviations,
  HUE_CUT,
  hueBarColor,
  hueScatter,
  type LocatedSample,
  pointsInPolygon,
  selectionCounts,
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
const LENS_ZOOM_MIN = 3
const LENS_ZOOM_MAX = 8
// A wheel step of 100 units changes the magnification by this factor.
const LENS_ZOOM_STEP = 1.25
// Dots keep their on-screen size in the lens, so overlapping ones part.
const DOT_RADIUS = 3
// How near the pointer must be to a dot to point at it.
// The lens magnet reaches this far in lens pixels (so a smaller distance in
// the chart the more the lens magnifies) and nudges the lens by half a dot's
// diameter, the dot's radius, at most.
const MAGNET_LENS_PX = 8
// The brake: the lens point follows this share of the pointer's movement,
// and lags the pointer by this many chart units at most.
const BRAKE = 1 / 2
const BRAKE_REACH = 30
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
// clouds. Gray stickers (white) have no hue
// and stand in their own column.
export function HueScatterChart({
  samples,
  hovered,
  onHover,
  selected,
  onSelect,
}: {
  samples: LocatedSample[]
  // The sticker pointed at, here or in the net: a sample index.
  hovered: number | null
  onHover: (index: number | null) => void
  // The stickers inside the outline drawn by hand: sample indices.
  selected: number[]
  onSelect: (indices: number[]) => void
}) {
  // The outline being drawn, in chart units; null when none is.
  const [outline, setOutline] = useState<Array<{
    x: number
    y: number
  }> | null>(null)
  const drawing = useRef<Array<{ x: number; y: number }> | null>(null)
  const [zoom, setZoom] = useState(LENS_ZOOM_START)
  const [lens, setLens] = useState<{
    x: number
    y: number
    cx: number
    cy: number
  } | null>(null)
  const lastPointer = useRef<{ x: number; y: number } | null>(null)
  const brakeOffset = useRef({ x: 0, y: 0 })
  const grayLeft = LEFT + WIDTH + GAP
  const points = hueScatter(samples)
  const deviations = countDeviations(samples)
  // Lifting the button closes the outline and selects the dots inside it; a
  // click without drawing clears the selection.
  const finishOutline = () => {
    const path = drawing.current
    drawing.current = null
    setOutline(null)
    if (!path) return
    onSelect(
      path.length < 4
        ? []
        : pointsInPolygon(
            path,
            points.map((point) => ({ x: dotX(point), y: y(point.l) })),
          ),
    )
  }
  const counts = selectionCounts(samples, selected)
  const selectedSet = new Set(selected)
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
          const raw = at.matrixTransform(m.inverse())
          // While the button is down the pointer draws the outline.
          const path = drawing.current
          const tail = path?.[path.length - 1]
          if (
            path &&
            (!tail || Math.hypot(raw.x - tail.x, raw.y - tail.y) >= 1)
          ) {
            path.push({ x: raw.x, y: raw.y })
            setOutline([...path])
          }
          // The brake: the lens point moves only BRAKE of what the pointer
          // moves, so one pixel of hand is a fraction of a pixel in the
          // lens. It may trail the pointer by BRAKE_REACH at most, and
          // starts on the pointer when the lens opens.
          const last = lastPointer.current ?? raw
          const o = brakeOffset.current
          let ox = o.x + (raw.x - last.x) * (BRAKE - 1)
          let oy = o.y + (raw.y - last.y) * (BRAKE - 1)
          const trail = Math.hypot(ox, oy)
          if (trail > BRAKE_REACH) {
            ox *= BRAKE_REACH / trail
            oy *= BRAKE_REACH / trail
          }
          lastPointer.current = { x: raw.x, y: raw.y }
          brakeOffset.current = { x: ox, y: oy }
          // The point the lens shows and the dot is picked at.
          const p = { x: raw.x + ox, y: raw.y + oy }
          // The dot nearest the lens point is the one pointed at, however
          // many dots overlap there.
          const dist = (i: number) =>
            Math.hypot(dotX(points[i]) - p.x, y(points[i].l) - p.y)
          // What is picked is what the lens shows under its crosshair: the
          // nearest dot, if the crosshair is on it (a dot's radius as drawn
          // in the lens). The magnet reaches a little further than that.
          // Never finer than one screen pixel (1 / m.a chart units), which
          // is all a pointer can place.
          const hit = Math.max(DOT_RADIUS / zoom, 1 / m.a)
          const reach = MAGNET_LENS_PX / zoom
          let target: number | null = null
          let best = Math.max(hit, reach)
          points.forEach((_, i) => {
            if (dist(i) <= best) {
              best = dist(i)
              target = i
            }
          })
          // A micro magnet: within a few lens pixels of a dot the lens is
          // nudged toward it, by half a dot's diameter at most. The nudge
          // grows smoothly from nothing at the edge, and never passes the
          // dot, so the lens is drawn in, never locked.
          const shift =
            target === null || best >= reach || best === 0
              ? 0
              : Math.min(best, (DOT_RADIUS / zoom) * (1 - best / reach) ** 2)
          const pull = shift / (best || 1)
          const cx = target === null ? p.x : dotX(points[target])
          const cy = target === null ? p.y : y(points[target].l)
          setLens({
            x: raw.x,
            y: raw.y,
            cx: p.x + (cx - p.x) * pull,
            cy: p.y + (cy - p.y) * pull,
          })
          const picked = target !== null && best <= hit ? target : null
          if (picked !== hovered) onHover(picked)
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return
          const svg = e.currentTarget
          const m = svg.getScreenCTM()
          if (!m) return
          const at = svg.createSVGPoint()
          at.x = e.clientX
          at.y = e.clientY
          const start = at.matrixTransform(m.inverse())
          drawing.current = [{ x: start.x, y: start.y }]
        }}
        onMouseUp={finishOutline}
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
          finishOutline()
          lastPointer.current = null
          brakeOffset.current = { x: 0, y: 0 }
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
                  class={`hue-scatter-dot${hovered === i ? ' hue-scatter-hovered' : ''}${selectedSet.has(i) ? ' hue-scatter-selected' : ''}`}
                  cx={cx}
                  cy={y(point.l)}
                  r={3}
                  fill={css(samples[i].rgb)}
                />
              )
            })}
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
        {outline && (
          <path
            class="hue-scatter-lasso"
            pointer-events="none"
            d={`M${outline.map((p) => `${p.x} ${p.y}`).join('L')}Z`}
          />
        )}
        {lens && (
          <path
            class="hue-scatter-lens-cross hue-scatter-brake-mark"
            pointer-events="none"
            d={`M${lens.cx - 4} ${lens.cy}h8M${lens.cx} ${lens.cy - 4}v8`}
          />
        )}
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
                transform={`translate(${lensX(lens)} ${lensY(lens)}) scale(${zoom}) translate(${-lens.cx} ${-lens.cy})`}
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
      {deviations.length > 0 && (
        <p class="hue-scatter-counts">
          ⚠ Not {deviations[0].expected} stickers of each color:{' '}
          {deviations.map((d) => `${name(d.label)} ${d.count}`).join(', ')}.
        </p>
      )}
      <p class="hue-scatter-info" role="status">
        {hovered === null
          ? 'Point at a dot to see which sticker it is. Drag around dots to count them.'
          : info(hovered)}
      </p>
      {selected.length > 0 && (
        <p class="hue-scatter-selection">
          {selected.length} sticker{selected.length === 1 ? '' : 's'} selected:{' '}
          {counts
            .map(
              (c) =>
                `${name(c.label)} ${c.count}${c.expected ? ` of ${c.expected}` : ''}`,
            )
            .join(', ')}
          .
        </p>
      )}
    </>
  )
}
