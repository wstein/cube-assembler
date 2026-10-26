@genType
type reading = {color: string, count: int}

// The stickers the color balance forced into `color`: how many, and which
// color each would have been on its own.
@genType
type forced = {color: string, count: int, readAs: array<reading>}

@genType
type result = {
  // Each sticker's color on its own: the nearest of the colors' mean
  // readings, with no equal share per color enforced.
  guesses: array<string>,
  forced: array<forced>,
  moved: int,
}

// A valid cube moved at most 2 stickers across the saved captures; this many
// is where the balance is hiding a misread.
@genType let warnMoved: int
@genType let firstGuesses: array<HueScatter.sample> => result
