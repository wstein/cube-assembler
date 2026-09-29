// Shared by the Colors tab's sections: the colors in display order, their
// names and a swatch of one color.
import { rgbToOklab, type RGB } from './imageProcessing'

export const ORDER = ['W', 'Y', 'R', 'O', 'G', 'B']
export const NAMES: Record<string, string> = {
  W: 'White',
  Y: 'Yellow',
  R: 'Red',
  O: 'Orange',
  G: 'Green',
  B: 'Blue',
}

export const css = (c: RGB) => `rgb(${c.r} ${c.g} ${c.b})`
export const hex = (c: RGB) =>
  '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')
const ink = (c: RGB) => (rgbToOklab(c).l > 0.68 ? '#17171b' : '#ffffff')

export function Swatch({
  color,
  letter,
  class: cls = 'color-review-chip',
}: {
  color: RGB
  letter?: string
  class?: string
}) {
  return (
    <span
      class={cls}
      style={{ background: css(color), color: ink(color) }}
      title={hex(color)}
    >
      {letter}
    </span>
  )
}
