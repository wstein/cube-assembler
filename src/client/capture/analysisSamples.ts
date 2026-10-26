import { miniNet, netCells, type NetCell } from './approvalPhotos'
import type { LocatedSample } from './hueScatter'
import type { FaceCaptureData } from './captureTypes'

// Every captured sticker for the color analysis: its measured color, the
// color it ended up as and where it is, the net cell it shows in, and the
// net itself. The net is null while the photos do not fit together.
export function analysisSamples(
  captured: Record<string, FaceCaptureData>,
  order: readonly string[],
  size: number,
  labelOf: (key: string) => string,
) {
  const items = miniNet(captured, [...order], size)
  const cellsBySlot = netCells(items, size)
  const samples: LocatedSample[] = []
  const cells: Array<NetCell | undefined> = []
  order.forEach((key, slot) => {
    const face = captured[key]
    const name = items.find((item) => item.slot === slot)?.name ?? labelOf(key)
    ;(face?.cellColors ?? []).forEach((row, r) =>
      row.forEach((rgb, c) => {
        samples.push({
          rgb,
          label: face.colors[r][c],
          where: `${name}, row ${r + 1}, column ${c + 1}`,
        })
        cells.push(cellsBySlot?.[slot]?.[r * size + c])
      }),
    )
  })
  const netFaces = cellsBySlot
    ? Object.fromEntries(items.map((item) => [item.key, item.colors]))
    : null
  // The photo behind each net face, upright in its place.
  const photos = cellsBySlot
    ? Object.fromEntries(
        items.map((item) => [
          item.key,
          {
            image: captured[order[item.slot]]?.croppedImage,
            turns: item.turns,
          },
        ]),
      )
    : undefined
  return { samples, cells, netFaces, photos }
}
