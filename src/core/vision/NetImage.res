// Reads a picture of a cube net (a screenshot or an export): the cross with U
// above F and L F R B in a row, D below F, for 2x2 to 7x7. Stickers are the
// bright shapes the dark gaps, lines and panels leave; the cross' columns and
// rows tell the size, and the six colors found are named by the faces'
// centers (odd cubes) or by the nearest standard color (even cubes).

@genType
type netRead =
  | @as("read") Read({size: int, facelets: string})
  | @as("unreadable") Unreadable({message: string})

type ints
@new external makeInts: int => ints = "Int32Array"
@get_index external intAt: (ints, int) => int = ""
@set_index external setInt: (ints, int, int) => unit = ""

// Stickers of different colors differ by more than this (RGB distance).
let sameColor = 45.0
let maxSize = 7

type component = {
  mutable area: int,
  mutable minX: int,
  mutable maxX: int,
  mutable minY: int,
  mutable maxY: int,
}

// Gaps, lines, panels and transparent areas: no channel above this.
let isDark = (data, p) =>
  Pixels.get(data, p * 4 + 3) < 128 ||
    Math.Int.max(
      Pixels.get(data, p * 4),
      Math.Int.max(Pixels.get(data, p * 4 + 1), Pixels.get(data, p * 4 + 2)),
    ) < 60

// The connected bright areas, four-connected.
let components = (data, width, height) => {
  let total = width * height
  let seen = makeInts(total)
  let stack = makeInts(total)
  let found = []
  for start in 0 to total - 1 {
    if intAt(seen, start) == 0 && !isDark(data, start) {
      let comp = {area: 0, minX: width, maxX: 0, minY: height, maxY: 0}
      let top = ref(1)
      setInt(stack, 0, start)
      setInt(seen, start, 1)
      let visit = q =>
        if intAt(seen, q) == 0 && !isDark(data, q) {
          setInt(seen, q, 1)
          setInt(stack, top.contents, q)
          top := top.contents + 1
        }
      while top.contents > 0 {
        top := top.contents - 1
        let p = intAt(stack, top.contents)
        let x = mod(p, width)
        let y = p / width
        comp.area = comp.area + 1
        comp.minX = Math.Int.min(comp.minX, x)
        comp.maxX = Math.Int.max(comp.maxX, x)
        comp.minY = Math.Int.min(comp.minY, y)
        comp.maxY = Math.Int.max(comp.maxY, y)
        if x > 0 {
          visit(p - 1)
        }
        if x < width - 1 {
          visit(p + 1)
        }
        if y > 0 {
          visit(p - width)
        }
        if y < height - 1 {
          visit(p + width)
        }
      }
      found->Array.push(comp)
    }
  }
  found
}

let boxWidth = c => c.maxX - c.minX + 1
let boxHeight = c => c.maxY - c.minY + 1

// Square-ish, filled shapes big enough to be a sticker.
let looksLikeSticker = c => {
  let w = Int.toFloat(boxWidth(c))
  let h = Int.toFloat(boxHeight(c))
  c.area >= 36 && w /. h > 0.7 && w /. h < 1.4 && Int.toFloat(c.area) /. (w *. h) > 0.6
}

// The sticker size: the area most shapes share, within a quarter.
let referenceArea = candidates => {
  let best = ref(0)
  let bestCount = ref(0)
  candidates->Array.forEach(c => {
    let own = Int.toFloat(c.area)
    let count =
      candidates
      ->Array.filter(other => {
        let a = Int.toFloat(other.area)
        a >= own *. 0.8 && a <= own *. 1.25
      })
      ->Array.length
    if count > bestCount.contents {
      best := c.area
      bestCount := count
    }
  })
  best.contents
}

let centerX = c => Int.toFloat(c.minX + c.maxX) /. 2.0
let centerY = c => Int.toFloat(c.minY + c.maxY) /. 2.0

