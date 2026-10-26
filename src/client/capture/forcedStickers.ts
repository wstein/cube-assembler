import {
  firstGuesses,
  warnMoved as WARN_MOVED,
} from '../../core/color/ForcedStickers.gen'
import type { FaceCaptureData } from './captureTypes'

export { firstGuesses, WARN_MOVED }
export type {
  forced as Forced,
  result as FirstGuesses,
} from '../../core/color/ForcedStickers.gen'

// The first guess of every sticker of the captured faces, face by face as
// photographed: `forced` marks the stickers the equal color share moved, and
// `warn` says there are enough of them to be a misread, not noise.
export function forcedReading(
  captured: Record<string, FaceCaptureData>,
  order: readonly string[],
) {
  const samples = order.flatMap((key) =>
    (captured[key]?.cellColors ?? []).flatMap((row, r) =>
      row.map((rgb, c) => ({ rgb, label: captured[key].colors[r][c] })),
    ),
  )
  const result = firstGuesses(samples)
  let next = 0
  const faces: Record<string, { guess: string[][]; forced: boolean[][] }> = {}
  for (const key of order) {
    const cells = captured[key]?.cellColors
    if (!cells) continue
    const guess = cells.map((row) => row.map(() => result.guesses[next++]))
    faces[key] = {
      guess,
      forced: guess.map((row, r) =>
        row.map((color, c) => color !== captured[key].colors[r][c]),
      ),
    }
  }
  return { result, faces, warn: result.moved >= WARN_MOVED }
}

// The one sentence for the colors the balance filled up: "5 stickers were
// moved to white; on their own they read as 3 blue, 2 orange."
export function forcedSentence(
  forced: Array<{
    color: string
    count: number
    readAs: Array<{ color: string; count: number }>
  }>,
  names: Record<string, string>,
): string {
  const name = (color: string) => (names[color] ?? color).toLowerCase()
  const [top] = forced
  if (!top) return ''
  const total = forced.reduce((n, f) => n + f.count, 0)
  const reads = top.readAs.map((r) => `${r.count} ${name(r.color)}`).join(', ')
  const more =
    total > top.count
      ? ` ${total - top.count} more stickers were moved to other colors.`
      : ''
  return `${top.count} sticker${top.count === 1 ? ' was' : 's were'} moved to ${name(top.color)}; on their own they read as ${reads}.${more}`
}
