import { hueHistogram, type HueSample } from './hueHistogram'
import { rgbToOKLCH } from '../vision/colorMath'
import { STICKER_COLORS } from '../vision/stickerColorGeometry'

const BINS = 60
const WIDTH = 360
const HEIGHT = 70
const NEUTRAL_WIDTH = 24
const GAP = 8
// Stacking order, so a color keeps its place in every bar.
const LABELS = ['R', 'O', 'Y', 'G', 'B', 'W']

// Where the stickers sit around the hue circle after the white balance,
// each in the color it ended up with once the corrections were made. The
// strokes mark where the standard palette expects each color: a peak that
// stands off its stroke, or a bar with two colors in it, is a sticker pair
// that gets mixed up.
export function HueHistogramChart({
  samples,
  stickerColors,
}: {
  samples: HueSample[]
  stickerColors: Record<string, string>
}) {
  const { bins, neutral } = hueHistogram(samples, BINS)
  const total = (counts: Record<string, number>) =>
    Object.values(counts).reduce((sum, n) => sum + n, 0)
  const tallest = Math.max(1, ...bins.map(total), total(neutral))
  const barWidth = WIDTH / BINS
  const stack = (counts: Record<string, number>, x: number, width: number) => {
    let y = HEIGHT
    return LABELS.flatMap((label) => {
      const count = counts[label] ?? 0
      if (!count) return []
      const height = (count / tallest) * HEIGHT
      y -= height
      return [
        <rect
          key={label}
          x={x}
          y={y}
          width={width}
          height={height}
          fill={stickerColors[label] ?? '#888'}
        >
          <title>{`${label}: ${count}`}</title>
        </rect>,
      ]
    })
  }
  return (
    <svg
      class="hue-histogram"
      viewBox={`0 0 ${WIDTH + GAP + NEUTRAL_WIDTH} ${HEIGHT + 14}`}
      role="img"
      aria-label="Sticker hues: stickers by hue, colored as they ended up"
    >
      <g>
        {bins.map((counts, i) => (
          <g key={i}>{stack(counts, i * barWidth, barWidth)}</g>
        ))}
        {Object.entries(STICKER_COLORS)
          .filter(([label]) => label !== 'W')
          .map(([label, rgb]) => {
            const x = (rgbToOKLCH(rgb).h / 360) * WIDTH
            return (
              <g key={label}>
                <line
                  class="hue-histogram-stroke"
                  x1={x}
                  x2={x}
                  y1={0}
                  y2={HEIGHT + 4}
                >
                  <title>{`Standard ${label}`}</title>
                </line>
                <circle
                  class="hue-histogram-mark"
                  cx={x}
                  cy={HEIGHT + 7}
                  r={3}
                  fill={stickerColors[label] ?? '#888'}
                />
              </g>
            )
          })}
      </g>
      <g transform={`translate(${WIDTH + GAP} 0)`}>
        {stack(neutral, 0, NEUTRAL_WIDTH)}
        <text x={NEUTRAL_WIDTH / 2} y={HEIGHT + 11} text-anchor="middle">
          gray
        </text>
      </g>
    </svg>
  )
}