// Positions that lie within `tolerance` of each other are one line; their
// centers in order.
let lines = (positions, tolerance) => {
  let sorted = positions->Array.toSorted((a, b) => a -. b)
  let groups: array<array<float>> = []
  sorted->Array.forEach(position =>
    switch groups->Array.get(Array.length(groups) - 1) {
    | Some(group) if position -. group->Array.getUnsafe(Array.length(group) - 1) <= tolerance =>
      group->Array.push(position)
    | _ => groups->Array.push([position])
    }
  )
  groups->Array.map(group =>
    group->Array.reduce(0.0, (sum, v) => sum +. v) /. Int.toFloat(Array.length(group))
  )
}

let lineIndex = (centers, position) => {
  let best = ref(0)
  centers->Array.forEachWithIndex((center, i) => {
    if (
      Math.abs(center -. position) < Math.abs(centers->Array.getUnsafe(best.contents) -. position)
    ) {
      best := i
    }
  })
  best.contents
}

type rgb = (float, float, float)

// The mean color of the middle of a sticker, clear of its edge and of any
// outline or mark.
let stickerColor = (data, width, c): rgb => {
  let w = boxWidth(c)
  let h = boxHeight(c)
  let x0 = c.minX + w * 3 / 10
  let x1 = c.maxX - w * 3 / 10
  let y0 = c.minY + h * 3 / 10
  let y1 = c.maxY - h * 3 / 10
  let r = ref(0.0)
  let g = ref(0.0)
  let b = ref(0.0)
  let count = ref(0.0)
  for y in y0 to y1 {
    for x in x0 to x1 {
      let i = (y * width + x) * 4
      r := r.contents +. Int.toFloat(Pixels.get(data, i))
      g := g.contents +. Int.toFloat(Pixels.get(data, i + 1))
      b := b.contents +. Int.toFloat(Pixels.get(data, i + 2))
      count := count.contents +. 1.0
    }
  }
  (r.contents /. count.contents, g.contents /. count.contents, b.contents /. count.contents)
}

let distance = ((r1, g1, b1): rgb, (r2, g2, b2): rgb) => {
  let dr = r1 -. r2
  let dg = g1 -. g2
  let db = b1 -. b2
  Math.sqrt(dr *. dr +. dg *. dg +. db *. db)
}

// Which of the six colors each color belongs to: the nearest representative
// within `sameColor`, else a new one.
let groupColors = (colors: array<rgb>) => {
  let reps: array<rgb> = []
  let ids = colors->Array.map(color => {
    let found = ref(-1)
    reps->Array.forEachWithIndex((rep, i) => {
      if found.contents < 0 && distance(rep, color) < sameColor {
        found := i
      }
    })
    if found.contents < 0 {
      reps->Array.push(color)
      Array.length(reps) - 1
    } else {
      found.contents
    }
  })
  (ids, reps)
}

// The standard colors W O G R B Y as a net draws them; even cubes have no
// centers, so their color groups are named by these.
let standardColors: array<(string, rgb)> = [
  ("W", (252.0, 252.0, 250.0)),
  ("O", (242.0, 150.0, 55.0)),
  ("G", (80.0, 185.0, 100.0)),
  ("R", (205.0, 50.0, 55.0)),
  ("B", (46.0, 90.0, 220.0)),
  ("Y", (248.0, 225.0, 70.0)),
]

let rec permutations = items =>
  switch Array.length(items) {
  | 0 | 1 => [items]
  | _ =>
    items
    ->Array.mapWithIndex((item, i) => {
      let rest = items->Array.filterWithIndex((_, j) => j != i)
      permutations(rest)->Array.map(tail => Array.concat([item], tail))
    })
    ->Array.flat
  }

// The letters for the six color groups: the assignment with the least total
// distance to the standard colors.
let nameByStandard = (reps: array<rgb>) => {
  let best = ref(Float.Constants.positiveInfinity)
  let names = ref([])
  permutations(Array.fromInitializer(~length=6, i => i))->Array.forEach(order => {
    let total =
      order
      ->Array.mapWithIndex((standard, group) => {
        let (_, color) = standardColors->Array.getUnsafe(standard)
        let d = distance(reps->Array.getUnsafe(group), color)
        d *. d
      })
      ->Array.reduce(0.0, (sum, v) => sum +. v)
    if total < best.contents {
      best := total
      names := order->Array.map(standard => Pair.first(standardColors->Array.getUnsafe(standard)))
    }
  })
  names.contents
}

