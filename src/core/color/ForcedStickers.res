// What the equal share per color hides. The final colors give every color
// the same number of stickers, so a color the camera misread (white read as
// blue or orange) still shows its full count. Reading each sticker on its
// own, against the mean reading of each final color, shows where the balance
// moved a sticker.
open StickerGeometry

type reading = {color: string, count: int}
type forced = {color: string, count: int, readAs: array<reading>}
type result = {guesses: array<string>, forced: array<forced>, moved: int}

let warnMoved = 3

let meanReadings = (samples: array<HueScatter.sample>) => {
  let sums: Dict.t<(float, float, float, float)> = Dict.make()
  samples->Array.forEach(({rgb, label}) => {
    let (r, g, b, n) = sums->Dict.get(label)->Option.getOr((0.0, 0.0, 0.0, 0.0))
    sums->Dict.set(label, (r +. rgb.r, g +. rgb.g, b +. rgb.b, n +. 1.0))
  })
  sums
  ->Dict.toArray
  ->Array.map(((label, (r, g, b, n))) => (label, {r: r /. n, g: g /. n, b: b /. n}))
  ->Dict.fromArray
}

let countBy = (items: array<string>) => {
  let counts: Dict.t<int> = Dict.make()
  items->Array.forEach(item => counts->Dict.set(item, counts->Dict.get(item)->Option.getOr(0) + 1))
  counts
  ->Dict.toArray
  ->Array.map(((color, count)) => {color, count})
  ->Array.toSorted((a, b) => Int.toFloat(b.count - a.count))
}

let firstGuesses = (samples: array<HueScatter.sample>) => {
  let palette = meanReadings(samples)
  let guesses =
    samples->Array.map(sample => ColorMath.classifySticker(sample.rgb, Some(palette)).color)
  let movedIn: Dict.t<array<string>> = Dict.make()
  let moved = ref(0)
  samples->Array.forEachWithIndex((sample, i) => {
    let guess = guesses->Array.getUnsafe(i)
    if guess != sample.label {
      moved := moved.contents + 1
      let own = movedIn->Dict.get(sample.label)->Option.getOr([])
      movedIn->Dict.set(sample.label, Array.concat(own, [guess]))
    }
  })
  let forced =
    movedIn
    ->Dict.toArray
    ->Array.map(((color, guessed)) => {
      color,
      count: Array.length(guessed),
      readAs: countBy(guessed),
    })
    ->Array.toSorted((a, b) => Int.toFloat(b.count - a.count))
  {guesses, forced, moved: moved.contents}
}
