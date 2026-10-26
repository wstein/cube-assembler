import { hueAxis, hueScatter, type HueSample } from './hueScatter'
import { rgbToOKLCH } from '../vision/colorMath'
import { STICKER_COLORS } from '../vision/stickerColorGeometry'

const WIDTH = 360
const HEIGHT = 150
const GRAY_WIDTH = 44
const GAP = 14
const LEFT = 18
const BOTTOM = 18
// Lightness shown: below this no sticker sits, above 1 nothing can.
const L_MIN = 0.3

const css = (c: { r: number; g: number; b: number }) =>
  `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)})`

const x = (hue: number) => LEFT + (hue / 360) * WIDTH
const y = (l: number) => ((1 - l) / (1 - L_MIN)) * HEIGHT

// Each sticker as a dot by hue (across) and lightness (up), in its measured
// color and outlined in the color it ended up with. Red and orange share hues but orange is lighter, so they
// form two clouds; two colors in one cloud are the ones that get mixed up.
// Gray stickers (white) have no hue and stand in their own column. The rings
// mark where the standard palette expects each color (drawn in the display
// color, not the standard's pure one).
export function HueScatterChart({
  samples,
  stickerColors,
}: {
  samples: HueSample[]
  stickerColors: Record<string, string>
}) {
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
            fill={css(samples[i].rgb)}
            stroke={stickerColors[point.label] ?? '#888'}
          >
            <title>{point.label}</title>
          </circle>
        )
      })}
      {Object.entries(STICKER_COLORS).map(([label, rgb]) => {
        const lch = rgbToOKLCH(rgb)
        const neutral = label === 'W'
        return (
          <circle
            key={label}
            class="hue-scatter-ring"
            cx={neutral ? grayLeft + GRAY_WIDTH / 2 : x(hueAxis(lch.h))}
            cy={y(lch.l)}
            r={5}
            fill={stickerColors[label] ?? '#888'}
          >
            <title>{`Standard ${label}`}</title>
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