let faceNames = ["U", "R", "F", "D", "L", "B"]
// The cross: the face at each block (column, row), as an index into faceNames.
let faceAt = (blockColumn, blockRow) =>
  switch (blockColumn, blockRow) {
  | (1, 0) => Some(0)
  | (2, 1) => Some(1)
  | (1, 1) => Some(2)
  | (1, 2) => Some(3)
  | (0, 1) => Some(4)
  | (3, 1) => Some(5)
  | _ => None
  }

let unreadable = message => Unreadable({message: message})

let readNetImage = (data: Uint8ClampedArray.t, width: int, height: int): netRead => {
  let all = components(data, width, height)
  let candidates = all->Array.filter(looksLikeSticker)
  if Array.length(candidates) < 24 || Array.length(candidates) > 4000 {
    unreadable("No cube net found in the picture.")
  } else {
    let area = Int.toFloat(referenceArea(candidates))
    let stickers = candidates->Array.filter(c => {
      let a = Int.toFloat(c.area)
      a >= area *. 0.6 && a <= area *. 1.5
    })
    let tolerance = Math.sqrt(area) *. 0.5
    let columns = lines(stickers->Array.map(centerX), tolerance)
    let rows = lines(stickers->Array.map(centerY), tolerance)
    let size = Array.length(columns) / 4
    if (
      mod(Array.length(columns), 4) != 0 ||
      size < 2 ||
      size > maxSize ||
      Array.length(rows) != 3 * size ||
      Array.length(stickers) != 6 * size * size
    ) {
      unreadable(
        `Found ${Int.toString(Array.length(stickers))} stickers in ${Int.toString(
            Array.length(columns),
          )} columns and ${Int.toString(
            Array.length(rows),
          )} rows; a net of a 2x2 to 7x7 cube has 6 faces of n x n in a cross.`,
      )
    } else {
      // Each sticker's face and place in it.
      let slots: array<option<(int, int)>> = stickers->Array.map(c => {
        let column = lineIndex(columns, centerX(c))
        let row = lineIndex(rows, centerY(c))
        faceAt(column / size, row / size)->Option.map(face => (
          face,
          mod(row, size) * size + mod(column, size),
        ))
      })
      let colors = stickers->Array.map(c => stickerColor(data, width, c))
      let (groupOf, reps) = groupColors(colors)
      let cells = Array.make(~length=6 * size * size, -1)
      let placed = ref(true)
      slots->Array.forEachWithIndex((slot, i) =>
        switch slot {
        | Some((face, place)) =>
          if cells->Array.getUnsafe(face * size * size + place) >= 0 {
            placed := false
          }
          cells->Array.setUnsafe(face * size * size + place, groupOf->Array.getUnsafe(i))
        | None => placed := false
        }
      )
      if !placed.contents || Array.length(reps) != 6 {
        unreadable(
          Array.length(reps) != 6
            ? `Found ${Int.toString(Array.length(reps))} colors; a cube has 6.`
            : "The stickers do not form a cross of six faces.",
        )
      } else {
        let centers =
          faceNames->Array.mapWithIndex((_, face) =>
            cells->Array.getUnsafe(face * size * size + size / 2 * size + size / 2)
          )
        let odd = mod(size, 2) == 1
        let names = if odd {
          let letters = Array.make(~length=6, "?")
          centers->Array.forEachWithIndex((group, face) =>
            letters->Array.setUnsafe(group, faceNames->Array.getUnsafe(face))
          )
          letters
        } else {
          nameByStandard(reps)
        }
        let distinct =
          !odd ||
          centers
          ->Array.toSorted((a, b) => Int.toFloat(a - b))
          ->Array.mapWithIndex((group, i) => group == i)
          ->Array.every(ok => ok)
        if !distinct {
          unreadable("The six face centers are not six different colors.")
        } else {
          let facelets =
            faceNames
            ->Array.mapWithIndex((_, face) =>
              Array.fromInitializer(~length=size * size, i =>
                names->Array.getUnsafe(cells->Array.getUnsafe(face * size * size + i))
              )->Array.join("")
            )
            ->Array.join(" ")
          Read({size, facelets})
        }
      }
    }
  }
}
