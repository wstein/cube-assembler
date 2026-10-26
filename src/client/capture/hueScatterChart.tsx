import { HUE_CUT, hueScatter, type HueSample } from './hueScatter'

const WIDTH = 360
const HEIGHT = 150
const GRAY_WIDTH = 44
const GAP = 14
const LEFT = 18
const BOTTOM = 18
// Lightness shown: below this no sticker sits, above 1 nothing can.
const L_MIN = 0.3

// A dot is drawn in the pure color of its hue, so the clouds read as colors
// whatever the photo's tint.
const hueColor = (axis: number) => `oklch(0.7 0.17 ${(axis + HUE_CUT) % 360})`

const x = (hue: number) => LEFT + (hue / 360) * WIDTH
const y = (l: number) => ((1 - l) / (1 - L_MIN)) * HEIGHT

// Each sticker as a dot by hue (across) and lightness (up), in the pure
// color of its hue. Red and orange share hues but orange is lighter, so
// they form two clouds. Pointing at a dot names the color it ended up as.
// Gray stickers (white) have no hue and stand in their own column.
export function HueScatterChart({ samples }: { samples: HueSample[] }) {
  const grayLeft = LEFT + WIDTH + GAP
  const points = hueScatter(samples)
  let grays = 0
  return (
    <svg
      class="hue-scatter"
      viewBox={`0 0 ${LEFT + WIDTH + GAP + GRAY_WIDTH} ${HEIGHT + BOTTOM}`}
      role="img"
      aria-label="Stickers by hue and lightness, colored as they ended up"
    >
      <rect
        class="hue-scatter-gray"
        x={grayLeft}
        y={0}
        width={GRAY_WIDTH}
        height={HEIGHT}
      />
      {points.map((point, i) => {
        const cx = point.neutral
          ? grayLeft + 6 + ((grays++ * 7) % (GRAY_WIDTH - 12))
          : x(point.hue)
        return (
          <circle
            key={i}
            class="hue-scatter-dot"
            cx={cx}
            cy={y(point.l)}
            r={3}
            fill={point.neutral ? '#9a9a9f' : hueColor(point.hue)}
          >
            <title>{`${point.label}`}</title>
          </circle>
        )
      })}
      <text x={LEFT + WIDTH / 2} y={HEIGHT + 13} text-anchor="middle">
        hue
      </text>
      <text x={grayLeft + GRAY_WIDTH / 2} y={HEIGHT + 13} text-anchor="middle">
        gray
      </text>
      <text x={4} y={10}>
        L
      </text>
    </svg>
  )
}
