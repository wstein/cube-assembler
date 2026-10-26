import { suspectLabels } from '../../core/color/PaletteDisagreement.gen'
import type { FaceCaptureData } from './captureTypes'

// The captured faces with the stickers the reference palette reads
// differently (see PaletteDisagreement) added as look-alikes, so the color
// review and the cube check flag them like any other doubtful sticker. The
// faces are returned untouched unless the disagreement is widespread.
export function withPaletteSuspects(
  captured: Record<string, FaceCaptureData>,
  order: readonly string[],
): Record<string, FaceCaptureData> {
  if (!order.every((key) => captured[key]?.cellColors)) return captured
  const suspects = suspectLabels(
    order.map((key) => ({
      cellColors: captured[key].cellColors!,
      colors: captured[key].colors,
      palette: captured[key].previewColorProfile?.colors,
    })),
  )
  if (suspects.every((face) => face === undefined)) return captured
  const result = { ...captured }
  order.forEach((key, i) => {
    const labels = suspects[i]
    if (!labels) return
    result[key] = {
      ...captured[key],
      cellLookalikes: labels.map((row, r) =>
        row.map((label, c) => captured[key].cellLookalikes?.[r]?.[c] ?? label),
      ),
    }
  })
  return result
}
