import { useState } from 'preact/hooks'
import { HUE_CUT, hueAxis, hueScatter, type LocatedSample } from './hueScatter'

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
const GRAY_WIDTH = 44
const GAP = 14
const LEFT = 30
const TOP = 22
const BOTTOM = 24
// Lightness shown: below this no sticker sits, above 1 nothing can.
const L_MIN = 0.3
const HUE_TICKS = [0, 60, 120, 180, 240, 300]
const L_TICKS = [0.4, 0.6, 0.8, 1]

const x = (hue: number) => LEFT + (hue / 360) * WIDTH
const y = (l: number) => TOP + ((1 - l) / (1 - L_MIN)) * HEIGHT

// A dot is drawn in the pure color of its hue at the sticker's own
// saturation, so a washed-out sticker looks washed out.
const hueColor = (axis: number, chroma: number) =>
  `oklch(0.7 ${Math.min(chroma, 0.2).toFixed(3)} ${(axis + HUE_CUT) % 360})`

// Each sticker as a dot by hue (across) and lightness (up). Red and orange
// share hues but orange is lighter, so they form two clouds. Each cloud is
// named with its sticker count; a ringed dot sits with another color's
// stickers than the one it ended up as. Gray stickers (white) have no hue
// and stand in their own column.
export function HueScatterChart({ samples }: { samples: LocatedSample[] }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const grayLeft = LEFT + WIDTH + GAP
  const points = hueScatter(samples)
  const counts: Record<string, number> = {}
  const sums: Record<string, { hue: number; l: number; n: number }> = {}
  for (const point of points) {
    counts[point.label] = (counts[point.label] ?? 0) + 1
    if (point.neutral) continue
    const sum = (sums[point.label] ??= { hue: 0, l: 0, n: 0 })
    sum.hue += point.hue
    sum.l += point.l
    sum.n++
  }
  let grays = 0
  const info = (i: number) => {
    const point = points[i]
    const where = samples[i].where ? `${samples[i].where}: ` : ''
    const kind = point.neutral ? 'gray' : `chroma ${point.chroma.toFixed(2)}`
    return `${where}${name(point.label)} (${kind}) - ${
      point.misplaced
        ? `sits with ${point.neutral ? 'the grays' : `the ${name(point.sitsWith)} stickers`}, not with its own color`
        : 'sits with its own color'
    }`
  }
  return (
    <>
      <svg
        class="hue-scatter"
        viewBox={`0 0 ${LEFT + WIDTH + GAP + GRAY_WIDTH} ${TOP + HEIGHT + BOTTOM}`}
        role="img"
        aria-label="Stickers by hue and lightness"
      >
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
            <text x={LEFT - 4} y={y(l) + 3} text-anchor="end">
              {l}
            </text>
          </g>
        ))}
        {HUE_TICKS.map((hue) => (
          <text
            key={hue}
            x={x(hueAxis(hue))}
            y={TOP + HEIGHT + 11}
            text-anchor="middle"
          >
            {hue}°
          </text>
        ))}
        {points.map((point, i) => {
          const cx = point.neutral
            ? grayLeft + 6 + ((grays++ * 7) % (GRAY_WIDTH - 12))
            : x(point.hue)
          return (
            <circle
              key={i}
              class={`hue-scatter-dot${point.misplaced ? ' hue-scatter-misplaced' : ''}`}
              cx={cx}
              cy={y(point.l)}
              r={point.misplaced ? 4 : 3}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              fill={
                point.neutral ? '#9a9a9f' : hueColor(point.hue, point.chroma)
              }
            >
              <title>{info(i)}</title>
            </circle>
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
            {label} {counts[label]}
          </text>
        ))}
        {counts.W && (
          <text
            class="hue-scatter-label"
            x={grayLeft + GRAY_WIDTH / 2}
            y={TOP + 8}
            text-anchor="middle"
          >
            W {counts.W}
          </text>
        )}
        <text x={LEFT + WIDTH / 2} y={TOP + HEIGHT + 22} text-anchor="middle">
          hue
        </text>
        <text x={4} y={TOP - 2}>
          lighter ↑
        </text>
        <text
          x={grayLeft + GRAY_WIDTH / 2}
          y={TOP + HEIGHT + 11}
          text-anchor="middle"
        >
          gray
        </text>
      </svg>
      <p class="hue-scatter-info" role="status">
        {hovered === null
          ? 'Point at a dot to see which sticker it is.'
          : info(hovered)}
      </p>
    </>
  )
}
